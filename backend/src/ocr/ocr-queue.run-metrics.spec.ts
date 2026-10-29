import 'reflect-metadata';
import {
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BillStatus,
  OcrErrorCategory,
  OcrJobStatus,
  OcrRunOutcome,
} from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';
import { OCR_PRICING_TABLES } from './ocr-pricing';
import { attachOcrFailure, buildOcrFailure } from './ocr-error-category';
import { OpenAiCallMetrics } from './ocr-run-metrics';
import { FakeOcrDb, deferred, flush } from './ocr-fake-db.testing-spec';

/**
 * Persistência das métricas por execução (ocr_run_metrics) contra um banco FALSO em
 * memória (ver ocr-fake-db.testing-spec.ts), com a OcrService simulada.
 *
 * Cenários: sucesso, timeout, retorno inválido, duplicidade e esgotamento.
 *
 * O QUE ESTES TESTES PROVAM: que cada saída da execução grava a sua linha, com a
 * categoria, os tokens e o custo certos, e que uma falha ao gravar nunca afeta o job.
 *
 * O QUE NÃO PROVAM (só um Postgres real prova): os tipos reais das colunas (enums,
 * DECIMAL(12,6), VARCHAR(64)), a execução do SQL da migração, concorrência e
 * atomicidade reais, nem uma leitura real na OpenAI (tokens e custo reais).
 */
describe('OcrQueueService: métricas por execução (banco falso)', () => {
  const SIGNED_URL =
    'https://img.test/old.jpg?X-Amz-Signature=ASSINATURASECRETA';
  const ERROR_MESSAGE = 'mensagem-crua-do-provedor com ASSINATURASECRETA';
  const FORBIDDEN = [
    'ASSINATURASECRETA',
    'amazonaws',
    'TEXTO-BRUTO',
    'Picanha Secreta',
    'Bar do Sigilo',
    'mensagem-crua',
    'userId',
  ];
  const ROW_KEYS = [
    'attempt',
    'billId',
    'completionTokens',
    'createdAt',
    'errorCategory',
    'errorCode',
    'estimatedCostUsd',
    'httpStatus',
    'id',
    'items',
    'model',
    'ocrJobId',
    'openaiCalls',
    'openaiMs',
    'outcome',
    'pricingVersion',
    'promptTokens',
    'providerRequestId',
    'provider',
    'queueWaitMs',
    'startedAt',
    'totalMs',
    'totalTokens',
  ];

  let db: FakeOcrDb;
  let ocrService: { processImage: jest.Mock };
  let metrics: Record<string, jest.Mock>;
  let queue: any;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const call = (over: Partial<OpenAiCallMetrics> = {}): OpenAiCallMetrics => ({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    openaiMs: 1200,
    openaiCalls: 1,
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    providerRequestId: 'req_abc123',
    ...over,
  });

  const okResult = (over: object = {}) => ({
    rawText: 'TEXTO-BRUTO suficientemente longo para ser válido',
    establishmentName: 'Bar do Sigilo',
    totalAmount: 10,
    items: [
      {
        name: 'Picanha Secreta',
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 10,
        totalPrice: 10,
      },
    ],
    ...over,
  });

  /** Simula a OcrService: entrega a medição da chamada e depois devolve o resultado. */
  const succeedWith =
    (result: object = okResult(), over: Partial<OpenAiCallMetrics> = {}) =>
    async (_url: string, context: any) => {
      context.onOpenAiCall(call(over));
      return result;
    };

  /** Simula a OcrService falhando como o código real: medição sem tokens e exceção classificada. */
  const failWith =
    (
      exception: Error,
      failure: ReturnType<typeof buildOcrFailure>,
      over: Partial<OpenAiCallMetrics> = {},
    ) =>
    async (_url: string, context: any) => {
      context.onOpenAiCall(
        call({
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          providerRequestId: null,
          ...over,
        }),
      );
      throw attachOcrFailure(exception, failure);
    };

  const build = (env: Record<string, string> = {}) => {
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

  const seed = (billData: Record<string, unknown> = {}) => {
    const bill = db.addBill({
      imageKey: 'bills/user-1/old.jpg',
      imageUrl: SIGNED_URL,
      ...billData,
    });
    const job = db.addJob(bill.id, { imageKey: bill.imageKey });
    return { bill, job };
  };

  const jobLines = () =>
    logSpy.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.startsWith('OCR_METRIC '))
      .map((line) => JSON.parse(line.replace(/^OCR_METRIC /, '')))
      .filter((metric) => metric.stage === 'job');

  const expectedCost = (prompt: number, completion: number) => {
    const price = OCR_PRICING_TABLES[0].models['gpt-4.1-mini'];
    return (
      Math.round(
        ((prompt * price.inputPerMillion +
          completion * price.outputPerMillion) /
          1_000_000) *
          1_000_000,
      ) / 1_000_000
    );
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
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OCR_QUEUE_MAX_JOBS_PER_RUN;
    delete process.env.OCR_QUEUE_RETRY_DELAY_MS;
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;
  });

  describe('sucesso', () => {
    it('grava uma linha COMPLETED com modelo, tokens, itens e custo estimado', async () => {
      const { bill, job } = seed();
      ocrService.processImage.mockImplementation(succeedWith());

      await queue.processPendingJobs();

      expect(db.runMetrics).toHaveLength(1);
      const row = db.runMetrics[0];
      expect(row).toMatchObject({
        ocrJobId: job.id,
        billId: bill.id,
        attempt: 1,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        outcome: OcrRunOutcome.COMPLETED,
        errorCategory: null,
        httpStatus: null,
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        openaiMs: 1200,
        openaiCalls: 1,
        items: 1,
        providerRequestId: 'req_abc123',
        estimatedCostUsd: expectedCost(1000, 500),
        pricingVersion: OCR_PRICING_TABLES[0].version,
      });
      expect(row.startedAt).toBeInstanceOf(Date);
      expect(row.queueWaitMs).toBeGreaterThanOrEqual(0);
      expect(row.totalMs).toBeGreaterThanOrEqual(0);
      expect(bill.status).toBe(BillStatus.REVIEWING);
    });

    it('a linha tem só as colunas previstas: sem userId, sem texto livre', async () => {
      seed();
      ocrService.processImage.mockImplementation(succeedWith());

      await queue.processPendingJobs();

      expect(Object.keys(db.runMetrics[0]).sort()).toEqual(
        [...ROW_KEYS].sort(),
      );
    });

    it('log OCR_METRIC e linha persistida usam a mesma medição (mesmo totalMs, mesma categoria)', async () => {
      seed();
      ocrService.processImage.mockImplementation(succeedWith());

      await queue.processPendingJobs();

      const [line] = jobLines();
      expect(line).toMatchObject({
        status: 'completed',
        errorCategory: null,
        items: 1,
        attempt: 1,
      });
      expect(line.totalMs).toBe(db.runMetrics[0].totalMs);
      expect(line.queueWaitMs).toBe(db.runMetrics[0].queueWaitMs);
    });

    it('modelo fora da tabela de preços: tokens gravados, custo null (nunca 0)', async () => {
      seed();
      ocrService.processImage.mockImplementation(
        succeedWith(okResult(), { model: 'modelo-sem-preco' }),
      );

      await queue.processPendingJobs();

      expect(db.runMetrics[0]).toMatchObject({
        model: 'modelo-sem-preco',
        promptTokens: 1000,
        estimatedCostUsd: null,
        pricingVersion: null,
      });
    });

    it('tokens ausentes: custo null', async () => {
      seed();
      ocrService.processImage.mockImplementation(
        succeedWith(okResult(), {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        }),
      );

      await queue.processPendingJobs();

      expect(db.runMetrics[0]).toMatchObject({
        promptTokens: null,
        estimatedCostUsd: null,
      });
    });
  });

  describe('timeout', () => {
    it('timeout do provedor: RETRY_SCHEDULED com categoria TIMEOUT, depois COMPLETED no mesmo job', async () => {
      const { job } = seed();
      ocrService.processImage
        .mockImplementationOnce(
          failWith(
            new InternalServerErrorException(ERROR_MESSAGE),
            buildOcrFailure('TIMEOUT'),
            { openaiCalls: 3, openaiMs: 31000 },
          ),
        )
        .mockImplementationOnce(succeedWith());

      await queue.processPendingJobs();
      await queue.processPendingJobs();

      expect(
        db.runMetrics.map((r) => [r.attempt, r.outcome, r.errorCategory]),
      ).toEqual([
        [1, OcrRunOutcome.RETRY_SCHEDULED, OcrErrorCategory.TIMEOUT],
        [2, OcrRunOutcome.COMPLETED, null],
      ]);
      expect(db.runMetrics.every((r) => r.ocrJobId === job.id)).toBe(true);
      expect(db.runMetrics[0]).toMatchObject({
        openaiCalls: 3,
        openaiMs: 31000,
        promptTokens: null,
        estimatedCostUsd: null,
      });
      expect(db.jobs).toHaveLength(1);
      expect(db.bills).toHaveLength(1);
    });

    it('guarda o status HTTP e o código curto do provedor', async () => {
      seed();
      ocrService.processImage.mockImplementationOnce(
        failWith(
          new ServiceUnavailableException(ERROR_MESSAGE),
          buildOcrFailure('TRANSIENT', {
            httpStatus: 429,
            errorCode: 'rate_limit_exceeded',
            providerRequestId: 'req_zzz',
          }),
        ),
      );

      await queue.processPendingJobs();

      expect(db.runMetrics[0]).toMatchObject({
        errorCategory: OcrErrorCategory.TRANSIENT,
        httpStatus: 429,
        errorCode: 'rate_limit_exceeded',
        providerRequestId: 'req_zzz',
      });
    });

    it('erro sem classificação anexada vira UNKNOWN', async () => {
      seed();
      ocrService.processImage.mockRejectedValueOnce(
        new Error('algo inesperado'),
      );

      await queue.processPendingJobs();

      expect(db.runMetrics[0]).toMatchObject({
        outcome: OcrRunOutcome.RETRY_SCHEDULED,
        errorCategory: OcrErrorCategory.UNKNOWN,
      });
    });
  });

  describe('retorno inválido', () => {
    it('sem itens: INVALID_RESULT, e os tokens e o custo gastos ficam registrados', async () => {
      const { bill } = seed();
      ocrService.processImage.mockImplementationOnce(
        succeedWith(okResult({ items: [] })),
      );

      await queue.processPendingJobs();

      expect(db.runMetrics[0]).toMatchObject({
        outcome: OcrRunOutcome.RETRY_SCHEDULED,
        errorCategory: OcrErrorCategory.INVALID_RESULT,
        promptTokens: 1000,
        estimatedCostUsd: expectedCost(1000, 500),
        items: null,
      });
      // R5: enquanto há retentativa, a conta não vira OCR_FAILED
      expect(bill.status).toBe(BillStatus.PENDING_OCR);
    });

    it('retorno inválido na última tentativa: FAILED_FINAL com a causa INVALID_RESULT', async () => {
      build({ OCR_QUEUE_MAX_ATTEMPTS: '1' });
      const { bill } = seed();
      ocrService.processImage.mockImplementation(
        succeedWith(okResult({ items: [] })),
      );

      await queue.processPendingJobs();

      expect(db.runMetrics).toHaveLength(1);
      expect(db.runMetrics[0]).toMatchObject({
        outcome: OcrRunOutcome.FAILED_FINAL,
        errorCategory: OcrErrorCategory.INVALID_RESULT,
      });
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
    });

    it('CARACTERIZAÇÃO: total divergente da soma dos itens é aceito (não corrigido nesta branch)', async () => {
      // Itens somam 10, o total informado é 99: a conta vai a REVIEWING e o job a
      // COMPLETED, como os leitores de contingência já faziam.
      const { bill, job } = seed();
      ocrService.processImage.mockImplementation(
        succeedWith(okResult({ totalAmount: 99 })),
      );

      await queue.processPendingJobs();

      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(db.runMetrics[0]).toMatchObject({
        outcome: OcrRunOutcome.COMPLETED,
        errorCategory: null,
      });
    });
  });

  describe('duplicidade', () => {
    it('execução que perdeu o job grava DISCARDED com os tokens e o custo gastos', async () => {
      const { job } = seed();
      const gateA = deferred<any>();
      const gateB = deferred<any>();
      ocrService.processImage
        .mockImplementationOnce(async (_url: string, context: any) => {
          const result = await gateA.promise;
          context.onOpenAiCall(
            call({ promptTokens: 2000, completionTokens: 100 }),
          );
          return result;
        })
        .mockImplementationOnce(async (_url: string, context: any) => {
          const result = await gateB.promise;
          context.onOpenAiCall(call());
          return result;
        });

      const runA = queue.processPendingJobs();
      await flush();
      job.lockedAt = new Date(Date.now() - 10 * 60 * 1000);
      const runB = queue.processPendingJobs();
      await flush();

      gateB.resolve(okResult());
      await runB;
      gateA.resolve(okResult());
      await runA;

      const byAttempt = Object.fromEntries(
        db.runMetrics.map((r) => [r.attempt, r]),
      );
      expect(db.runMetrics).toHaveLength(2);
      expect(byAttempt[2]).toMatchObject({ outcome: OcrRunOutcome.COMPLETED });
      // O custo da execução descartada foi real e fica registrado
      expect(byAttempt[1]).toMatchObject({
        outcome: OcrRunOutcome.DISCARDED,
        promptTokens: 2000,
        completionTokens: 100,
        estimatedCostUsd: expectedCost(2000, 100),
        items: null,
      });
      expect(
        jobLines()
          .map((l) => l.status)
          .sort(),
      ).toEqual(['completed', 'discarded']);
    });

    it('falha tardia de uma execução que perdeu o job também vira DISCARDED, com a categoria', async () => {
      const { job } = seed();
      const gateA = deferred<any>();
      const gateB = deferred<any>();
      ocrService.processImage
        .mockImplementationOnce(async (_url: string, context: any) => {
          await gateA.promise;
          context.onOpenAiCall(
            call({ promptTokens: null, completionTokens: null }),
          );
          throw attachOcrFailure(
            new ServiceUnavailableException(ERROR_MESSAGE),
            buildOcrFailure('TIMEOUT'),
          );
        })
        .mockImplementationOnce(async () => {
          await gateB.promise;
          return okResult();
        });

      const runA = queue.processPendingJobs();
      await flush();
      job.lockedAt = new Date(Date.now() - 10 * 60 * 1000);
      const runB = queue.processPendingJobs();
      await flush();

      gateA.resolve(undefined);
      await runA;
      gateB.resolve(undefined);
      await runB;

      expect(db.runMetrics.find((r) => r.attempt === 1)).toMatchObject({
        outcome: OcrRunOutcome.DISCARDED,
        errorCategory: OcrErrorCategory.TIMEOUT,
      });
    });

    it('repetir o enfileiramento não cria linhas: só execuções geram linhas', async () => {
      const bill = db.addBill({ imageKey: 'bills/user-1/old.jpg' });

      await queue.enqueue(bill.id, 'user-1', {
        imageKey: 'bills/user-1/old.jpg',
      });
      await queue.enqueue(bill.id, 'user-1', {
        imageKey: 'bills/user-1/old.jpg',
      });

      expect(db.runMetrics).toHaveLength(0);
    });

    it('uma linha por execução: job recriado recomeça em attempt 1 e as linhas antigas ficam', async () => {
      const { bill, job } = seed();
      ocrService.processImage.mockImplementation(succeedWith());

      await queue.processPendingJobs();
      await queue.enqueue(bill.id, 'user-1', {
        imageKey: 'bills/user-1/new.jpg',
      });
      bill.imageKey = 'bills/user-1/new.jpg';
      bill.status = BillStatus.PENDING_OCR;
      await queue.processPendingJobs();

      expect(job.attempts).toBe(1);
      expect(
        db.runMetrics.map((r) => [r.ocrJobId, r.attempt, r.outcome]),
      ).toEqual([
        [job.id, 1, OcrRunOutcome.COMPLETED],
        [job.id, 1, OcrRunOutcome.COMPLETED],
      ]);
    });
  });

  describe('esgotamento de tentativas', () => {
    it('falha final registra a CAUSA: RETRY_SCHEDULED e depois FAILED_FINAL, ambos TRANSIENT', async () => {
      build({ OCR_QUEUE_MAX_ATTEMPTS: '2' });
      const { bill } = seed();
      ocrService.processImage.mockImplementation(
        failWith(
          new ServiceUnavailableException(ERROR_MESSAGE),
          buildOcrFailure('TRANSIENT', { httpStatus: 429 }),
        ),
      );

      await queue.processPendingJobs();
      await queue.processPendingJobs();

      expect(
        db.runMetrics.map((r) => [
          r.attempt,
          r.outcome,
          r.errorCategory,
          r.httpStatus,
        ]),
      ).toEqual([
        [1, OcrRunOutcome.RETRY_SCHEDULED, OcrErrorCategory.TRANSIENT, 429],
        [2, OcrRunOutcome.FAILED_FINAL, OcrErrorCategory.TRANSIENT, 429],
      ]);
      expect(ocrService.processImage).toHaveBeenCalledTimes(2);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
    });

    it('CARACTERIZAÇÃO: a fila repete até um erro permanente (401) até esgotar as 3 tentativas', async () => {
      const { bill } = seed();
      ocrService.processImage.mockImplementation(
        failWith(
          new InternalServerErrorException(ERROR_MESSAGE),
          buildOcrFailure('CREDENTIAL', { httpStatus: 401 }),
        ),
      );

      await queue.processPendingJobs();
      await queue.processPendingJobs();
      await queue.processPendingJobs();
      await queue.processPendingJobs();

      expect(ocrService.processImage).toHaveBeenCalledTimes(3);
      expect(db.runMetrics.map((r) => r.outcome)).toEqual([
        OcrRunOutcome.RETRY_SCHEDULED,
        OcrRunOutcome.RETRY_SCHEDULED,
        OcrRunOutcome.FAILED_FINAL,
      ]);
      expect(db.runMetrics.every((r) => r.errorCategory === 'CREDENTIAL')).toBe(
        true,
      );
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
    });

    it('conta sem imagem: FAILED_FINAL IMAGE_MISSING, sem modelo, tokens nem chamada à OpenAI', async () => {
      const { bill } = seed({ imageUrl: null, imageKey: null });

      await queue.processPendingJobs();

      expect(ocrService.processImage).not.toHaveBeenCalled();
      expect(db.runMetrics).toHaveLength(1);
      expect(db.runMetrics[0]).toMatchObject({
        outcome: OcrRunOutcome.FAILED_FINAL,
        errorCategory: OcrErrorCategory.IMAGE_MISSING,
        model: null,
        promptTokens: null,
        openaiMs: null,
        estimatedCostUsd: null,
      });
      expect(jobLines()[0]).toMatchObject({
        status: 'failed',
        errorCategory: 'IMAGE_MISSING',
      });
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
    });
  });

  describe('gravação em melhor esforço', () => {
    const boom = () =>
      Object.assign(new Error('falha ao gravar ASSINATURASECRETA'), {
        name: 'PrismaClientKnownRequestError',
      });

    it('falha ao gravar a métrica NÃO falha o job nem a conta (sucesso)', async () => {
      const { bill, job } = seed();
      db.failRunMetricWith = boom();
      ocrService.processImage.mockImplementation(succeedWith());

      await expect(queue.processPendingJobs()).resolves.toBeDefined();

      expect(job.status).toBe(OcrJobStatus.COMPLETED);
      expect(bill.status).toBe(BillStatus.REVIEWING);
      expect(db.items).toHaveLength(1);
      expect(db.runMetrics).toHaveLength(0);
      expect(metrics.recordOcrCompleted).toHaveBeenCalledTimes(1);
      // O log OCR_METRIC do job continua saindo
      expect(jobLines()).toHaveLength(1);
    });

    it('falha ao gravar a métrica NÃO muda a retentativa nem a falha final', async () => {
      build({ OCR_QUEUE_MAX_ATTEMPTS: '2' });
      const { bill, job } = seed();
      db.failRunMetricWith = boom();
      ocrService.processImage.mockImplementation(
        failWith(new Error(ERROR_MESSAGE), buildOcrFailure('TRANSIENT')),
      );

      await queue.processPendingJobs();
      expect(job.status).toBe(OcrJobStatus.PENDING);
      expect(job.attempts).toBe(1);
      expect(bill.status).toBe(BillStatus.PENDING_OCR);

      await queue.processPendingJobs();
      expect(job.status).toBe(OcrJobStatus.FAILED);
      expect(bill.status).toBe(BillStatus.OCR_FAILED);
      expect(ocrService.processImage).toHaveBeenCalledTimes(2);
    });

    it('o aviso logado traz só o nome do erro, nunca a mensagem', async () => {
      seed();
      db.failRunMetricWith = boom();
      ocrService.processImage.mockImplementation(succeedWith());

      await queue.processPendingJobs();

      const warnings = warnSpy.mock.calls.map((args) => String(args[0]));
      const metricWarning = warnings.find((w) =>
        w.includes('métrica da execução'),
      );
      expect(metricWarning).toBeDefined();
      expect(metricWarning).toContain('PrismaClientKnownRequestError');
      expect(metricWarning).not.toContain('ASSINATURASECRETA');
    });
  });

  describe('privacidade', () => {
    it('nenhuma linha nem log OCR_METRIC contém URL, texto bruto, itens, estabelecimento ou mensagem de erro', async () => {
      build({ OCR_QUEUE_MAX_ATTEMPTS: '2' });
      seed();
      ocrService.processImage
        .mockImplementationOnce(
          failWith(
            new InternalServerErrorException(ERROR_MESSAGE),
            buildOcrFailure('INVALID_REQUEST', { httpStatus: 400 }),
          ),
        )
        .mockImplementationOnce(succeedWith());

      await queue.processPendingJobs();
      await queue.processPendingJobs();

      const everything = JSON.stringify([db.runMetrics, jobLines()]);
      for (const forbidden of FORBIDDEN) {
        expect(everything).not.toContain(forbidden);
      }
    });

    it('CARACTERIZAÇÃO: lastError do job continua com a mensagem original (fora do escopo desta branch)', async () => {
      // Não alterado de propósito: a suíte e2e da feat/quality-monitoring afirma o texto
      // de lastError e a feat/credits-ledger repassa a mensagem a credits.release.
      const { job } = seed();
      ocrService.processImage.mockImplementation(
        failWith(new Error(ERROR_MESSAGE), buildOcrFailure('TRANSIENT')),
      );

      await queue.processPendingJobs();

      expect(job.lastError).toBe(ERROR_MESSAGE);
    });
  });
});
