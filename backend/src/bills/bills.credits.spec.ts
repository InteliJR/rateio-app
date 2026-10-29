import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { BillsService } from './bills.service';
import { OcrQueueService } from '../ocr/ocr-queue.service';
import { FakeOcrDb } from '../ocr/ocr-fake-db.testing-spec';
import { InsufficientCreditsError } from '../credits/credits.service';

/**
 * Créditos nas operações do BillsService (criar, anexar, reprocessar), contra
 * um banco e um ledger FALSOS em memória, com a fila real.
 *
 * O QUE ESTES TESTES PROVAM: a reserva acontece dentro da transação da conta,
 * sem saldo nada é criado, repetição pela chave não reserva de novo, o perdedor
 * da corrida pela mesma chave vira replay (e não 402) e a pré-checagem recusa
 * antes do upload.
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): o lock real da linha do
 * usuário (FOR NO KEY UPDATE), deadlock, saldo nunca negativo e unicidade sob
 * concorrência real. NÃO VALIDADO em Postgres real. A espera do perdedor pelo
 * lock é simulada por uma trava por usuário mantida até o fim da transação.
 */
describe('BillsService e créditos (banco e ledger falsos)', () => {
  const USER = 'user-1';
  const KEY_A = '3f6c1a52-0d1e-4b7e-9a2f-5d6f7a8b9c01';
  const IMAGE_1 = 'bills/user-1/foto-1.jpg';
  const IMAGE_2 = 'bills/user-1/foto-2.jpg';
  const SECRET = 'SEGREDO-mensagem-crua';

  let db: FakeOcrDb;
  let credits: ReturnType<FakeOcrDb['fakeCredits']>;
  let storage: Record<string, jest.Mock>;
  let metrics: Record<string, jest.Mock>;
  let queue: any;
  let service: BillsService;

  const file = { mimetype: 'image/jpeg', size: 1000 } as Express.Multer.File;

  const build = (flag: string | undefined) => {
    if (flag === undefined) {
      delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    } else {
      process.env.CREDITS_ENFORCEMENT_ENABLED = flag;
    }
    const QueueCtor = OcrQueueService as unknown as new (
      ...args: unknown[]
    ) => unknown;
    queue = new QueueCtor(db.client(), {}, metrics, storage, credits);

    const ServiceCtor = BillsService as unknown as new (
      ...args: unknown[]
    ) => BillsService;
    service = new ServiceCtor(db.client(), storage, queue, {});
  };

  const createWithImage = (key = KEY_A) =>
    service.create(
      undefined,
      USER,
      { imageKey: IMAGE_1, establishmentName: 'Bar' } as any,
      key,
    ) as Promise<any>;

  beforeEach(() => {
    // Na Vercel o processamento é disparado por cron; aqui não dispara a fila
    process.env.VERCEL = '1';
    db = new FakeOcrDb();
    db.grantCredits(USER, 3);
    credits = db.fakeCredits();
    metrics = {
      recordOcrQueued: jest.fn(),
      recordOcrStarted: jest.fn(),
      recordOcrCompleted: jest.fn(),
      recordOcrRetry: jest.fn(),
      recordOcrFailed: jest.fn(),
    };
    storage = {
      isOwnedObjectKey: jest.fn().mockReturnValue(true),
      getFileUrl: jest.fn(async (key: string) => `https://img.test/${key}`),
      validateFileType: jest.fn().mockReturnValue(true),
      validateFileSize: jest.fn().mockReturnValue(true),
      uploadFile: jest.fn(async () => ({
        key: IMAGE_2,
        url: `https://img.test/${IMAGE_2}`,
      })),
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    build('true');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.VERCEL;
    delete process.env.CREDITS_ENFORCEMENT_ENABLED;
  });

  describe('item 1: reserva antes do enfileiramento (BUG-016)', () => {
    it('criar com imagem reserva um crédito na mesma transação', async () => {
      const bill = await createWithImage();

      expect(db.bills).toHaveLength(1);
      expect(db.jobs).toHaveLength(1);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(credits.reserve).toHaveBeenCalledWith(
        USER,
        db.jobs[0].id,
        expect.anything(),
      );
      expect(db.creditReservations).toHaveLength(1);
      expect(db.availableCredits(USER)).toBe(2);
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
    });

    it('sem saldo: rejeita e NÃO cria conta, trabalho, chave nem reserva', async () => {
      db.creditTransactions.length = 0;

      await expect(createWithImage()).rejects.toBeInstanceOf(
        InsufficientCreditsError,
      );

      expect(db.bills).toHaveLength(0);
      expect(db.jobs).toHaveLength(0);
      expect(db.idempotencyKeys).toHaveLength(0);
      expect(db.creditReservations).toHaveLength(0);
      expect(metrics.recordOcrQueued).not.toHaveBeenCalled();
    });

    it('sem saldo: anexar imagem a conta existente deixa a conta como estava', async () => {
      const bill = db.addBill({
        status: BillStatus.REVIEWING,
        imageKey: IMAGE_1,
      });
      db.addJob(bill.id, { status: OcrJobStatus.COMPLETED, imageKey: IMAGE_1 });
      db.creditTransactions.length = 0;

      await expect(
        service.attachUploadedImage(
          bill.id,
          { imageKey: IMAGE_2 } as any,
          USER,
        ),
      ).rejects.toBeInstanceOf(InsufficientCreditsError);

      expect(db.bills[0]).toMatchObject({
        status: BillStatus.REVIEWING,
        imageKey: IMAGE_1,
      });
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.COMPLETED,
        creditRun: 1,
      });
    });

    it('a mesma chave repetida devolve a conta e NÃO reserva de novo', async () => {
      const first = await createWithImage();
      const second = await createWithImage();

      expect(second.idempotentReplay).toBe(true);
      expect(second.id).toBe(first.id);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(db.creditReservations).toHaveLength(1);
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('anexar imagem enquanto o job está PENDING não reserva de novo', async () => {
      const first = await createWithImage();

      await service.attachUploadedImage(
        first.id,
        { imageKey: IMAGE_2 } as any,
        USER,
      );

      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(db.jobs).toHaveLength(1);
    });

    it('retry-ocr depois da falha recria o job e reserva de novo com a chave jobId:2', async () => {
      const bill = db.addBill({
        status: BillStatus.OCR_FAILED,
        imageKey: IMAGE_1,
      });
      const job = db.addJob(bill.id, {
        status: OcrJobStatus.FAILED,
        imageKey: IMAGE_1,
      });

      await service.retryOcr(bill.id, USER);

      expect(db.bills[0].status).toBe(BillStatus.PENDING_OCR);
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.PENDING,
        creditRun: 2,
      });
      expect(credits.reserve).toHaveBeenCalledWith(
        USER,
        `${job.id}:2`,
        expect.anything(),
      );
    });

    it('retry-ocr sem saldo: a conta continua em OCR_FAILED e o job em FAILED', async () => {
      const bill = db.addBill({
        status: BillStatus.OCR_FAILED,
        imageKey: IMAGE_1,
      });
      db.addJob(bill.id, { status: OcrJobStatus.FAILED, imageKey: IMAGE_1 });
      db.creditTransactions.length = 0;

      await expect(service.retryOcr(bill.id, USER)).rejects.toBeInstanceOf(
        InsufficientCreditsError,
      );

      expect(db.bills[0].status).toBe(BillStatus.OCR_FAILED);
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.FAILED,
        creditRun: 1,
      });
    });
  });

  describe('corrida com a MESMA chave e saldo para um só crédito', () => {
    it('o perdedor é tratado como replay e não responde 402', async () => {
      db.creditTransactions.length = 0;
      db.grantCredits(USER, 1);

      const results = await Promise.all([createWithImage(), createWithImage()]);

      // Os dois tentaram reservar; um foi recusado por saldo, e virou replay
      const settled = await Promise.allSettled(
        credits.reserve.mock.results.map((r) => r.value),
      );
      expect(settled.filter((s) => s.status === 'rejected')).toHaveLength(1);
      expect(
        (settled.find((s) => s.status === 'rejected') as PromiseRejectedResult)
          .reason,
      ).toBeInstanceOf(InsufficientCreditsError);

      expect(results.filter((r) => r.idempotentReplay === true)).toHaveLength(
        1,
      );
      expect(results[0].id).toBe(results[1].id);
      expect(db.bills).toHaveLength(1);
      expect(db.jobs).toHaveLength(1);
      expect(db.idempotencyKeys).toHaveLength(1);
      expect(db.creditReservations).toHaveLength(1);
      expect(db.availableCredits(USER)).toBe(0);
    });

    it('chaves DIFERENTES com saldo para um: uma passa e a outra recebe 402', async () => {
      db.creditTransactions.length = 0;
      db.grantCredits(USER, 1);
      const KEY_B = '9b1d5c3e-7a44-4f0e-8c25-1a2b3c4d5e02';

      const settled = await Promise.allSettled([
        createWithImage(KEY_A),
        createWithImage(KEY_B),
      ]);

      expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
      const rejected = settled.find(
        (s) => s.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(InsufficientCreditsError);
      expect(db.bills).toHaveLength(1);
      expect(db.availableCredits(USER)).toBe(0);
    });
  });

  describe('pré-checagem de saldo antes do upload ao S3', () => {
    it('create com arquivo e sem saldo: recusa ANTES de enviar ao S3', async () => {
      db.creditTransactions.length = 0;

      await expect(
        service.create(
          file,
          USER,
          { establishmentName: 'Bar' } as any,
          undefined,
        ),
      ).rejects.toBeInstanceOf(InsufficientCreditsError);

      expect(storage.uploadFile).not.toHaveBeenCalled();
      expect(credits.reserve).not.toHaveBeenCalled();
      expect(db.bills).toHaveLength(0);
    });

    it('uploadImage sem saldo: recusa ANTES de enviar ao S3', async () => {
      const bill = db.addBill({ status: BillStatus.OCR_FAILED });
      db.creditTransactions.length = 0;

      await expect(
        service.uploadImage(bill.id, file, USER),
      ).rejects.toBeInstanceOf(InsufficientCreditsError);

      expect(storage.uploadFile).not.toHaveBeenCalled();
    });

    it('com saldo: envia ao S3 e a reserva (não a pré-checagem) debita', async () => {
      await service.create(file, USER, { establishmentName: 'Bar' } as any);

      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
      expect(credits.getBalance).toHaveBeenCalledTimes(1);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
      expect(db.availableCredits(USER)).toBe(2);
    });

    it('se a consulta de saldo falhar, o fluxo segue e a reserva decide', async () => {
      db.failBalanceWith = new Error(SECRET);

      await service.create(file, USER, { establishmentName: 'Bar' } as any);

      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
      expect(credits.reserve).toHaveBeenCalledTimes(1);
    });

    it('a pré-checagem não substitui a reserva: saldo some entre as duas, 402 e nada criado', async () => {
      storage.uploadFile.mockImplementationOnce(async () => {
        db.creditTransactions.length = 0; // outro pedido gastou o último crédito
        return { key: IMAGE_2, url: `https://img.test/${IMAGE_2}` };
      });

      await expect(
        service.create(file, USER, { establishmentName: 'Bar' } as any),
      ).rejects.toBeInstanceOf(InsufficientCreditsError);

      expect(db.bills).toHaveLength(0);
      expect(db.jobs).toHaveLength(0);
    });

    it('conta isenta (UNLIMITED) não é barrada', async () => {
      db.creditTransactions.length = 0;
      db.unlimitedUsers.add(USER);

      await service.create(file, USER, { establishmentName: 'Bar' } as any);

      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
      expect(db.creditReservations).toHaveLength(0);
    });
  });

  describe('cobrança DESLIGADA: nada muda', () => {
    it.each([['false'], [undefined]])(
      'bandeira %p: criar, repetir, anexar e reprocessar sem tocar no ledger',
      async (flag) => {
        build(flag as string | undefined);
        db.creditTransactions.length = 0; // até sem saldo nada é barrado

        const first = await createWithImage();
        const replay = await createWithImage();
        await service.create(file, USER, { establishmentName: 'Bar' } as any);
        const failed = db.addBill({
          status: BillStatus.OCR_FAILED,
          imageKey: IMAGE_1,
        });
        db.addJob(failed.id, {
          status: OcrJobStatus.FAILED,
          imageKey: IMAGE_1,
        });
        await service.retryOcr(failed.id, USER);

        expect(replay.id).toBe(first.id);
        expect(storage.uploadFile).toHaveBeenCalledTimes(1);
        expect(credits.reserve).not.toHaveBeenCalled();
        expect(credits.consume).not.toHaveBeenCalled();
        expect(credits.release).not.toHaveBeenCalled();
        expect(credits.getBalance).not.toHaveBeenCalled();
        expect(db.creditReservations).toHaveLength(0);
        expect(db.creditTransactions).toHaveLength(0);
      },
    );
  });
});
