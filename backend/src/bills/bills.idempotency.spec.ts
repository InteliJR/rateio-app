import 'reflect-metadata';
import {
  BadRequestException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { BillsService } from './bills.service';
import { parseIdempotencyKey } from './bill-idempotency';
import { OcrQueueService } from '../ocr/ocr-queue.service';
import { FakeOcrDb } from '../ocr/ocr-fake-db.testing-spec';

/**
 * Idempotência das operações de criar/anexar/reprocessar (cabeçalho Idempotency-Key),
 * contra um banco FALSO em memória (ver ocr-fake-db.testing-spec.ts), com a fila real.
 *
 * O QUE ESTES TESTES PROVAM: a lógica de replay, de conflito (422), de rollback da
 * transação e de "um job por conta" nas operações do BillsService.
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): o índice único real em
 * (userId, key) e o erro P2002 real, a espera da requisição perdedora pelo índice,
 * isolamento de transação e o SQL da migração. A corrida entre duas requisições
 * com a mesma chave é simulada intercalando instruções do banco falso.
 */
describe('BillsService: idempotência (Idempotency-Key, banco falso)', () => {
  const USER = 'user-1';
  const KEY_A = '3f6c1a52-0d1e-4b7e-9a2f-5d6f7a8b9c01';
  const KEY_B = '9b1d5c3e-7a44-4f0e-8c25-1a2b3c4d5e02';
  const IMAGE_1 = 'bills/user-1/foto-1.jpg';
  const IMAGE_2 = 'bills/user-1/foto-2.jpg';

  let db: FakeOcrDb;
  let queue: any;
  let storage: Record<string, jest.Mock>;
  let metrics: Record<string, jest.Mock>;
  let service: BillsService;

  beforeEach(() => {
    // Na Vercel o processamento é disparado por cron; aqui não dispara a fila
    process.env.VERCEL = '1';
    db = new FakeOcrDb();
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

    const QueueCtor = OcrQueueService as unknown as new (
      ...args: unknown[]
    ) => unknown;
    queue = new QueueCtor(db.client(), {}, metrics, storage);

    const ServiceCtor = BillsService as unknown as new (
      ...args: unknown[]
    ) => BillsService;
    service = new ServiceCtor(db.client(), storage, queue, {});

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.VERCEL;
  });

  describe('cenário 1: criar conta com imagem', () => {
    it('o mesmo envio com a mesma chave gera 1 conta e 1 job', async () => {
      const first: any = await service.create(
        undefined,
        USER,
        { imageKey: IMAGE_1, establishmentName: 'Bar' } as any,
        KEY_A,
      );
      const second: any = await service.create(
        undefined,
        USER,
        { imageKey: IMAGE_1, establishmentName: 'Bar' } as any,
        KEY_A,
      );

      expect(first.idempotentReplay).toBeUndefined();
      expect(second.idempotentReplay).toBe(true);
      expect(second.id).toBe(first.id);
      expect(db.bills).toHaveLength(1);
      expect(db.jobs).toHaveLength(1);
      expect(db.idempotencyKeys).toHaveLength(1);
      expect(db.idempotencyKeys[0]).toMatchObject({
        userId: USER,
        key: KEY_A,
        operation: 'CREATE_WITH_IMAGE',
        billId: first.id,
        ocrJobId: db.jobs[0].id,
      });
      expect(metrics.recordOcrQueued).toHaveBeenCalledTimes(1);
    });

    it('dois envios simultâneos com a mesma chave geram 1 conta e 1 job', async () => {
      const dto = { imageKey: IMAGE_1 } as any;

      const [a, b]: any[] = await Promise.all([
        service.create(undefined, USER, dto, KEY_A),
        service.create(undefined, USER, dto, KEY_A),
      ]);

      expect(a.id).toBe(b.id);
      expect([a, b].filter((r) => r.idempotentReplay)).toHaveLength(1);
      // A transação perdedora foi desfeita: sem conta nem job órfãos
      expect(db.bills).toHaveLength(1);
      expect(db.jobs).toHaveLength(1);
      expect(db.idempotencyKeys).toHaveLength(1);
    });

    it('sem o cabeçalho o comportamento anterior é preservado (uma conta por chamada)', async () => {
      const dto = { imageKey: IMAGE_1 } as any;

      const a: any = await service.create(undefined, USER, dto);
      const b: any = await service.create(undefined, USER, dto);

      expect(a.id).not.toBe(b.id);
      expect(a.idempotentReplay).toBeUndefined();
      expect(db.bills).toHaveLength(2);
      expect(db.jobs).toHaveLength(2);
      expect(db.idempotencyKeys).toHaveLength(0);
    });

    it('a mesma chave com outro payload é recusada com 422 e nada é criado', async () => {
      await service.create(
        undefined,
        USER,
        { imageKey: IMAGE_1 } as any,
        KEY_A,
      );

      await expect(
        service.create(undefined, USER, { imageKey: IMAGE_2 } as any, KEY_A),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(db.bills).toHaveLength(1);
      expect(db.jobs).toHaveLength(1);
    });

    it('a chave vale por usuário: outro usuário com a mesma chave cria a própria conta', async () => {
      await service.create(
        undefined,
        USER,
        { imageKey: IMAGE_1 } as any,
        KEY_A,
      );

      const other: any = await service.create(
        undefined,
        'user-2',
        { imageKey: IMAGE_1 } as any,
        KEY_A,
      );

      expect(other.idempotentReplay).toBeUndefined();
      expect(db.bills).toHaveLength(2);
    });

    it('falha ao enfileirar desfaz a conta (mesma transação)', async () => {
      jest.spyOn(queue, 'enqueue').mockRejectedValueOnce(new Error('falha'));

      await expect(
        service.create(undefined, USER, { imageKey: IMAGE_1 } as any, KEY_A),
      ).rejects.toThrow('falha');

      expect(db.bills).toHaveLength(0);
      expect(db.idempotencyKeys).toHaveLength(0);
    });

    it('multipart: consulta a chave ANTES do upload ao S3 e o hash cobre só metadados', async () => {
      const file = { mimetype: 'image/jpeg', size: 1000 } as any;

      const first: any = await service.create(file, USER, {} as any, KEY_A);
      const second: any = await service.create(file, USER, {} as any, KEY_A);

      expect(second.idempotentReplay).toBe(true);
      expect(second.id).toBe(first.id);
      // Replay não envia o arquivo de novo
      expect(storage.uploadFile).toHaveBeenCalledTimes(1);

      // Outro tamanho com a mesma chave: 422 antes de qualquer upload
      await expect(
        service.create(
          { mimetype: 'image/jpeg', size: 2000 } as any,
          USER,
          {} as any,
          KEY_A,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('cenário 2: anexar imagem', () => {
    it('com o job RUNNING não altera o job, só aponta a conta para a imagem nova', async () => {
      const bill = db.addBill({
        imageKey: IMAGE_1,
        status: BillStatus.PENDING_OCR,
      });
      const job = db.addJob(bill.id, {
        status: OcrJobStatus.RUNNING,
        attempts: 1,
        lockedAt: new Date(),
        imageKey: IMAGE_1,
      });
      const before = { ...job };

      const result: any = await service.attachUploadedImage(
        bill.id,
        { imageKey: IMAGE_2 },
        USER,
        KEY_A,
      );

      expect(result.imageKey).toBe(IMAGE_2);
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect({ ...job }).toEqual(before);
      expect(db.jobs).toHaveLength(1);
    });

    it('a mesma chave duas vezes enfileira uma vez e devolve a conta no replay', async () => {
      const bill = db.addBill({
        imageKey: IMAGE_1,
        status: BillStatus.REVIEWING,
      });
      db.addJob(bill.id, {
        status: OcrJobStatus.COMPLETED,
        imageKey: IMAGE_1,
        attempts: 1,
      });

      const first: any = await service.attachUploadedImage(
        bill.id,
        { imageKey: IMAGE_2 },
        USER,
        KEY_A,
      );
      const second: any = await service.attachUploadedImage(
        bill.id,
        { imageKey: IMAGE_2 },
        USER,
        KEY_A,
      );

      expect(first.idempotentReplay).toBeUndefined();
      expect(second.idempotentReplay).toBe(true);
      expect(db.jobs).toHaveLength(1);
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        imageKey: IMAGE_2,
      });
      expect(metrics.recordOcrQueued).toHaveBeenCalledTimes(1);
    });

    it('a mesma chave em outra operação é recusada com 422', async () => {
      const bill = db.addBill({ imageKey: IMAGE_1 });
      await service.attachUploadedImage(
        bill.id,
        { imageKey: IMAGE_2 },
        USER,
        KEY_A,
      );
      db.addBill({ id: 'bill-ocr-failed', status: BillStatus.OCR_FAILED });

      await expect(
        service.retryOcr('bill-ocr-failed', USER, KEY_A),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('falha ao enfileirar desfaz a troca de imagem da conta', async () => {
      const bill = db.addBill({
        imageKey: IMAGE_1,
        status: BillStatus.REVIEWING,
      });
      jest.spyOn(queue, 'enqueue').mockRejectedValueOnce(new Error('falha'));

      await expect(
        service.attachUploadedImage(
          bill.id,
          { imageKey: IMAGE_2 },
          USER,
          KEY_A,
        ),
      ).rejects.toThrow('falha');

      expect(bill.imageKey).toBe(IMAGE_1);
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(db.idempotencyKeys).toHaveLength(0);
    });
  });

  describe('cenário 6: pedir nova leitura (retryOcr)', () => {
    const seedFailed = () => {
      const bill = db.addBill({
        id: 'bill-failed',
        imageKey: IMAGE_1,
        status: BillStatus.OCR_FAILED,
      });
      const job = db.addJob(bill.id, {
        status: OcrJobStatus.FAILED,
        attempts: 3,
        imageKey: IMAGE_1,
        lastError: 'erro',
      });
      db.addItem(bill.id, { name: 'item parcial' });
      return { bill, job };
    };

    it('dois retryOcr simultâneos geram 1 job', async () => {
      const { bill, job } = seedFailed();

      const results = await Promise.allSettled([
        service.retryOcr(bill.id, USER),
        service.retryOcr(bill.id, USER),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as any;
      expect(rejected.reason).toBeInstanceOf(BadRequestException);
      expect(db.jobs).toHaveLength(1);
      expect(job).toMatchObject({ status: OcrJobStatus.PENDING, attempts: 0 });
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(db.items).toHaveLength(0);
      expect(metrics.recordOcrQueued).toHaveBeenCalledTimes(1);
    });

    it('dois retryOcr seguidos sem chave: o segundo é recusado e continua 1 job', async () => {
      const { bill } = seedFailed();

      await service.retryOcr(bill.id, USER);
      await expect(service.retryOcr(bill.id, USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(db.jobs).toHaveLength(1);
      expect(metrics.recordOcrQueued).toHaveBeenCalledTimes(1);
    });

    it('dois retryOcr seguidos com a mesma chave: o segundo é replay, sem novo job', async () => {
      const { bill } = seedFailed();

      const first: any = await service.retryOcr(bill.id, USER, KEY_B);
      const second: any = await service.retryOcr(bill.id, USER, KEY_B);

      expect(first.idempotentReplay).toBeUndefined();
      expect(second.idempotentReplay).toBe(true);
      expect(db.jobs).toHaveLength(1);
      expect(metrics.recordOcrQueued).toHaveBeenCalledTimes(1);
    });

    it('conta fora de OCR_FAILED continua sendo recusada (regra existente)', async () => {
      const bill = db.addBill({ status: BillStatus.REVIEWING });

      await expect(service.retryOcr(bill.id, USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('cabeçalho Idempotency-Key', () => {
    it('ausente: sem idempotência', () => {
      expect(parseIdempotencyKey(undefined)).toBeUndefined();
      expect(parseIdempotencyKey('')).toBeUndefined();
    });

    it('UUID válido é aceito (normalizado em minúsculas)', () => {
      expect(parseIdempotencyKey(KEY_A.toUpperCase())).toBe(KEY_A);
    });

    it('valor que não é UUID é recusado com 400', () => {
      expect(() => parseIdempotencyKey('nao-e-uuid')).toThrow(
        BadRequestException,
      );
    });
  });
});
