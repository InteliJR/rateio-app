import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';
import { FakeOcrDb, deferred, flush } from './ocr-fake-db.testing-spec';

/**
 * Idempotência e concorrência da fila de OCR, contra um banco FALSO em memória
 * (ver ocr-fake-db.testing-spec.ts).
 *
 * O QUE ESTES TESTES PROVAM: a lógica de decisão do enqueue condicional, do token
 * de execução, do descarte de resultados e do R5, com operações que intercalam
 * entre instruções.
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): índice único real, atomicidade e
 * bloqueio reais do updateMany sob concorrência de verdade, isolamento de
 * transação, execução do SQL da migração e comportamento do pooler.
 */
describe('OcrQueueService: idempotência e jobs concorrentes (banco falso)', () => {
  const USER = 'user-1';
  const OLD_KEY = 'bills/user-1/old.jpg';
  const NEW_KEY = 'bills/user-1/new.jpg';

  let db: FakeOcrDb;
  let ocrService: { processImage: jest.Mock };
  let metrics: Record<string, jest.Mock>;
  let queue: any;

  const okResult = (name = 'Item') => ({
    rawText: 'texto bruto de teste suficientemente longo',
    establishmentName: 'Bar do Teste',
    totalAmount: 10,
    items: [
      {
        name,
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 10,
        totalPrice: 10,
      },
    ],
  });

  const build = (env: Record<string, string> = {}) => {
    // Uma execução por chamada de processPendingJobs, para o teste controlar cada passo
    process.env.OCR_QUEUE_MAX_JOBS_PER_RUN = '1';
    process.env.OCR_QUEUE_RETRY_DELAY_MS = '0';
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
    Object.assign(process.env, env);

    const Ctor = OcrQueueService as unknown as new (
      ...args: unknown[]
    ) => unknown;
    queue = new Ctor(db.client(), ocrService, metrics, {
      isUsingS3: () => false,
      getSignedUrl: jest.fn(),
    });
  };

  const seed = (jobData: Record<string, unknown> = {}) => {
    const bill = db.addBill({ imageKey: OLD_KEY });
    const job = db.addJob(bill.id, { imageKey: OLD_KEY, ...jobData });
    return { bill, job };
  };

  beforeEach(() => {
    db = new FakeOcrDb();
    ocrService = { processImage: jest.fn() };
    metrics = {
      recordOcrQueued: jest.fn(),
      recordOcrStarted: jest.fn(),
      recordOcrCompleted: jest.fn(),
      recordOcrRetry: jest.fn(),
      recordOcrFailed: jest.fn(),
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OCR_QUEUE_MAX_JOBS_PER_RUN;
    delete process.env.OCR_QUEUE_RETRY_DELAY_MS;
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
  });

  describe('enqueue condicional (R2)', () => {
    it('cria o job quando a conta ainda não tem um', async () => {
      const bill = db.addBill({ imageKey: OLD_KEY });

      const { job, enqueued } = await queue.enqueue(bill.id, USER, {
        imageKey: OLD_KEY,
      });

      expect(enqueued).toBe(true);
      expect(job).toMatchObject({
        billId: bill.id,
        status: OcrJobStatus.PENDING,
        attempts: 0,
        imageKey: OLD_KEY,
      });
      expect(db.jobs).toHaveLength(1);
      expect(metrics.recordOcrQueued).toHaveBeenCalledTimes(1);
    });

    it('não altera um job RUNNING (cenário 2: anexar imagem com o job em andamento)', async () => {
      const { bill, job } = seed({
        status: OcrJobStatus.RUNNING,
        attempts: 1,
        lockedAt: new Date(),
        startedAt: new Date(),
      });
      const before = { ...job };

      const result = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });

      expect(result.enqueued).toBe(false);
      expect(db.jobs).toHaveLength(1);
      expect({ ...db.jobs[0] }).toEqual(before);
      expect(metrics.recordOcrQueued).not.toHaveBeenCalled();
    });

    it('não reinicia um job RUNNING nem em pedido explícito de reprocessamento', async () => {
      const { bill, job } = seed({
        status: OcrJobStatus.RUNNING,
        attempts: 2,
        lockedAt: new Date(),
      });
      const before = { ...job };

      const result = await queue.enqueue(bill.id, USER, {
        imageKey: OLD_KEY,
        reprocess: true,
      });

      expect(result.enqueued).toBe(false);
      expect({ ...db.jobs[0] }).toEqual(before);
    });

    it('mantém um job PENDING e só aponta para a imagem mais recente', async () => {
      const { bill } = seed({ status: OcrJobStatus.PENDING, attempts: 1 });

      const result = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });

      expect(result.enqueued).toBe(false);
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 1,
        imageKey: NEW_KEY,
      });
    });

    it('não recria um job COMPLETED com a mesma imagem', async () => {
      const { bill, job } = seed({
        status: OcrJobStatus.COMPLETED,
        attempts: 1,
        finishedAt: new Date(),
      });
      const before = { ...job };

      const result = await queue.enqueue(bill.id, USER, { imageKey: OLD_KEY });

      expect(result.enqueued).toBe(false);
      expect({ ...db.jobs[0] }).toEqual(before);
    });

    it('recria um job COMPLETED quando a imagem mudou', async () => {
      const { bill } = seed({
        status: OcrJobStatus.COMPLETED,
        attempts: 2,
        finishedAt: new Date(),
      });

      const result = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });

      expect(result.enqueued).toBe(true);
      expect(db.jobs).toHaveLength(1);
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        finishedAt: null,
        imageKey: NEW_KEY,
      });
    });

    it('recria um job COMPLETED de linhas antigas (imageKey nulo) quando chega imagem nova', async () => {
      const { bill } = seed({
        status: OcrJobStatus.COMPLETED,
        imageKey: null,
      });

      const result = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });

      expect(result.enqueued).toBe(true);
      expect(db.jobs[0].status).toBe(OcrJobStatus.PENDING);
    });

    it('recria um job FAILED', async () => {
      const { bill } = seed({
        status: OcrJobStatus.FAILED,
        attempts: 3,
        lastError: 'erro',
      });

      const result = await queue.enqueue(bill.id, USER, { imageKey: OLD_KEY });

      expect(result.enqueued).toBe(true);
      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        lastError: null,
      });
    });

    it('recria um job COMPLETED da mesma imagem só em pedido explícito (retryOcr)', async () => {
      const { bill } = seed({ status: OcrJobStatus.COMPLETED });

      const result = await queue.enqueue(bill.id, USER, {
        imageKey: OLD_KEY,
        reprocess: true,
      });

      expect(result.enqueued).toBe(true);
      expect(db.jobs[0].status).toBe(OcrJobStatus.PENDING);
    });

    it('duas chamadas simultâneas geram um único job', async () => {
      const bill = db.addBill({ imageKey: OLD_KEY });

      const [a, b] = await Promise.all([
        queue.enqueue(bill.id, USER, { imageKey: OLD_KEY }),
        queue.enqueue(bill.id, USER, { imageKey: OLD_KEY }),
      ]);

      expect(db.jobs).toHaveLength(1);
      expect([a.enqueued, b.enqueued].filter(Boolean)).toHaveLength(1);
      expect(a.job.id).toBe(b.job.id);
    });
  });

  describe('execução única (R4)', () => {
    it('cenário 3: duas execuções simultâneas da fila geram uma única execução do job', async () => {
      seed();
      const gate = deferred<any>();
      ocrService.processImage.mockReturnValue(gate.promise);

      const first = queue.processPendingJobs();
      const second = queue.processPendingJobs();
      await flush();

      expect(ocrService.processImage).toHaveBeenCalledTimes(1);

      gate.resolve(okResult());
      await Promise.all([first, second]);

      expect(db.jobs[0]).toMatchObject({
        status: OcrJobStatus.COMPLETED,
        attempts: 1,
      });
      expect(db.items).toHaveLength(1);
    });

    it('cenário 4: lock vencido com chamada em andamento grava no máximo 1 resultado', async () => {
      const { bill, job } = seed();
      const gateA = deferred<any>();
      const gateB = deferred<any>();
      ocrService.processImage
        .mockReturnValueOnce(gateA.promise)
        .mockReturnValueOnce(gateB.promise);

      const runA = queue.processPendingJobs();
      await flush();
      expect(job.attempts).toBe(1);

      // O lock da execução A vence; outro processador libera e reivindica o job
      job.lockedAt = new Date(Date.now() - 10 * 60 * 1000);
      const runB = queue.processPendingJobs();
      await flush();

      expect(ocrService.processImage).toHaveBeenCalledTimes(2);
      expect(job.attempts).toBe(2);

      gateB.resolve(okResult('Resultado B'));
      await runB;
      expect(db.items.map((i) => i.name)).toEqual(['Resultado B']);

      // A termina tarde: o job já foi reivindicado por outro (attempts diferente)
      gateA.resolve(okResult('Resultado A'));
      await runA;

      expect(db.items.map((i) => i.name)).toEqual(['Resultado B']);
      expect(job).toMatchObject({
        status: OcrJobStatus.COMPLETED,
        attempts: 2,
      });
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(metrics.recordOcrCompleted).toHaveBeenCalledTimes(1);
    });

    it('lock liberado sem novo claim: o resultado já pago de A é aceito, uma vez', async () => {
      const { job } = seed();
      const gateA = deferred<any>();
      ocrService.processImage.mockReturnValueOnce(gateA.promise);

      const runA = queue.processPendingJobs();
      await flush();

      job.lockedAt = new Date(Date.now() - 10 * 60 * 1000);
      await queue.releaseStaleLocks();
      expect(job.status).toBe(OcrJobStatus.PENDING);

      gateA.resolve(okResult('Resultado A'));
      await runA;

      expect(db.items.map((i) => i.name)).toEqual(['Resultado A']);
      expect(job).toMatchObject({
        status: OcrJobStatus.COMPLETED,
        attempts: 1,
      });

      await queue.processPendingJobs();
      expect(ocrService.processImage).toHaveBeenCalledTimes(1);
    });

    it('uma falha tardia de uma execução que perdeu o job não mexe nele', async () => {
      const { job } = seed();
      const gateA = deferred<any>();
      const gateB = deferred<any>();
      ocrService.processImage
        .mockReturnValueOnce(gateA.promise)
        .mockReturnValueOnce(gateB.promise);

      const runA = queue.processPendingJobs();
      await flush();
      job.lockedAt = new Date(Date.now() - 10 * 60 * 1000);
      const runB = queue.processPendingJobs();
      await flush();

      gateA.reject(new Error('timeout tardio de A'));
      await runA;

      // B segue dono do job: nada de retentativa agendada por A
      expect(job).toMatchObject({
        status: OcrJobStatus.RUNNING,
        attempts: 2,
        lastError: null,
      });
      expect(metrics.recordOcrRetry).not.toHaveBeenCalled();

      gateB.resolve(okResult('Resultado B'));
      await runB;
      expect(job.status).toBe(OcrJobStatus.COMPLETED);
    });

    it('cenário 7: resultado que chega depois de a conta sair de PENDING_OCR é descartado e não mexe nos itens', async () => {
      const { bill, job } = seed();
      const edited = db.addItem(bill.id, { name: 'Item editado pelo usuário' });
      const gate = deferred<any>();
      ocrService.processImage.mockReturnValue(gate.promise);

      const run = queue.processPendingJobs();
      await flush();

      // Enquanto a leitura corre, a conta avança e o usuário já trabalhou nos itens
      bill.status = BillStatus.DIVIDING;

      gate.resolve(okResult('Item do OCR'));
      await run;

      expect(db.items).toEqual([edited]);
      expect(db.items[0].name).toBe('Item editado pelo usuário');
      expect(bill.status).toBe(BillStatus.DIVIDING);
      expect(bill.ocrRawText).toBeNull();
      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(metrics.recordOcrCompleted).not.toHaveBeenCalled();
    });
  });

  describe('imagem certa (R3)', () => {
    it('descarta o resultado da imagem antiga e reenfileira a imagem nova', async () => {
      const { bill, job } = seed();
      const gate1 = deferred<any>();
      const gate2 = deferred<any>();
      ocrService.processImage
        .mockReturnValueOnce(gate1.promise)
        .mockReturnValueOnce(gate2.promise);

      const run1 = queue.processPendingJobs();
      await flush();

      // O usuário anexa outra imagem com o job RUNNING: a conta muda, o job não
      bill.imageKey = NEW_KEY;
      bill.imageUrl = 'https://img.test/new.jpg';
      bill.status = BillStatus.PENDING_OCR;
      const attach = await queue.enqueue(bill.id, USER, { imageKey: NEW_KEY });
      expect(attach.enqueued).toBe(false);
      expect(job).toMatchObject({
        status: OcrJobStatus.RUNNING,
        attempts: 1,
        imageKey: OLD_KEY,
      });

      gate1.resolve(okResult('Imagem antiga'));
      await run1;

      // Resultado antigo descartado; job volta para a fila apontando para a imagem nova
      expect(db.items).toHaveLength(0);
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        imageKey: NEW_KEY,
      });

      const run2 = queue.processPendingJobs();
      await flush();
      gate2.resolve(okResult('Imagem nova'));
      await run2;

      expect(db.items.map((i) => i.name)).toEqual(['Imagem nova']);
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(db.jobs).toHaveLength(1);
    });

    it('falha final de uma imagem antiga não marca a conta como OCR_FAILED: reenfileira a nova', async () => {
      build({ OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill, job } = seed();
      const gate = deferred<any>();
      ocrService.processImage.mockReturnValue(gate.promise);

      const run = queue.processPendingJobs();
      await flush();
      bill.imageKey = NEW_KEY;

      gate.reject(new Error('falha na imagem antiga'));
      await run;

      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 0,
        imageKey: NEW_KEY,
      });
    });
  });

  describe('retentativa e falha final (cenário 5 e R5)', () => {
    it('cenário 5: erro transitório gera nova tentativa no mesmo job, sem nova conta', async () => {
      const { bill, job } = seed();
      ocrService.processImage
        .mockRejectedValueOnce(new Error('erro transitório'))
        .mockResolvedValueOnce(okResult());

      await queue.processPendingJobs();

      // R5: enquanto há retentativa agendada a conta NÃO vira OCR_FAILED
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(job).toMatchObject({
        status: OcrJobStatus.PENDING,
        attempts: 1,
        lastError: 'erro transitório',
      });
      expect(metrics.recordOcrRetry).toHaveBeenCalledTimes(1);

      await queue.processPendingJobs();

      expect(job).toMatchObject({
        status: OcrJobStatus.COMPLETED,
        attempts: 2,
      });
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(db.bills).toHaveLength(1);
      expect(db.jobs).toHaveLength(1);
      expect(db.items).toHaveLength(1);
    });

    it('R5: resposta inválida com retentativa pendente não marca OCR_FAILED (guarda só o texto bruto)', async () => {
      const { bill, job } = seed();
      ocrService.processImage.mockResolvedValueOnce({
        rawText: 'texto bruto de teste suficientemente longo',
        items: [],
      });

      await queue.processPendingJobs();

      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(bill.ocrRawText).toBe(
        'texto bruto de teste suficientemente longo',
      );
      expect(job.status).toBe(OcrJobStatus.PENDING);
      expect(db.items).toHaveLength(0);
    });

    it('R5: só a falha final marca a conta como OCR_FAILED e o job como FAILED', async () => {
      build({ OCR_QUEUE_MAX_ATTEMPTS: '2' });
      const { bill, job } = seed();
      ocrService.processImage.mockRejectedValue(new Error('sempre falha'));

      await queue.processPendingJobs();
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
      expect(job.status).toBe(OcrJobStatus.PENDING);

      await queue.processPendingJobs();
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(job).toMatchObject({
        status: OcrJobStatus.FAILED,
        attempts: 2,
      });
      expect(metrics.recordOcrFailed).toHaveBeenCalledTimes(1);
      expect(ocrService.processImage).toHaveBeenCalledTimes(2);
    });
  });
});
