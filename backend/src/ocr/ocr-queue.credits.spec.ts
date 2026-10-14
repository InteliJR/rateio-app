import { OcrQueueService } from './ocr-queue.service';

/**
 * Cobre apenas a ligação da fila com o ledger de créditos. O resto do
 * comportamento da fila continua coberto pelos testes do serviço de OCR.
 */
describe('OcrQueueService e créditos', () => {
  const billId = 'bill-1';
  const userId = 'user-1';
  const jobId = 'job-1';

  let prisma: any;
  let credits: any;
  let metrics: any;

  const buildService = (enforced: boolean) => {
    process.env.CREDITS_ENFORCEMENT_ENABLED = enforced ? 'true' : 'false';

    return new OcrQueueService(
      prisma,
      {} as never,
      metrics,
      {} as never,
      credits,
    );
  };

  beforeEach(() => {
    prisma = {
      ocrJob: {
        upsert: jest.fn().mockResolvedValue({ id: jobId, billId, userId }),
      },
    };
    credits = {
      reserve: jest.fn().mockResolvedValue({ reserved: true }),
      consume: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    metrics = { recordOcrQueued: jest.fn() };
  });

  afterEach(() => {
    delete process.env.CREDITS_ENFORCEMENT_ENABLED;
  });

  it('reserva um crédito ao enfileirar quando a cobrança está ligada', async () => {
    const service = buildService(true);

    await service.enqueue(billId, userId);

    expect(credits.reserve).toHaveBeenCalledWith(userId, jobId);
    expect(metrics.recordOcrQueued).toHaveBeenCalled();
  });

  it('não toca no ledger enquanto a cobrança está desligada', async () => {
    const service = buildService(false);

    await service.enqueue(billId, userId);

    expect(credits.reserve).not.toHaveBeenCalled();
    expect(prisma.ocrJob.upsert).toHaveBeenCalled();
  });

  it('propaga a falta de saldo em vez de enfileirar silenciosamente', async () => {
    const service = buildService(true);
    credits.reserve.mockRejectedValue(new Error('Créditos insuficientes'));

    await expect(service.enqueue(billId, userId)).rejects.toThrow(
      'Créditos insuficientes',
    );
  });
});
