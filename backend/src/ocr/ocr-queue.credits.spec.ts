import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';
import { FakeOcrDb } from './ocr-fake-db.testing-spec';
import { InsufficientCreditsError } from '../credits/credits.service';
import {
  OcrErrorCategoryName,
  attachOcrFailure,
  buildOcrFailure,
} from './ocr-error-category';

/**
 * Ligação da fila de OCR com o ledger de créditos, contra um banco FALSO e um
 * ledger FALSO em memória (ver ocr-fake-db.testing-spec.ts).
 *
 * Reescrito sobre o enqueue condicional (o original testava o `upsert` antigo).
 *
 * O QUE ESTES TESTES PROVAM: quando a fila reserva, consome e libera; que
 * retentativa, lock vencido e job reaproveitado não reservam de novo; que cada
 * recriação do job tem a sua chave; que falha do ledger depois do resultado
 * gravado não reprocessa nem altera job e métrica; e que com a cobrança
 * desligada o ledger nunca é chamado.
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): locks reais (FOR NO KEY UPDATE),
 * deadlock entre reservas do mesmo usuário, saldo nunca negativo e unicidade
 * sob concorrência real. NÃO VALIDADO em Postgres real.
 */
describe('OcrQueueService e créditos (banco e ledger falsos)', () => {
  const USER = 'user-1';
  const OLD_KEY = 'bills/user-1/old.jpg';
  const NEW_KEY = 'bills/user-1/new.jpg';
  // Texto que NUNCA pode aparecer em motivo de release nem em log de crédito
  const SECRET = 'SEGREDO-mensagem-crua-do-erro';

  let db: FakeOcrDb;
  let credits: ReturnType<FakeOcrDb['fakeCredits']>;
  let ocrService: { processImage: jest.Mock };
  let metrics: Record<string, jest.Mock>;
  let queue: any;
  let logs: string[];

  const okResult = (source: string | undefined = 'MODEL_JSON', price = 10) => ({
    rawText: 'texto bruto de teste suficientemente longo',
    source,
    establishmentName: 'Bar do Teste',
    totalAmount: 10,
    items: [
      {
        name: 'Item',
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 10,
        totalPrice: price,
      },
    ],
  });

  const build = (
    flag: string | undefined,
    env: Record<string, string> = {},
  ) => {
    process.env.OCR_QUEUE_MAX_JOBS_PER_RUN = '1';
    process.env.OCR_QUEUE_RETRY_DELAY_MS = '0';
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
    Object.assign(process.env, env);
    if (flag === undefined) {
      delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    } else {
      process.env.CREDITS_ENFORCEMENT_ENABLED = flag;
    }

    const Ctor = OcrQueueService as unknown as new (
      ...args: unknown[]
    ) => unknown;
    queue = new Ctor(
      db.client(),
      ocrService,
      metrics,
      { isUsingS3: () => false, getSignedUrl: jest.fn() },
      credits,
    );
  };

  /** Conta com imagem e job enfileirado (reserva feita pelo próprio enqueue). */
  const seedEnqueued = async () => {
    const bill = db.addBill({ imageKey: OLD_KEY });
    const { job, enqueued } = await queue.enqueue(bill.id, USER, {
      imageKey: OLD_KEY,
    });
    expect(enqueued).toBe(true);
    return { bill, job };
  };

  const run = () => queue.processPendingJobs();
  const failWith = (category: OcrErrorCategoryName) =>
    attachOcrFailure(new Error(SECRET), buildOcrFailure(category));

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
  });

  describe('item 1: reserva antes do enfileiramento', () => {
    it('trabalho novo reserva uma vez, com a chave do job (execução 1)', async () => {
      const { job } = await seedEnqueued();

      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.reserve).toHaveBeenCalledWith(USER, job.id, undefined);
      expect(db.creditReservations).toEqual([
        { userId: USER, ocrJobId: job.id, status: 'HELD' },
      ]);
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('reserva dentro da transação do chamador (recebe o tx)', async () => {
      const bill = db.addBill({ imageKey: OLD_KEY });

      await db
        .client()
        .$transaction((tx: any) =>
          queue.enqueue(bill.id, USER, { imageKey: OLD_KEY, tx }),
        );

      const txArg = credits.reserve.mock.calls[0][2];
      expect(txArg).toBeDefined();
      expect(typeof txArg.ocrJob.createMany).toBe('function');
    });

    it('sem saldo: o erro desfaz conta e trabalho e nada é enfileirado', async () => {
      db.creditTransactions.length = 0; // saldo 0

      await expect(
        db.client().$transaction(async (tx: any) => {
          const bill = await tx.bill.create({
            data: { userId: USER, status: BillStatus.PENDING_OCR },
          });
          await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY, tx });
        }),
      ).rejects.toBeInstanceOf(InsufficientCreditsError);

      expect(db.bills).toHaveLength(0);
      expect(db.jobs).toHaveLength(0);
      expect(db.creditReservations).toHaveLength(0);
      expect(metrics.recordOcrQueued).not.toHaveBeenCalled();
    });

    it('job PENDING reaproveitado (enqueued=false) não reserva de novo', async () => {
      const { bill } = await seedEnqueued();

      const second = await queue.enqueue(bill.id, USER, { imageKey: OLD_KEY });

      expect(second.enqueued).toBe(false);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
    });

    it('imagem trocada com o job RUNNING não reserva de novo', async () => {
      const { bill, job } = await seedEnqueued();
      const row = db.jobs.find((j) => j.id === job.id)!;
      row.status = OcrJobStatus.RUNNING;

      const second = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });

      expect(second.enqueued).toBe(false);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
    });

    it('job COMPLETED com a mesma imagem não é recriado nem reserva', async () => {
      const { bill } = await seedEnqueued();
      await run();

      const again = await queue.enqueue(bill.id, USER, { imageKey: OLD_KEY });

      expect(again.enqueued).toBe(false);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
    });
  });

  describe('chave por execução (BUG-017)', () => {
    it('job FAILED recriado (retry-ocr) tem creditRun 2 e a chave jobId:2', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      ocrService.processImage.mockRejectedValue(failWith('TRANSIENT'));
      const { bill, job } = await seedEnqueued();
      await run();
      expect(db.jobs[0].status).toBe(OcrJobStatus.FAILED);

      const again = await queue.enqueue(bill.id, USER, {
        imageKey: OLD_KEY,
        reprocess: true,
      });

      expect(again.enqueued).toBe(true);
      expect(db.jobs[0].creditRun).toBe(2);
      expect(credits.reserve).toHaveBeenLastCalledWith(
        USER,
        `${job.id}:2`,
        undefined,
      );
    });

    it('retry depois da devolução reserva de novo e só cobra se o resultado servir', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      ocrService.processImage.mockRejectedValueOnce(failWith('TRANSIENT'));
      const { bill, job } = await seedEnqueued();
      await run();
      expect(db.availableCredits(USER)).toBe(3); // 1ª execução liberada

      // Como o retryOcr: a conta volta a PENDING_OCR junto com o enqueue
      db.bills[0].status = BillStatus.PENDING_OCR;
      await queue.enqueue(bill.id, USER, {
        imageKey: OLD_KEY,
        reprocess: true,
      });
      expect(db.availableCredits(USER)).toBe(2); // 2ª reservada
      await run();

      expect(credits.consume).toHaveBeenCalledWith(`${job.id}:2`);
      expect(db.creditReservations.map((r) => [r.ocrJobId, r.status])).toEqual([
        [job.id, 'RELEASED'],
        [`${job.id}:2`, 'CONSUMED'],
      ]);
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('job COMPLETED recriado por imagem nova é nova execução (jobId:2)', async () => {
      const { bill, job } = await seedEnqueued();
      await run();
      db.bills[0].status = BillStatus.PENDING_OCR;

      const again = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });

      expect(again.enqueued).toBe(true);
      expect(credits.reserve).toHaveBeenLastCalledWith(
        USER,
        `${job.id}:2`,
        undefined,
      );
    });

    it('imagem trocada durante a leitura (requeued_new_image) mantém a MESMA reserva', async () => {
      const { job } = await seedEnqueued();
      ocrService.processImage.mockImplementationOnce(async () => {
        db.bills[0].imageKey = NEW_KEY;
        return okResult();
      });

      await run();

      expect(db.jobs[0].status).toBe(OcrJobStatus.PENDING);
      expect(db.jobs[0].creditRun).toBe(1);
      expect(credits.consume).not.toHaveBeenCalled();
      expect(credits.release).not.toHaveBeenCalled();
      expect(db.creditReservations[0].status).toBe('HELD');

      await run(); // lê a imagem nova

      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledWith(job.id);
    });
  });

  describe('item 2: consumir só após resultado utilizável; liberar nas falhas', () => {
    it('resultado utilizável: consome UMA vez, depois de o job estar COMPLETED', async () => {
      await seedEnqueued();
      const seen: Array<[string, string]> = [];
      credits.consume.mockImplementation(async () => {
        seen.push([db.jobs[0].status, db.bills[0].status]);
      });

      await run();

      expect(seen).toEqual([[OcrJobStatus.COMPLETED, BillStatus.REVIEWING]]);
      expect(credits.release).not.toHaveBeenCalled();
      expect(credits.reserve).toHaveBeenCalledTimes(1);
    });

    it('consome com o ledger real falso: reserva CONSUMED e saldo debitado', async () => {
      await seedEnqueued();
      await run();

      expect(db.creditReservations[0].status).toBe('CONSUMED');
      expect(db.availableCredits(USER)).toBe(2);
    });

    it.each([
      ['leitor de texto de contingência', okResult('TEXT_FALLBACK')],
      ['JSON sem validação', okResult('JSON_UNVALIDATED')],
      ['origem desconhecida', { ...okResult(), source: undefined }],
      ['item com preço zero', okResult('MODEL_JSON', 0)],
    ])(
      'resultado NÃO utilizável (%s): grava como sempre e libera o crédito',
      async (_name, result) => {
        ocrService.processImage.mockResolvedValue(result);
        await seedEnqueued();

        await run();

        // Política A: status da conta e itens inalterados
        expect(db.bills[0].status).toBe(BillStatus.REVIEWING);
        expect(db.items).toHaveLength(1);
        expect(db.jobs[0].status).toBe(OcrJobStatus.COMPLETED);
        expect(credits.consume).not.toHaveBeenCalled();
        expect(credits.release).toHaveBeenCalledWith(
          db.jobs[0].id,
          'UNUSABLE_RESULT',
        );
        expect(db.availableCredits(USER)).toBe(3);
      },
    );

    it.each([
      'TRANSIENT',
      'TIMEOUT',
      'CREDENTIAL',
      'INVALID_REQUEST',
      'INTERNAL',
      'UNKNOWN',
    ] as OcrErrorCategoryName[])(
      'falha final %s: libera com o código OCR_FAILED_%s, nunca com a mensagem',
      async (category) => {
        build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
        ocrService.processImage.mockRejectedValue(failWith(category));
        await seedEnqueued();

        await run();

        expect(db.bills[0].status).toBe(BillStatus.OCR_FAILED);
        expect(credits.consume).not.toHaveBeenCalled();
        expect(credits.release).toHaveBeenCalledTimes(1);
        expect(credits.release).toHaveBeenCalledWith(
          db.jobs[0].id,
          `OCR_FAILED_${category}`,
        );
        expect(JSON.stringify(db.creditTransactions)).not.toContain(SECRET);
        expect(db.availableCredits(USER)).toBe(3);
      },
    );

    it('falha final INVALID_RESULT (resposta sem itens) libera com OCR_FAILED_INVALID_RESULT', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      ocrService.processImage.mockResolvedValue({
        rawText: 'texto bruto de teste suficientemente longo',
        source: 'MODEL_JSON',
        items: [],
      });
      await seedEnqueued();

      await run();

      expect(credits.release).toHaveBeenCalledWith(
        db.jobs[0].id,
        'OCR_FAILED_INVALID_RESULT',
      );
    });

    it('falha final IMAGE_MISSING (conta sem imagem) libera com OCR_FAILED_IMAGE_MISSING', async () => {
      const bill = db.addBill({ imageKey: null, imageUrl: null });
      await queue.enqueue(bill.id, USER, { imageKey: null });

      await run();

      expect(ocrService.processImage).not.toHaveBeenCalled();
      expect(credits.release).toHaveBeenCalledWith(
        db.jobs[0].id,
        'OCR_FAILED_IMAGE_MISSING',
      );
    });

    it('resultado descartado porque a conta saiu de PENDING_OCR libera com DISCARDED_BILL_CHANGED', async () => {
      await seedEnqueued();
      ocrService.processImage.mockImplementationOnce(async () => {
        db.bills[0].status = BillStatus.REVIEWING;
        return okResult();
      });

      await run();

      expect(db.runMetrics.at(-1)?.outcome).toBe('DISCARDED');
      expect(credits.consume).not.toHaveBeenCalled();
      expect(credits.release).toHaveBeenCalledWith(
        db.jobs[0].id,
        'DISCARDED_BILL_CHANGED',
      );
    });

    it('execução que perdeu o job (stale) não liquida: quem assumiu liquida', async () => {
      await seedEnqueued();
      ocrService.processImage.mockImplementationOnce(async () => {
        db.jobs[0].attempts += 1; // outra execução reivindicou o job
        return okResult();
      });

      await run();

      expect(db.runMetrics.at(-1)?.outcome).toBe('DISCARDED');
      expect(credits.consume).not.toHaveBeenCalled();
      expect(credits.release).not.toHaveBeenCalled();
    });
  });

  describe('item 3: retentativa técnica não consome novo crédito', () => {
    it('falha transitória e depois sucesso: 1 reserva, 1 consumo, 0 devoluções', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '3' });
      ocrService.processImage
        .mockRejectedValueOnce(failWith('TRANSIENT'))
        .mockResolvedValueOnce(okResult());
      const { job } = await seedEnqueued();

      await run();
      expect(db.runMetrics.at(-1)?.outcome).toBe('RETRY_SCHEDULED');
      expect(credits.consume).not.toHaveBeenCalled();
      expect(credits.release).not.toHaveBeenCalled();

      await run();

      expect(ocrService.processImage).toHaveBeenCalledTimes(2);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledWith(job.id);
      expect(credits.release).not.toHaveBeenCalled();
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('3 falhas seguidas: 1 reserva e 1 devolução (não uma por tentativa)', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '3' });
      ocrService.processImage.mockRejectedValue(failWith('TRANSIENT'));
      await seedEnqueued();

      await run();
      await run();
      await run();

      expect(ocrService.processImage).toHaveBeenCalledTimes(3);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.release).toHaveBeenCalledTimes(1);
      expect(db.availableCredits(USER)).toBe(3);
    });

    it('lock vencido: a próxima execução reaproveita a reserva e consome uma vez', async () => {
      const { job } = await seedEnqueued();
      Object.assign(db.jobs[0], {
        status: OcrJobStatus.RUNNING,
        attempts: 1,
        lockedAt: new Date(Date.now() - 10 * 60_000),
      });

      await run();

      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledWith(job.id);
    });

    it('consume que falha NÃO reprocessa nem altera job e métrica; o log traz só o nome do erro', async () => {
      await seedEnqueued();
      db.failConsumeWith = Object.assign(new Error(SECRET), {
        name: 'PrismaClientKnownRequestError',
      });

      await run();

      expect(db.jobs[0].status).toBe(OcrJobStatus.COMPLETED);
      expect(db.bills[0].status).toBe(BillStatus.REVIEWING);
      expect(db.runMetrics.at(-1)?.outcome).toBe('COMPLETED');
      expect(db.creditReservations[0].status).toBe('HELD');
      const failure = logs.find((l) => l.startsWith('CREDIT_SETTLE_FAILED'))!;
      expect(JSON.parse(failure.replace('CREDIT_SETTLE_FAILED ', ''))).toEqual({
        jobId: db.jobs[0].id,
        action: 'consume',
        errorName: 'PrismaClientKnownRequestError',
      });
      expect(logs.join('\n')).not.toContain(SECRET);

      // A fila repete a rodada: nada é lido de novo, nada é reservado de novo
      const again = await run();
      expect(again.processed).toBe(0);
      expect(ocrService.processImage).toHaveBeenCalledTimes(1);
      expect(credits.reserve).toHaveBeenCalledTimes(1);

      // Liquidar depois (idempotente) cobra uma vez só
      db.failConsumeWith = null;
      await credits.consume(db.jobs[0].id);
      await credits.consume(db.jobs[0].id);
      expect(db.creditReservations[0].status).toBe('CONSUMED');
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('release que falha na falha final NÃO muda job, conta nem métrica', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      ocrService.processImage.mockRejectedValue(failWith('TIMEOUT'));
      await seedEnqueued();
      db.failReleaseWith = Object.assign(new Error(SECRET), {
        name: 'PrismaClientKnownRequestError',
      });

      await run();

      expect(db.jobs[0].status).toBe(OcrJobStatus.FAILED);
      expect(db.bills[0].status).toBe(BillStatus.OCR_FAILED);
      expect(db.runMetrics.at(-1)?.outcome).toBe('FAILED_FINAL');
      expect(logs.some((l) => l.startsWith('CREDIT_SETTLE_FAILED'))).toBe(true);
      // (o log legado "OCR failed for bill" já traz a mensagem; o de crédito não)
      expect(
        logs.filter((l) => l.startsWith('CREDIT_')).join('\n'),
      ).not.toContain(SECRET);

      const again = await run();
      expect(again.processed).toBe(0);
      expect(ocrService.processImage).toHaveBeenCalledTimes(1);
    });

    it('logs de crédito só têm ids e códigos', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      ocrService.processImage.mockRejectedValue(failWith('CREDENTIAL'));
      await seedEnqueued();

      await run();

      const creditLogs = logs.filter((l) => l.startsWith('CREDIT_'));
      expect(creditLogs).toHaveLength(1);
      expect(JSON.parse(creditLogs[0].replace('CREDIT_SETTLED ', ''))).toEqual({
        jobId: db.jobs[0].id,
        creditRun: 1,
        action: 'release',
        reason: 'OCR_FAILED_CREDENTIAL',
      });
    });
  });

  describe('pré-checagem de saldo (somente leitura)', () => {
    it('sem saldo: recusa com InsufficientCreditsError e não reserva', async () => {
      db.creditTransactions.length = 0;

      await expect(queue.assertCreditsAvailable(USER)).rejects.toBeInstanceOf(
        InsufficientCreditsError,
      );
      expect(credits.reserve).not.toHaveBeenCalled();
    });

    it('com saldo, ou conta isenta: segue, sem reservar', async () => {
      await queue.assertCreditsAvailable(USER);
      db.creditTransactions.length = 0;
      db.unlimitedUsers.add(USER);
      await queue.assertCreditsAvailable(USER);

      expect(credits.reserve).not.toHaveBeenCalled();
    });

    it('se a consulta falhar, segue o fluxo (a reserva decide)', async () => {
      db.failBalanceWith = new Error(SECRET);

      await expect(queue.assertCreditsAvailable(USER)).resolves.toBeUndefined();
      expect(logs.some((l) => l.startsWith('CREDIT_PRECHECK_FAILED'))).toBe(
        true,
      );
      expect(logs.join('\n')).not.toContain(SECRET);
    });
  });

  describe('cobrança DESLIGADA: nada muda e o ledger nunca é chamado', () => {
    const neverCalled = () => {
      expect(credits.reserve).not.toHaveBeenCalled();
      expect(credits.consume).not.toHaveBeenCalled();
      expect(credits.release).not.toHaveBeenCalled();
      expect(credits.getBalance).not.toHaveBeenCalled();
      expect(db.creditReservations).toHaveLength(0);
      expect(db.availableCredits(USER)).toBe(3);
    };

    it.each([['false'], [undefined], [''], ['1'], ['TRUE']])(
      'bandeira %p: sucesso, falha final, descarte e recriação sem tocar no ledger',
      async (flag) => {
        build(flag as string | undefined, { OCR_QUEUE_MAX_ATTEMPTS: '1' });

        // sucesso
        const ok = db.addBill({ imageKey: OLD_KEY });
        await queue.enqueue(ok.id, USER, { imageKey: OLD_KEY });
        await run();
        expect(db.bills[0].status).toBe(BillStatus.REVIEWING);

        // falha final
        const failed = db.addBill({ imageKey: NEW_KEY });
        await queue.enqueue(failed.id, USER, { imageKey: NEW_KEY });
        ocrService.processImage.mockRejectedValueOnce(failWith('TRANSIENT'));
        await run();
        expect(db.bills[1].status).toBe(BillStatus.OCR_FAILED);

        // descarte
        const dropped = db.addBill({ imageKey: OLD_KEY });
        await queue.enqueue(dropped.id, USER, { imageKey: OLD_KEY });
        ocrService.processImage.mockImplementationOnce(async () => {
          db.bills[2].status = BillStatus.REVIEWING;
          return okResult();
        });
        await run();
        expect(db.runMetrics.at(-1)?.outcome).toBe('DISCARDED');

        // recriação (retry-ocr)
        await queue.enqueue(failed.id, USER, {
          imageKey: NEW_KEY,
          reprocess: true,
        });
        await run();

        neverCalled();
        await queue.assertCreditsAvailable(USER);
        neverCalled();
      },
    );

    it('funciona sem o serviço de créditos injetado (como nos specs antigos)', async () => {
      const Ctor = OcrQueueService as unknown as new (
        ...args: unknown[]
      ) => any;
      process.env.CREDITS_ENFORCEMENT_ENABLED = 'false';
      const legacy = new Ctor(db.client(), ocrService, metrics, {
        isUsingS3: () => false,
        getSignedUrl: jest.fn(),
      });
      const bill = db.addBill({ imageKey: OLD_KEY });

      const { enqueued } = await legacy.enqueue(bill.id, USER, {
        imageKey: OLD_KEY,
      });
      await legacy.processPendingJobs();

      expect(enqueued).toBe(true);
      expect(db.bills[0].status).toBe(BillStatus.REVIEWING);
    });
  });
});
