import 'reflect-metadata';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';
import { BillsService } from '../bills/bills.service';
import { FakeOcrDb } from './ocr-fake-db.testing-spec';
import {
  OcrErrorCategoryName,
  attachOcrFailure,
  buildOcrFailure,
} from './ocr-error-category';

/**
 * Imagem ausente e reprocessamento na fila de OCR, contra um banco FALSO e um
 * ledger FALSO em memória, com a fila e o BillsService reais.
 *
 * O QUE ESTES TESTES PROVAM: uma falha ao obter a URL da imagem segue o caminho
 * normal de falha (não deixa o job preso em RUNNING); o retry depois de um lock
 * esgotado recomeça do zero com nova reserva; dois cliques no retry geram uma
 * única reserva; e uma falha final que coincide com a troca da imagem NÃO
 * devolve o crédito (a mesma reserva vale para a imagem nova).
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): a corrida real de dois
 * `retry-ocr` no UPDATE condicional da conta e o lock real do ledger. NÃO
 * VALIDADO em Postgres real.
 */
describe('OcrQueueService: imagem ausente e reprocessamento (banco e ledger falsos)', () => {
  const USER = 'user-1';
  const OLD_KEY = 'bills/user-1/old.jpg';
  const NEW_KEY = 'bills/user-1/new.jpg';
  const KEY_A = '3f6c1a52-0d1e-4b7e-9a2f-5d6f7a8b9c01';
  const SECRET = 'SEGREDO-mensagem-crua-do-erro';
  const originalVercel = process.env.VERCEL;

  let db: FakeOcrDb;
  let credits: ReturnType<FakeOcrDb['fakeCredits']>;
  let ocrService: { processImage: jest.Mock };
  let metrics: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let queue: any;
  let service: BillsService;
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

  const failWith = (category: OcrErrorCategoryName, httpStatus?: number) =>
    attachOcrFailure(
      new Error(SECRET),
      buildOcrFailure(category, { httpStatus }),
    );

  const build = (
    flag: string | undefined,
    env: Record<string, string> = {},
    s3 = false,
  ) => {
    process.env.OCR_QUEUE_MAX_JOBS_PER_RUN = '1';
    process.env.OCR_QUEUE_RETRY_DELAY_MS = '0';
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
    Object.assign(process.env, env);
    if (flag === undefined) delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    else process.env.CREDITS_ENFORCEMENT_ENABLED = flag;

    storage = {
      isUsingS3: jest.fn().mockReturnValue(s3),
      getSignedUrl: jest.fn(async (key: string) => `https://img.test/${key}`),
      isOwnedObjectKey: jest.fn().mockReturnValue(true),
      getFileUrl: jest.fn(async (key: string) => `https://img.test/${key}`),
    };
    const QueueCtor = OcrQueueService as unknown as new (
      ...args: unknown[]
    ) => unknown;
    queue = new QueueCtor(db.client(), ocrService, metrics, storage, credits);
    const ServiceCtor = BillsService as unknown as new (
      ...args: unknown[]
    ) => BillsService;
    service = new ServiceCtor(db.client(), storage, queue, {});
  };

  const seedEnqueued = async (imageKey = OLD_KEY) => {
    const bill = db.addBill({ imageKey });
    await queue.enqueue(bill.id, USER, { imageKey });
    return { bill, job: db.jobs.find((j) => j.billId === bill.id)! };
  };

  const run = () => queue.processPendingJobs();

  /** Faz o job virar FAILED por lock vencido com as tentativas esgotadas. */
  const exhaustByLock = async (job: Record<string, any>) => {
    Object.assign(job, {
      status: OcrJobStatus.RUNNING,
      attempts: 3,
      lockedAt: new Date(Date.now() - 10 * 60_000),
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    await queue.releaseStaleLocks();
  };

  beforeEach(() => {
    // Na Vercel o processamento é disparado por cron; aqui não dispara a fila
    process.env.VERCEL = '1';
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
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    for (const name of [
      'CREDITS_ENFORCEMENT_ENABLED',
      'OCR_QUEUE_MAX_ATTEMPTS',
      'OCR_QUEUE_MAX_JOBS_PER_RUN',
      'OCR_QUEUE_RETRY_DELAY_MS',
    ]) {
      delete process.env[name];
    }
  });

  describe('imagem ausente', () => {
    it('falha ao obter a URL da imagem não deixa o job preso em RUNNING: segue o caminho normal de falha', async () => {
      build('true', {}, true);
      storage.getSignedUrl.mockRejectedValue(
        new InternalServerErrorException('Falha ao gerar URL da imagem'),
      );
      const { bill, job } = await seedEnqueued();

      await expect(run()).resolves.toMatchObject({ processed: 1 });

      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING, // retentativa agendada
        attempts: 1,
        lockedAt: null,
      });
      expect(job.lastError).toEqual(expect.any(String));
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(ocrService.processImage).not.toHaveBeenCalled();
      expect(metrics.recordOcrStarted).not.toHaveBeenCalled();
      expect(metrics.recordOcrRetry).toHaveBeenCalledTimes(1);
      expect(db.runMetrics).toHaveLength(1);
      expect(db.runMetrics[0]).toMatchObject({
        attempt: 1,
        outcome: 'RETRY_SCHEDULED',
        errorCategory: 'UNKNOWN',
        model: null,
        promptTokens: null,
      });
      expect(credits.release).not.toHaveBeenCalled();
    });

    it('esgotadas as tentativas, a conta vai a OCR_FAILED e o crédito é devolvido uma vez', async () => {
      build('true', {}, true);
      storage.getSignedUrl.mockRejectedValue(
        new InternalServerErrorException('Falha ao gerar URL da imagem'),
      );
      const { bill, job } = await seedEnqueued();

      await run();
      await run();
      await run();

      expect(storage.getSignedUrl).toHaveBeenCalledTimes(3);
      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(ocrService.processImage).not.toHaveBeenCalled();
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.release).toHaveBeenCalledTimes(1);
      expect(credits.release).toHaveBeenCalledWith(
        job.id,
        'OCR_FAILED_UNKNOWN',
      );
      expect(db.availableCredits(USER)).toBe(3);
    });

    it('com a cobrança desligada o mesmo erro não toca no ledger', async () => {
      build(undefined, { OCR_QUEUE_MAX_ATTEMPTS: '1' }, true);
      storage.getSignedUrl.mockRejectedValue(new Error(SECRET));
      const { bill, job } = await seedEnqueued();

      await run();

      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(credits.reserve).not.toHaveBeenCalled();
      expect(credits.release).not.toHaveBeenCalled();
      expect(credits.consume).not.toHaveBeenCalled();
    });

    it('CARACTERIZAÇÃO: chave que não existe no S3 (erro 400 do provedor) é retentada até esgotar e o crédito volta', async () => {
      ocrService.processImage.mockRejectedValue(
        failWith('INVALID_REQUEST', 400),
      );
      const { bill, job } = await seedEnqueued('bills/user-1/nao-existe.jpg');

      await run();
      await run();
      await run();

      expect(ocrService.processImage).toHaveBeenCalledTimes(3);
      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.release).toHaveBeenCalledWith(
        job.id,
        'OCR_FAILED_INVALID_REQUEST',
      );
      expect(db.runMetrics.map((r) => [r.outcome, r.errorCategory])).toEqual([
        ['RETRY_SCHEDULED', 'INVALID_REQUEST'],
        ['RETRY_SCHEDULED', 'INVALID_REQUEST'],
        ['FAILED_FINAL', 'INVALID_REQUEST'],
      ]);
    });

    it.each([[''], [null]])(
      'retry-ocr de conta sem imagem (imageUrl %p) é recusado e nada muda',
      async (imageUrl) => {
        const bill = db.addBill({
          status: BillStatus.OCR_FAILED,
          imageUrl,
          imageKey: '',
        });
        db.addJob(bill.id, { status: OcrJobStatus.FAILED });

        await expect(service.retryOcr(bill.id, USER)).rejects.toBeInstanceOf(
          BadRequestException,
        );

        expect(bill.status).toBe(BillStatus.OCR_FAILED);
        expect(db.jobs[0]).toMatchObject({
          status: OcrJobStatus.FAILED,
          creditRun: 1,
        });
        expect(credits.reserve).not.toHaveBeenCalled();
      },
    );
  });

  describe('reprocessamento', () => {
    it('retry depois de lock esgotado recomeça do zero: attempts 0, creditRun 2 e nova reserva', async () => {
      const { bill, job } = await seedEnqueued();
      await exhaustByLock(job);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(db.availableCredits(USER)).toBe(3); // a primeira reserva voltou

      await service.retryOcr(bill.id, USER);

      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        creditRun: 2,
        lastError: null,
        startedAt: null,
        lockedAt: null,
      });
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(credits.reserve).toHaveBeenLastCalledWith(
        USER,
        `${job.id}:2`,
        expect.anything(),
      );
      expect(db.availableCredits(USER)).toBe(2);

      await run();

      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(credits.consume).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledWith(`${job.id}:2`);
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('o retry renova o limite de tentativas: o lock esgotado pode acontecer de novo e só devolve a SEGUNDA reserva', async () => {
      const { bill, job } = await seedEnqueued();
      await exhaustByLock(job);
      await service.retryOcr(bill.id, USER);

      await exhaustByLock(job);

      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(credits.release).toHaveBeenCalledTimes(2);
      expect(credits.release).toHaveBeenLastCalledWith(
        `${job.id}:2`,
        'OCR_FAILED_EXHAUSTED',
      );
      expect(db.availableCredits(USER)).toBe(3);
    });

    it('duplo clique no retry (sem chave): um passa, o outro é recusado e há uma única reserva nova', async () => {
      const { bill, job } = await seedEnqueued();
      await exhaustByLock(job);
      credits.reserve.mockClear();

      const results = await Promise.allSettled([
        service.retryOcr(bill.id, USER),
        service.retryOcr(bill.id, USER),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(BadRequestException);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(job.creditRun).toBe(2);
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('a mesma Idempotency-Key repetida devolve o resultado e não reserva de novo', async () => {
      const { bill, job } = await seedEnqueued();
      await exhaustByLock(job);
      credits.reserve.mockClear();

      await service.retryOcr(bill.id, USER, KEY_A);
      const again: any = await service.retryOcr(bill.id, USER, KEY_A);

      expect(again.idempotentReplay).toBe(true);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(job.creditRun).toBe(2);
    });
  });

  describe('falha final com a imagem trocada durante a leitura (correção da Semana 3)', () => {
    /** A conta passa a apontar para a imagem nova no meio da leitura, que falha. */
    const failWhileImageChanges = (bill: Record<string, any>) =>
      ocrService.processImage.mockImplementationOnce(async () => {
        bill.imageKey = NEW_KEY;
        throw failWith('INVALID_REQUEST', 400);
      });

    it('NÃO libera o crédito: o job volta à fila com a imagem nova e a mesma reserva vale para ela', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill, job } = await seedEnqueued();
      failWhileImageChanges(bill);

      await run();

      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        imageKey: NEW_KEY,
        creditRun: 1,
      });
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(credits.release).not.toHaveBeenCalled();
      expect(db.creditReservations[0].status).toBe('HELD');
      // a linha de métrica da execução que falhou continua a mesma de antes
      expect(db.runMetrics[0]).toMatchObject({
        outcome: 'FAILED_FINAL',
        errorCategory: 'INVALID_REQUEST',
      });
    });

    it('a leitura da imagem nova é cobrada: uma reserva, um consume, nenhuma leitura de graça', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill, job } = await seedEnqueued();
      failWhileImageChanges(bill);
      await run();

      await run(); // lê a imagem nova com sucesso

      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.release).not.toHaveBeenCalled();
      expect(credits.consume).toHaveBeenCalledTimes(1);
      expect(credits.consume).toHaveBeenCalledWith(job.id);
      expect(db.creditReservations[0].status).toBe('CONSUMED');
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('sem troca de imagem a falha final continua devolvendo o crédito', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill, job } = await seedEnqueued();
      ocrService.processImage.mockRejectedValueOnce(
        failWith('INVALID_REQUEST', 400),
      );

      await run();

      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(credits.release).toHaveBeenCalledWith(
        job.id,
        'OCR_FAILED_INVALID_REQUEST',
      );
    });

    it('com a cobrança desligada: mesmo estado do banco e o ledger nunca é chamado', async () => {
      const outcome = async (flag: string | undefined) => {
        db = new FakeOcrDb();
        db.grantCredits(USER, 3);
        credits = db.fakeCredits();
        build(flag, { OCR_QUEUE_MAX_ATTEMPTS: '1' });
        const { bill, job } = await seedEnqueued();
        failWhileImageChanges(bill);
        await run();
        const afterFailure = {
          job: [job.status, job.attempts, job.imageKey],
          bill: bill.status,
        };
        await run();
        return {
          afterFailure,
          final: [job.status, bill.status],
          metrics: db.runMetrics.map((r) => [r.outcome, r.errorCategory]),
        };
      };

      const off = await outcome(undefined);
      const neverCalled = [
        credits.reserve,
        credits.consume,
        credits.release,
        credits.getBalance,
      ].every((fn) => fn.mock.calls.length === 0);
      const on = await outcome('true');

      expect(neverCalled).toBe(true);
      expect(off).toEqual(on);
    });

    it('nenhuma liquidação de crédito é registrada nesse caminho', async () => {
      build('true', { OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill } = await seedEnqueued();
      failWhileImageChanges(bill);

      await run();

      expect(logs.filter((l) => l.startsWith('CREDIT_'))).toEqual([]);
    });
  });
});
