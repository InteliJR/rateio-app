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
      renewReservation: jest.fn().mockResolvedValue(true),
      reservationTtl: 15 * 60 * 1000,
      consume: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      releaseExpired: jest.fn().mockResolvedValue(0),
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

  describe('renovação da reserva ao reivindicar o trabalho', () => {
    const jobPendente = {
      id: jobId,
      billId,
      userId,
      attempts: 0,
      bill: { id: billId, imageUrl: null, imageKey: null },
    };

    const prismaComFila = () => ({
      ocrJob: {
        upsert: jest.fn().mockResolvedValue({ id: jobId, billId, userId }),
        findFirst: jest.fn().mockResolvedValue(jobPendente),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    it('adia o vencimento quando a cobrança está ligada', async () => {
      prisma = prismaComFila();
      const service: any = buildService(true);

      await service.claimNextJob();

      expect(credits.renewReservation).toHaveBeenCalledWith(jobId);
    });

    it('não toca na reserva quando a cobrança está desligada', async () => {
      prisma = prismaComFila();
      const service: any = buildService(false);

      await service.claimNextJob();

      expect(credits.renewReservation).not.toHaveBeenCalled();
    });

    it('não renova quando a reivindicação perde a corrida', async () => {
      prisma = prismaComFila();
      prisma.ocrJob.updateMany.mockResolvedValue({ count: 0 });
      const service: any = buildService(true);

      const reivindicado = await service.claimNextJob();

      expect(reivindicado).toBeNull();
      expect(credits.renewReservation).not.toHaveBeenCalled();
    });
  });

  describe('devolução de reservas expiradas no ciclo da fila', () => {
    const prismaSemTrabalho = () => ({
      ocrJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 'job-ativo' }]),
      },
    });

    it('devolve as vencidas a cada ciclo, pulando trabalhos na fila ou rodando', async () => {
      prisma = prismaSemTrabalho();
      const service = buildService(true);

      await service.processPendingJobs();

      expect(credits.releaseExpired).toHaveBeenCalledTimes(1);
      const stillActive = credits.releaseExpired.mock.calls[0][0];
      const ativos = await stillActive(['job-ativo', 'job-perdido']);

      expect(ativos).toEqual(new Set(['job-ativo']));
      expect(prisma.ocrJob.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['job-ativo', 'job-perdido'] },
          status: { in: ['PENDING', 'RUNNING'] },
        },
        select: { id: true },
      });
    });

    it('não toca no ledger enquanto a cobrança está desligada', async () => {
      prisma = prismaSemTrabalho();
      const service = buildService(false);

      await service.processPendingJobs();

      expect(credits.releaseExpired).not.toHaveBeenCalled();
    });

    it('uma falha ao devolver não impede a fila de rodar', async () => {
      prisma = prismaSemTrabalho();
      credits.releaseExpired.mockRejectedValue(new Error('banco fora'));
      const service = buildService(true);

      await expect(service.processPendingJobs()).resolves.toEqual({
        processed: 0,
        activeWorkers: 0,
      });
      expect(prisma.ocrJob.findFirst).toHaveBeenCalled();
    });
  });
});
