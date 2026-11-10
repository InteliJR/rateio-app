import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';
import { FakeOcrDb, deferred, flush } from './ocr-fake-db.testing-spec';

/**
 * Lock vencido na fila de OCR, contra um banco FALSO e um ledger FALSO em memória.
 *
 * O QUE ESTES TESTES PROVAM: um job RUNNING com lock vencido e tentativas
 * esgotadas vira FAILED (não volta ao laço); com tentativas sobrando volta a
 * PENDING; a escrita é condicional, então vários crons geram uma única
 * transição, uma única linha de métrica e uma única liquidação; o resultado
 * tardio da execução lenta é descartado sem tocar conta, itens nem crédito; e
 * com a cobrança desligada o ledger nunca é chamado e o estado do banco é o
 * mesmo do caso ligado (exceto o ledger).
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): o entrelaçamento real entre o
 * `persistOcrResult` tardio e o FAILED do lock vencido (reavaliação do WHERE sob
 * row lock), nem o isolamento das transações. NÃO VALIDADO em Postgres real.
 */
describe('OcrQueueService: lock vencido (banco e ledger falsos)', () => {
  const USER = 'user-1';
  const OLD_KEY = 'bills/user-1/old.jpg';
  const NEW_KEY = 'bills/user-1/new.jpg';
  const LOCK_MS = 120_000;
  const EXPIRED_MS = 10 * 60_000;

  let db: FakeOcrDb;
  let credits: ReturnType<FakeOcrDb['fakeCredits']>;
  let ocrService: { processImage: jest.Mock };
  let metrics: Record<string, jest.Mock>;
  let queue: any;
  let logs: string[];

  const okResult = () => ({
    rawText: 'texto bruto de teste suficientemente longo',
    source: 'MODEL_JSON',
    establishmentName: 'Bar do Teste',
    totalAmount: 10,
    items: [
      {
        name: 'Item do OCR',
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 10,
        totalPrice: 10,
      },
    ],
  });

  const newQueue = (
    flag: string | undefined,
    env: Record<string, string> = {},
  ) => {
    process.env.OCR_QUEUE_MAX_JOBS_PER_RUN = '1';
    process.env.OCR_QUEUE_RETRY_DELAY_MS = '0';
    process.env.OCR_QUEUE_LOCK_TIMEOUT_MS = String(LOCK_MS);
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
    Object.assign(process.env, env);
    if (flag === undefined) {
      delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    } else {
      process.env.CREDITS_ENFORCEMENT_ENABLED = flag;
    }

    const Ctor = OcrQueueService as unknown as new (...args: unknown[]) => any;
    return new Ctor(
      db.client(),
      ocrService,
      metrics,
      { isUsingS3: () => false, getSignedUrl: jest.fn() },
      credits,
    );
  };

  const build = (
    flag: string | undefined,
    env: Record<string, string> = {},
  ) => {
    queue = newQueue(flag, env);
  };

  /** Conta com imagem e job enfileirado (a reserva, se houver, é do próprio enqueue). */
  const seedEnqueued = async (target = queue, imageKey = OLD_KEY) => {
    const bill = db.addBill({ imageKey });
    await target.enqueue(bill.id, USER, { imageKey });
    const job = db.jobs.find((j) => j.billId === bill.id)!;
    return { bill, job };
  };

  /** Deixa o job como se uma execução tivesse sido reivindicada e travado. */
  const makeStale = (
    job: Record<string, any>,
    attempts: number,
    lockAgeMs = EXPIRED_MS,
  ) => {
    const startedAt = new Date(Date.now() - lockAgeMs - 500);
    Object.assign(job, {
      status: OcrJobStatus.RUNNING,
      attempts,
      lockedAt: new Date(Date.now() - lockAgeMs),
      startedAt,
      availableAt: new Date(startedAt.getTime() - 2_000),
    });
  };

  const releaseStale = () => queue.releaseStaleLocks();

  beforeEach(() => {
    db = new FakeOcrDb();
    db.grantCredits(USER, 3);
    credits = db.fakeCredits();
    ocrService = { processImage: jest.fn().mockResolvedValue(okResult()) };
    metrics = {
      recordOcrQueued: jest.fn(),
      recordOcrStarted: jest.fn(),
      recordOcrCompleted: jest.fn(),
      recordOcrRetry: jest.fn(),
      recordOcrFailed: jest.fn(),
    };
    logs = [];
    const capture = (message: unknown) => {
      logs.push(String(message));
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
    build('true');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
    delete process.env.OCR_QUEUE_LOCK_TIMEOUT_MS;
    delete process.env.OCR_QUEUE_MAX_JOBS_PER_RUN;
    delete process.env.OCR_QUEUE_RETRY_DELAY_MS;
  });

  describe('tentativas esgotadas (attempts >= maxAttempts)', () => {
    it('vira FAILED com código fixo, a conta vai a OCR_FAILED e nada é lido de novo', async () => {
      const { bill, job } = await seedEnqueued();
      makeStale(job, 3);

      await releaseStale();

      expect(job).toMatchObject({
        status: OcrJobStatus.FAILED,
        attempts: 3, // o token da execução não muda
        lockedAt: null,
        lastError: 'OCR_LOCK_EXPIRED_EXHAUSTED',
      });
      expect(job.finishedAt).toBeInstanceOf(Date);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);

      await queue.processPendingJobs();
      expect(ocrService.processImage).not.toHaveBeenCalled();
    });

    it('grava UMA linha FAILED_FINAL / EXHAUSTED, sem modelo, tokens nem custo', async () => {
      const { job } = await seedEnqueued();
      makeStale(job, 3);

      await releaseStale();

      expect(db.runMetrics).toHaveLength(1);
      expect(db.runMetrics[0]).toMatchObject({
        ocrJobId: job.id,
        attempt: 3,
        outcome: 'FAILED_FINAL',
        errorCategory: 'EXHAUSTED',
        model: null,
        openaiMs: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        estimatedCostUsd: null,
        items: null,
        queueWaitMs: 2_000,
      });
      expect(db.runMetrics[0].totalMs).toBeGreaterThanOrEqual(EXPIRED_MS);
      expect(metrics.recordOcrFailed).toHaveBeenCalledTimes(1);
    });

    it('libera o crédito UMA vez, com o motivo fixo OCR_FAILED_EXHAUSTED', async () => {
      const { job } = await seedEnqueued();
      expect(db.availableCredits(USER)).toBe(2);
      makeStale(job, 3);

      await releaseStale();
      await releaseStale();

      expect(credits.release).toHaveBeenCalledTimes(1);
      expect(credits.release).toHaveBeenCalledWith(
        job.id,
        'OCR_FAILED_EXHAUSTED',
      );
      expect(credits.consume).not.toHaveBeenCalled();
      expect(db.availableCredits(USER)).toBe(3);
      expect(db.runMetrics).toHaveLength(1);
    });

    it('usa a chave da execução de cobrança (jobId:n) quando o job foi recriado', async () => {
      const { job } = await seedEnqueued();
      job.creditRun = 2;
      db.creditReservations[0].ocrJobId = `${job.id}:2`;
      makeStale(job, 3);

      await releaseStale();

      expect(credits.release).toHaveBeenCalledWith(
        `${job.id}:2`,
        'OCR_FAILED_EXHAUSTED',
      );
    });

    it('conta fora de PENDING_OCR: o job falha, a conta e os itens ficam como estão, o crédito é liberado', async () => {
      const { bill, job } = await seedEnqueued();
      bill.status = BillStatus.DIVIDING;
      const edited = db.addItem(bill.id, { name: 'Item editado pelo usuário' });
      makeStale(job, 3);

      await releaseStale();

      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.DIVIDING);
      expect(db.items).toEqual([edited]);
      expect(credits.release).toHaveBeenCalledTimes(1);
    });

    it('imagem trocada durante a leitura: o job volta à fila com a imagem nova e o crédito NÃO é liberado', async () => {
      const { bill, job } = await seedEnqueued();
      bill.imageKey = NEW_KEY; // a conta já aponta para outra imagem
      makeStale(job, 3);

      await releaseStale();

      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        imageKey: NEW_KEY,
        lockedAt: null,
      });
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(credits.release).not.toHaveBeenCalled();
      expect(db.creditReservations[0].status).toBe('HELD');
      // a execução perdida falhou de verdade: a linha de métrica existe
      expect(db.runMetrics).toHaveLength(1);
      expect(db.runMetrics[0]).toMatchObject({
        outcome: 'FAILED_FINAL',
        errorCategory: 'EXHAUSTED',
      });
    });

    it('o laço é limitado: uma execução que nunca termina é reivindicada no máximo maxAttempts vezes', async () => {
      const { bill, job } = await seedEnqueued();

      // Simula processos que morrem no meio da leitura, rodada após rodada
      let claims = 0;
      for (let round = 0; round < 8; round += 1) {
        const claimed = await queue.claimNextJob();
        if (!claimed) break;
        claims += 1;
        job.lockedAt = new Date(Date.now() - EXPIRED_MS);
        await releaseStale();
      }

      expect(claims).toBe(3);
      expect(job).toMatchObject({
        status: OcrJobStatus.FAILED,
        attempts: 3,
        lastError: 'OCR_LOCK_EXPIRED_EXHAUSTED',
      });
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(ocrService.processImage).not.toHaveBeenCalled();
      expect(credits.release).toHaveBeenCalledTimes(1);
      // TIMEOUT nas duas primeiras (voltaram à fila) e EXHAUSTED na terceira
      expect(
        db.runMetrics.map((r) => [r.attempt, r.outcome, r.errorCategory]),
      ).toEqual([
        [1, 'RETRY_SCHEDULED', 'TIMEOUT'],
        [2, 'RETRY_SCHEDULED', 'TIMEOUT'],
        [3, 'FAILED_FINAL', 'EXHAUSTED'],
      ]);
    });

    it('respeita OCR_QUEUE_MAX_ATTEMPTS: com 1 tentativa, o primeiro lock vencido já falha', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { job } = await seedEnqueued();
      makeStale(job, 1);

      await releaseStale();

      expect(job.status).toBe(OcrJobStatus.FAILED);
    });
  });

  describe('ainda restam tentativas (attempts < maxAttempts)', () => {
    it('volta a PENDING como sempre e grava uma linha TIMEOUT / RETRY_SCHEDULED', async () => {
      const { bill, job } = await seedEnqueued();
      makeStale(job, 2);

      await releaseStale();

      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 2,
        lockedAt: null,
        lastError: 'OCR job lock expired; returned to queue.',
      });
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(credits.release).not.toHaveBeenCalled();
      expect(db.runMetrics).toHaveLength(1);
      expect(db.runMetrics[0]).toMatchObject({
        attempt: 2,
        outcome: 'RETRY_SCHEDULED',
        errorCategory: 'TIMEOUT',
        model: null,
        promptTokens: null,
        estimatedCostUsd: null,
      });
    });

    it('a próxima execução reaproveita a reserva e consome uma vez', async () => {
      const { bill, job } = await seedEnqueued();
      makeStale(job, 2);
      await releaseStale();

      await queue.processPendingJobs();

      expect(job).toMatchObject({
        status: OcrJobStatus.COMPLETED,
        attempts: 3,
      });
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledTimes(1);
      expect(credits.release).not.toHaveBeenCalled();
    });

    it('as linhas do lock vencido podem repetir o attempt de outra linha: distinguir por outcome', async () => {
      const { job } = await seedEnqueued();
      const gate = deferred<any>();
      ocrService.processImage.mockReturnValueOnce(gate.promise);

      const run = queue.processPendingJobs();
      await flush();
      expect(job.attempts).toBe(1);

      job.lockedAt = new Date(Date.now() - EXPIRED_MS);
      await releaseStale(); // grava TIMEOUT com attempt 1 (o job voltou a PENDING)
      gate.resolve(okResult()); // ninguém reivindicou: o resultado já pago é aceito
      await run;

      // duas linhas com attempt 1 para o MESMO job
      const attemptOne = db.runMetrics.filter((r) => r.attempt === 1);
      expect(attemptOne.map((r) => r.outcome).sort()).toEqual([
        'COMPLETED',
        'RETRY_SCHEDULED',
      ]);
      expect(job.status).toBe(OcrJobStatus.COMPLETED);
    });
  });

  describe('fronteira do lock', () => {
    const NOW = 1_800_000_000_000;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    it.each([[3], [2]])(
      'lockedAt exatamente no limite NÃO está vencido (attempts=%i)',
      async (attempts) => {
        const { job } = await seedEnqueued();
        makeStale(job, attempts);
        job.lockedAt = new Date(NOW - LOCK_MS);

        await releaseStale();

        expect(job.status).toBe(OcrJobStatus.RUNNING);
        expect(db.runMetrics).toHaveLength(0);
        expect(credits.release).not.toHaveBeenCalled();
      },
    );

    it.each([
      [3, OcrJobStatus.FAILED],
      [2, OcrJobStatus.PENDING],
    ])(
      'lockedAt 1 ms além do limite está vencido (attempts=%i)',
      async (attempts, expected) => {
        const { job } = await seedEnqueued();
        makeStale(job, attempts);
        job.lockedAt = new Date(NOW - LOCK_MS - 1);

        await releaseStale();

        expect(job.status).toBe(expected);
      },
    );

    it('lock não vencido com tentativas esgotadas: o job não é tocado', async () => {
      const { bill, job } = await seedEnqueued();
      makeStale(job, 3, 1_000);

      await releaseStale();

      expect(job).toMatchObject({ status: OcrJobStatus.RUNNING, attempts: 3 });
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(db.runMetrics).toHaveLength(0);
      expect(credits.release).not.toHaveBeenCalled();
    });
  });

  describe('liberação concorrente única', () => {
    it('três crons ao mesmo tempo (duas instâncias): uma transição, uma linha, um release', async () => {
      const { bill, job } = await seedEnqueued();
      makeStale(job, 3);
      const other = newQueue('true');

      await Promise.all([
        queue.releaseStaleLocks(),
        other.releaseStaleLocks(),
        queue.releaseStaleLocks(),
      ]);

      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(db.runMetrics).toHaveLength(1);
      expect(credits.release).toHaveBeenCalledTimes(1);
      expect(metrics.recordOcrFailed).toHaveBeenCalledTimes(1);
    });

    it('a execução que terminou entre a consulta e a escrita não é derrubada', async () => {
      const { bill, job } = await seedEnqueued();
      makeStale(job, 3);
      const realFindMany = db.client().ocrJob.findMany;
      // Entre listar o job vencido e escrever, a execução termina com sucesso
      jest
        .spyOn(queue.prisma.ocrJob, 'findMany')
        .mockImplementationOnce(async (args: unknown) => {
          const rows = await realFindMany(args);
          Object.assign(job, {
            status: OcrJobStatus.COMPLETED,
            lockedAt: null,
          });
          bill.status = BillStatus.REVIEWING;
          return rows;
        });

      await releaseStale();

      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(db.runMetrics).toHaveLength(0);
      expect(credits.release).not.toHaveBeenCalled();
    });

    // Defesa em profundidade: na prática o `lockedAt` condicional já protege (um
    // claim novo renova o lock), mas a escrita também confere attempts e status.
    // Estes testes forçam o estado em que só esses dois campos protegem.
    describe.each([
      [
        'outra execução reivindicou o job (attempts mudou)',
        (job: Record<string, any>) => {
          job.attempts += 1;
        },
        OcrJobStatus.RUNNING,
      ],
      [
        'o job já não está RUNNING (status mudou)',
        (job: Record<string, any>) => {
          job.status = OcrJobStatus.PENDING;
        },
        OcrJobStatus.PENDING,
      ],
    ])('guarda da escrita: %s', (_label, change, expectedStatus) => {
      it.each([[3], [2]])(
        'depois da consulta o job não é tocado, nem métrica, nem crédito (attempts=%i)',
        async (attempts) => {
          const { bill, job } = await seedEnqueued();
          makeStale(job, attempts);
          const realFindMany = db.client().ocrJob.findMany;
          jest
            .spyOn(queue.prisma.ocrJob, 'findMany')
            .mockImplementationOnce(async (args: unknown) => {
              const rows = await realFindMany(args);
              change(job); // o lock continua parecendo vencido
              return rows;
            });

          await releaseStale();

          expect(job.status).toBe(expectedStatus);
          expect(job.lastError).toBeNull();
          expect(bill.status).toBe(BillStatus.PENDING_OCR);
          expect(db.runMetrics).toHaveLength(0);
          expect(credits.release).not.toHaveBeenCalled();
        },
      );
    });

    it('um job que falha ao ser tratado não impede os outros e só o nome do erro vai ao log', async () => {
      const first = await seedEnqueued();
      const second = await seedEnqueued(queue, NEW_KEY);
      makeStale(first.job, 3);
      makeStale(second.job, 3);

      const original = queue.expireStaleJob.bind(queue);
      jest
        .spyOn(queue, 'expireStaleJob')
        .mockImplementationOnce(async () => {
          throw new Error('SEGREDO-mensagem-crua');
        })
        .mockImplementation(original);

      await releaseStale();

      expect(first.job.status).toBe(OcrJobStatus.RUNNING); // tratado no próximo tick
      expect(second.job.status).toBe(OcrJobStatus.FAILED);
      expect(logs.join('\n')).toContain('STALE_LOCK_FAILED');
      expect(logs.join('\n')).not.toContain('SEGREDO-mensagem-crua');
    });
  });

  describe('resultado tardio da execução lenta é descartado', () => {
    /** Execução A em voo (única tentativa permitida) cujo lock vence. */
    const startSlowRun = async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill, job } = await seedEnqueued();
      const edited = db.addItem(bill.id, { name: 'Item já na conta' });
      const gate = deferred<any>();
      ocrService.processImage.mockReturnValueOnce(gate.promise);

      const run = queue.processPendingJobs();
      await flush();
      expect(job).toMatchObject({ status: OcrJobStatus.RUNNING, attempts: 1 });

      job.lockedAt = new Date(Date.now() - EXPIRED_MS);
      await releaseStale();
      expect(job.status).toBe(OcrJobStatus.FAILED);

      return { bill, job, edited, gate, run };
    };

    it('resultado com sucesso depois do FAILED: não mexe na conta, nos itens nem no crédito', async () => {
      const { bill, job, edited, gate, run } = await startSlowRun();

      gate.resolve(okResult());
      await run;

      expect(job).toMatchObject({
        status: OcrJobStatus.FAILED,
        lastError: 'OCR_LOCK_EXPIRED_EXHAUSTED',
      });
      expect(bill).toMatchObject({
        status: BillStatus.OCR_FAILED,
        ocrRawText: null,
        totalAmount: null,
      });
      expect(db.items).toEqual([edited]);
      expect(credits.consume).not.toHaveBeenCalled();
      expect(credits.release).toHaveBeenCalledTimes(1);
      expect(db.availableCredits(USER)).toBe(3);
      expect(metrics.recordOcrCompleted).not.toHaveBeenCalled();
      expect(db.runMetrics.map((r) => r.outcome).sort()).toEqual([
        'DISCARDED',
        'FAILED_FINAL',
      ]);
    });

    it('falha depois do FAILED: não agenda retentativa nem libera de novo', async () => {
      const { bill, job, gate, run } = await startSlowRun();

      gate.reject(new Error('falha tardia'));
      await run;

      expect(job).toMatchObject({
        status: OcrJobStatus.FAILED,
        lastError: 'OCR_LOCK_EXPIRED_EXHAUSTED',
      });
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(metrics.recordOcrRetry).not.toHaveBeenCalled();
      expect(credits.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('cobrança DESLIGADA: o ledger nunca é chamado e o banco fica igual', () => {
    /** Estado do banco sem ids, datas nem tempos (que mudam a cada execução). */
    const snapshot = () => ({
      jobs: db.jobs.map((j) => ({
        status: j.status,
        attempts: j.attempts,
        imageKey: j.imageKey,
        creditRun: j.creditRun,
        lastError: j.lastError,
        locked: j.lockedAt !== null,
      })),
      bills: db.bills.map((b) => ({ status: b.status, imageKey: b.imageKey })),
      items: db.items.length,
      runMetrics: db.runMetrics.map((r) => ({
        attempt: r.attempt,
        outcome: r.outcome,
        errorCategory: r.errorCategory,
        model: r.model,
        totalTokens: r.totalTokens,
        estimatedCostUsd: r.estimatedCostUsd,
      })),
    });

    /** Esgotado, com tentativas sobrando e com imagem trocada, na mesma rodada. */
    const scenario = async (flag: string | undefined) => {
      db = new FakeOcrDb();
      db.grantCredits(USER, 5);
      credits = db.fakeCredits();
      build(flag);

      const exhausted = await seedEnqueued(queue, 'bills/user-1/a.jpg');
      const retriable = await seedEnqueued(queue, 'bills/user-1/b.jpg');
      const changed = await seedEnqueued(queue, 'bills/user-1/c.jpg');
      makeStale(exhausted.job, 3);
      makeStale(retriable.job, 1);
      makeStale(changed.job, 3);
      changed.bill.imageKey = 'bills/user-1/c-nova.jpg';

      await releaseStale();
      return snapshot();
    };

    it.each([['false'], [undefined], ['']])(
      'bandeira %p: nenhuma chamada ao ledger',
      async (flag) => {
        await scenario(flag);

        expect(credits.reserve).not.toHaveBeenCalled();
        expect(credits.consume).not.toHaveBeenCalled();
        expect(credits.release).not.toHaveBeenCalled();
        expect(credits.getBalance).not.toHaveBeenCalled();
        expect(db.creditReservations).toHaveLength(0);
        expect(db.availableCredits(USER)).toBe(5);
        expect(logs.join('\n')).not.toContain('CREDIT_SETTLED');
      },
    );

    it('o estado do banco é o mesmo com a cobrança ligada e desligada (exceto o ledger)', async () => {
      const off = await scenario('false');
      const on = await scenario('true');

      expect(off).toEqual(on);
      // e o cenário fez de fato as três transições
      expect(off.jobs.map((j) => j.status)).toEqual([
        OcrJobStatus.FAILED,
        OcrJobStatus.PENDING,
        OcrJobStatus.PENDING,
      ]);
      expect(off.bills.map((b) => b.status)).toEqual([
        BillStatus.OCR_FAILED,
        BillStatus.PENDING_OCR,
        BillStatus.PENDING_OCR,
      ]);
      // com a cobrança ligada, só o ledger difere: uma devolução (a esgotada)
      expect(credits.release).toHaveBeenCalledTimes(1);
    });
  });
});
