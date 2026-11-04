import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';
import { BillsService } from '../bills/bills.service';
import { FakeOcrDb, deferred, flush } from './ocr-fake-db.testing-spec';

/**
 * Cron concorrente e disparo do processamento, contra um banco FALSO em memória.
 *
 * Na Vercel cada invocação do cron pode cair em uma instância diferente, com a
 * sua própria memória (`activeWorkers`), e a entrega do cron pode ser duplicada.
 * Aqui duas instâncias de OcrQueueService compartilham o mesmo banco falso.
 *
 * O QUE ESTES TESTES PROVAM: o claim por `status` faz um job ser lido por uma
 * execução só, mesmo com várias instâncias; `maxJobsPerRun` e a concorrência
 * limitam o trabalho por chamada; o limite de concorrência é POR INSTÂNCIA (não
 * global); `pollQueue` e o disparo no envio não processam quando existe VERCEL.
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): a atomicidade real do UPDATE
 * condicional sob concorrência de verdade (ramo P2025 do claim). NÃO VALIDADO em
 * Postgres real.
 */
describe('OcrQueueService: cron concorrente e disparo (banco falso)', () => {
  const USER = 'user-1';
  const originalVercel = process.env.VERCEL;

  let db: FakeOcrDb;
  let credits: ReturnType<FakeOcrDb['fakeCredits']>;
  let ocrService: { processImage: jest.Mock };
  let metrics: Record<string, jest.Mock>;

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
    env: Record<string, string | undefined> = {},
    flag: string | undefined = undefined,
  ): any => {
    process.env.OCR_QUEUE_RETRY_DELAY_MS = '0';
    for (const name of [
      'OCR_QUEUE_CONCURRENCY',
      'OCR_QUEUE_MAX_JOBS_PER_RUN',
      'OCR_QUEUE_MAX_ATTEMPTS',
    ]) {
      delete process.env[name];
    }
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (flag === undefined) delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    else process.env.CREDITS_ENFORCEMENT_ENABLED = flag;

    const Ctor = OcrQueueService as unknown as new (...args: unknown[]) => any;
    return new Ctor(
      db.client(),
      ocrService,
      metrics,
      { isUsingS3: () => false, getSignedUrl: jest.fn() },
      credits,
    );
  };

  /** Conta com imagem e job PENDING já disponível. */
  const seedJob = (n: number) => {
    const bill = db.addBill({ imageKey: `bills/user-1/${n}.jpg` });
    const job = db.addJob(bill.id, { imageKey: `bills/user-1/${n}.jpg` });
    return { bill, job };
  };

  beforeEach(() => {
    delete process.env.VERCEL;
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
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    for (const name of [
      'OCR_QUEUE_CONCURRENCY',
      'OCR_QUEUE_MAX_JOBS_PER_RUN',
      'OCR_QUEUE_MAX_ATTEMPTS',
      'OCR_QUEUE_RETRY_DELAY_MS',
      'CREDITS_ENFORCEMENT_ENABLED',
    ]) {
      delete process.env[name];
    }
  });

  describe('duas instâncias sobre o mesmo banco', () => {
    it.each([[undefined], ['true']])(
      'um job, dois crons (bandeira %p): uma execução, um resultado, no máximo um consume',
      async (flag) => {
        const a = newQueue({ OCR_QUEUE_MAX_JOBS_PER_RUN: '1' }, flag);
        const b = newQueue({ OCR_QUEUE_MAX_JOBS_PER_RUN: '1' }, flag);
        const bill = db.addBill({ imageKey: 'bills/user-1/x.jpg' });
        await a.enqueue(bill.id, USER, { imageKey: 'bills/user-1/x.jpg' });
        const gate = deferred<any>();
        ocrService.processImage.mockReturnValue(gate.promise);

        const runA = a.processPendingJobs();
        const runB = b.processPendingJobs();
        await flush();

        expect(ocrService.processImage).toHaveBeenCalledTimes(1);

        gate.resolve(okResult());
        const results = await Promise.all([runA, runB]);

        expect(results.map((r: any) => r.processed).sort()).toEqual([0, 1]);
        expect(db.jobs[0]).toMatchObject({
          status: OcrJobStatus.COMPLETED,
          attempts: 1,
        });
        expect(db.items).toHaveLength(1);
        expect(credits.consume).toHaveBeenCalledTimes(flag === 'true' ? 1 : 0);
      },
    );

    it('CARACTERIZAÇÃO: quem perde a corrida pelo mesmo job fica sem trabalho no tick; o outro job espera o próximo', async () => {
      const a = newQueue({ OCR_QUEUE_MAX_JOBS_PER_RUN: '1' });
      const b = newQueue({ OCR_QUEUE_MAX_JOBS_PER_RUN: '1' });
      seedJob(1);
      seedJob(2);
      const gate = deferred<any>();
      ocrService.processImage.mockReturnValueOnce(gate.promise);

      const runA = a.processPendingJobs();
      const runB = b.processPendingJobs();
      await flush();

      // As duas leem o job mais antigo; só uma vence o claim e a outra não
      // tenta o segundo job neste tick
      expect(ocrService.processImage).toHaveBeenCalledTimes(1);
      gate.resolve(okResult());
      const results = await Promise.all([runA, runB]);
      expect(results.map((r: any) => r.processed).sort()).toEqual([0, 1]);
      expect(db.jobs.map((j) => j.status)).toEqual([
        OcrJobStatus.COMPLETED,
        OcrJobStatus.PENDING,
      ]);

      // No tick seguinte o segundo job sai, uma vez só
      await b.processPendingJobs();
      expect(db.jobs.map((j) => [j.status, j.attempts])).toEqual([
        [OcrJobStatus.COMPLETED, 1],
        [OcrJobStatus.COMPLETED, 1],
      ]);
      expect(ocrService.processImage).toHaveBeenCalledTimes(2);
    });

    it('CARACTERIZAÇÃO: o limite de concorrência é por instância, não global', async () => {
      const a = newQueue({
        OCR_QUEUE_CONCURRENCY: '1',
        OCR_QUEUE_MAX_JOBS_PER_RUN: '1',
      });
      const b = newQueue({
        OCR_QUEUE_CONCURRENCY: '1',
        OCR_QUEUE_MAX_JOBS_PER_RUN: '1',
      });
      seedJob(1);
      seedJob(2);
      const gates = [deferred<any>(), deferred<any>()];
      ocrService.processImage
        .mockReturnValueOnce(gates[0].promise)
        .mockReturnValueOnce(gates[1].promise);

      const first = a.processPendingJobs();
      await flush();
      // A está cheia: não pega o segundo job
      const secondOnA = await a.processPendingJobs();
      expect(secondOnA).toMatchObject({ processed: 0, activeWorkers: 1 });
      expect(ocrService.processImage).toHaveBeenCalledTimes(1);

      // B tem a própria memória e pega o segundo job: 2 leituras ao mesmo tempo
      const other = b.processPendingJobs();
      await flush();
      expect(ocrService.processImage).toHaveBeenCalledTimes(2);

      gates.forEach((gate) => gate.resolve(okResult()));
      await Promise.all([first, other]);
    });
  });

  describe('maxJobsPerRun e concorrência', () => {
    it('com maxJobsPerRun=1 uma chamada processa um job, mesmo com a fila cheia', async () => {
      const queue = newQueue({
        OCR_QUEUE_CONCURRENCY: '2',
        OCR_QUEUE_MAX_JOBS_PER_RUN: '1',
      });
      [1, 2, 3].forEach(seedJob);

      const result = await queue.processPendingJobs();

      expect(result.processed).toBe(1);
      expect(
        db.jobs.filter((j) => j.status === OcrJobStatus.PENDING),
      ).toHaveLength(2);
    });

    it('o argumento maxJobs vale, mas nunca passa da concorrência', async () => {
      const queue = newQueue({
        OCR_QUEUE_CONCURRENCY: '2',
        OCR_QUEUE_MAX_JOBS_PER_RUN: '1',
      });
      [1, 2, 3, 4, 5].forEach(seedJob);

      expect((await queue.processPendingJobs(2)).processed).toBe(2);
      expect((await queue.processPendingJobs(5)).processed).toBe(2);
      expect((await queue.processPendingJobs(0)).processed).toBe(1); // mínimo 1
    });

    it('fila vazia: processa zero e não chama a OpenAI', async () => {
      const queue = newQueue();

      expect(await queue.processPendingJobs()).toEqual({
        processed: 0,
        activeWorkers: 0,
      });
      expect(ocrService.processImage).not.toHaveBeenCalled();
    });

    it('padrão de maxJobsPerRun: 1 na Vercel, a concorrência fora dela, e a variável vence', async () => {
      process.env.VERCEL = '1';
      const onVercel = newQueue({ OCR_QUEUE_CONCURRENCY: '2' });
      expect((await onVercel.getQueueSnapshot()).maxJobsPerRun).toBe(1);

      const overridden = newQueue({
        OCR_QUEUE_CONCURRENCY: '2',
        OCR_QUEUE_MAX_JOBS_PER_RUN: '3',
      });
      expect((await overridden.getQueueSnapshot()).maxJobsPerRun).toBe(3);

      delete process.env.VERCEL;
      const local = newQueue({ OCR_QUEUE_CONCURRENCY: '2' });
      expect((await local.getQueueSnapshot()).maxJobsPerRun).toBe(2);
    });
  });

  describe('com VERCEL definido o cron é o único gatilho', () => {
    it('pollQueue não processa quando existe VERCEL e processa fora dela', async () => {
      const queue = newQueue();
      const spy = jest
        .spyOn(queue, 'processPendingJobs')
        .mockResolvedValue({ processed: 0, activeWorkers: 0 });

      process.env.VERCEL = '1';
      await queue.pollQueue();
      expect(spy).not.toHaveBeenCalled();

      delete process.env.VERCEL;
      await queue.pollQueue();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    describe('disparo imediato no envio (BillsService)', () => {
      const IMAGE = 'bills/user-1/foto.jpg';

      const buildBills = (queue: any) => {
        const storage = {
          isOwnedObjectKey: jest.fn().mockReturnValue(true),
          getFileUrl: jest.fn(async (key: string) => `https://img.test/${key}`),
        };
        const Ctor = BillsService as unknown as new (
          ...args: unknown[]
        ) => BillsService;
        return new Ctor(db.client(), storage, queue, {});
      };

      it('com VERCEL: cria a conta e o job, mas NÃO dispara o processamento', async () => {
        process.env.VERCEL = '1';
        const queue = newQueue();
        const spy = jest
          .spyOn(queue, 'processPendingJobs')
          .mockResolvedValue({ processed: 0, activeWorkers: 0 });

        await buildBills(queue).create(undefined, USER, {
          imageKey: IMAGE,
          establishmentName: 'Bar',
        } as any);

        expect(db.jobs).toHaveLength(1);
        expect(db.jobs[0].status).toBe(OcrJobStatus.PENDING);
        expect(spy).not.toHaveBeenCalled();
      });

      it('sem VERCEL (local): dispara o processamento uma vez', async () => {
        const queue = newQueue();
        const spy = jest
          .spyOn(queue, 'processPendingJobs')
          .mockResolvedValue({ processed: 0, activeWorkers: 0 });

        await buildBills(queue).create(undefined, USER, {
          imageKey: IMAGE,
          establishmentName: 'Bar',
        } as any);

        expect(spy).toHaveBeenCalledTimes(1);
      });

      it('sem VERCEL: falha do disparo não derruba a criação da conta', async () => {
        const queue = newQueue();
        jest
          .spyOn(queue, 'processPendingJobs')
          .mockRejectedValue(new Error('SEGREDO-mensagem-crua'));
        const errorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => undefined);

        const created: any = await buildBills(queue).create(undefined, USER, {
          imageKey: IMAGE,
          establishmentName: 'Bar',
        } as any);
        await flush();

        expect(created.status).toBe(BillStatus.PENDING_OCR);
        expect(errorSpy).toHaveBeenCalled();
      });
    });
  });
});
