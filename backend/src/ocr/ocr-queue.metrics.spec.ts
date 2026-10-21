import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { OcrQueueService } from './ocr-queue.service';

/**
 * Cobre as linhas OCR_METRIC (stage "job") emitidas por runJob: formato,
 * campos e ausência de dados sensíveis, no sucesso, na falha com retentativa
 * agendada, na falha definitiva e no caso sem imagem.
 */
describe('OcrQueueService OCR_METRIC (job)', () => {
  const SIGNED_URL =
    'https://bucket.s3.amazonaws.com/bills/u1/foto.jpg?X-Amz-Signature=ASSINATURASECRETA';
  const RAW_TEXT = 'TEXTO-BRUTO-SENSIVEL {"items":[]}';
  const ITEM_NAME = 'Picanha Secreta';
  const ESTABLISHMENT = 'Bar do Sigilo';
  const ERROR_MESSAGE = 'falha-simulada-da-openai';
  const FORBIDDEN = [
    SIGNED_URL,
    'amazonaws',
    'ASSINATURASECRETA',
    'TEXTO-BRUTO',
    ITEM_NAME,
    ESTABLISHMENT,
    '123.45',
    ERROR_MESSAGE,
  ];
  const JOB_KEYS = [
    'attempt',
    'billId',
    'errorCategory',
    'items',
    'jobId',
    'queueWaitMs',
    'stage',
    'status',
    'totalMs',
  ];

  let prisma: any;
  let ocrService: any;
  let metrics: any;
  let storage: any;
  let logSpy: jest.SpyInstance;

  // Cast: não depende da assinatura do construtor (ex.: quando a fila ganhar
  // novas dependências). Os campos extras ficam undefined e não são usados.
  const buildService = (): any => {
    const Ctor = OcrQueueService as unknown as new (
      ...args: unknown[]
    ) => unknown;
    return new Ctor(prisma, ocrService, metrics, storage);
  };

  const buildJob = (overrides: Record<string, unknown> = {}) => ({
    id: 'job-1',
    billId: 'bill-1',
    attempts: 0,
    availableAt: new Date(Date.now() - 5000),
    bill: { id: 'bill-1', imageUrl: SIGNED_URL, imageKey: null },
    ...overrides,
  });

  const okResult = {
    rawText: RAW_TEXT,
    establishmentName: ESTABLISHMENT,
    totalAmount: 123.45,
    items: [
      {
        name: ITEM_NAME,
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 100,
        totalPrice: 100,
      },
      {
        name: 'Outro Item Secreto',
        quantity: 1,
        measurementUnit: 'UNIT',
        unitPrice: 23.45,
        totalPrice: 23.45,
      },
    ],
  };

  const metricLines = (): string[] =>
    logSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.startsWith('OCR_METRIC '));

  const parseMetric = (line: string) =>
    JSON.parse(line.replace(/^OCR_METRIC /, ''));

  const expectNoSensitiveData = (lines: string[]) => {
    for (const line of lines) {
      for (const forbidden of FORBIDDEN) {
        expect(line).not.toContain(forbidden);
      }
      expect(line).not.toMatch(/imageUrl|rawText|establishment|name/i);
    }
  };

  beforeEach(() => {
    delete process.env.CREDITS_ENFORCEMENT_ENABLED;
    delete process.env.OCR_QUEUE_MAX_ATTEMPTS;

    const tx = {
      billItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bill: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      ocrJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      ocrJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      bill: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (callback: (t: typeof tx) => unknown) =>
        callback(tx),
      ),
      tx,
    };
    ocrService = { processImage: jest.fn() };
    metrics = {
      recordOcrStarted: jest.fn(),
      recordOcrCompleted: jest.fn(),
      recordOcrRetry: jest.fn(),
      recordOcrFailed: jest.fn(),
    };
    storage = {
      isUsingS3: jest.fn().mockReturnValue(false),
      getSignedUrl: jest.fn(),
    };

    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emite uma linha job no sucesso com os campos esperados', async () => {
    ocrService.processImage.mockResolvedValue(okResult);

    await buildService().runJob(buildJob());

    const lines = metricLines();
    expect(lines).toHaveLength(1);

    const metric = parseMetric(lines[0]);
    expect(Object.keys(metric).sort()).toEqual(JOB_KEYS);
    expect(metric).toMatchObject({
      stage: 'job',
      jobId: 'job-1',
      billId: 'bill-1',
      attempt: 1,
      items: 2,
      status: 'completed',
    });
    expect(metric.queueWaitMs).toBeGreaterThanOrEqual(5000);
    expect(metric.queueWaitMs).toBeLessThan(15000);
    expect(metric.totalMs).toBeGreaterThanOrEqual(0);
    expect(ocrService.processImage).toHaveBeenCalledWith(
      SIGNED_URL,
      expect.objectContaining({
        jobId: 'job-1',
        onOpenAiCall: expect.any(Function),
      }),
    );
    expectNoSensitiveData(lines);
  });

  it('emite uma linha job na falha com retentativa agendada', async () => {
    ocrService.processImage.mockRejectedValue(new Error(ERROR_MESSAGE));

    await buildService().runJob(buildJob({ attempts: 0 }));

    const lines = metricLines();
    expect(lines).toHaveLength(1);

    const metric = parseMetric(lines[0]);
    expect(Object.keys(metric).sort()).toEqual(JOB_KEYS);
    expect(metric).toMatchObject({
      stage: 'job',
      jobId: 'job-1',
      billId: 'bill-1',
      attempt: 1,
      items: 0,
      status: 'failed',
    });

    // Retentativa agendada: job volta a PENDING e a conta não é marcada como falha
    expect(metrics.recordOcrRetry).toHaveBeenCalledTimes(1);
    expect(metrics.recordOcrFailed).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.ocrJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1', attempts: 1 }),
        data: expect.objectContaining({ status: OcrJobStatus.PENDING }),
      }),
    );
    // R5: a conta não vira OCR_FAILED enquanto há retentativa agendada
    expect(prisma.tx.bill.updateMany).not.toHaveBeenCalled();
    expectNoSensitiveData(lines);
  });

  it('emite uma linha job na falha definitiva (última tentativa)', async () => {
    ocrService.processImage.mockRejectedValue(new Error(ERROR_MESSAGE));

    await buildService().runJob(buildJob({ attempts: 2 }));

    const lines = metricLines();
    expect(lines).toHaveLength(1);
    expect(parseMetric(lines[0])).toMatchObject({
      attempt: 3,
      items: 0,
      status: 'failed',
    });

    expect(metrics.recordOcrFailed).toHaveBeenCalledTimes(1);
    expect(metrics.recordOcrRetry).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.tx.ocrJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1', attempts: 3 }),
        data: expect.objectContaining({ status: OcrJobStatus.FAILED }),
      }),
    );
    // Falha final: só aqui a conta vira OCR_FAILED
    expect(prisma.tx.bill.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: BillStatus.OCR_FAILED },
      }),
    );
    expectNoSensitiveData(lines);
  });

  it('emite uma linha job quando a conta não tem imagem, sem chamar a OpenAI', async () => {
    await buildService().runJob(
      buildJob({ bill: { id: 'bill-1', imageUrl: null, imageKey: null } }),
    );

    expect(ocrService.processImage).not.toHaveBeenCalled();

    const lines = metricLines();
    expect(lines).toHaveLength(1);

    const metric = parseMetric(lines[0]);
    expect(Object.keys(metric).sort()).toEqual(JOB_KEYS);
    expect(metric).toMatchObject({
      stage: 'job',
      jobId: 'job-1',
      billId: 'bill-1',
      attempt: 1,
      items: 0,
      status: 'failed',
    });
    // Sem imagem não há retentativa: falha definitiva imediata
    expect(metrics.recordOcrRetry).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expectNoSensitiveData(lines);
  });
});
