import { CreditPolicy, CreditReservationStatus } from '@prisma/client';
import { CreditsService, InsufficientCreditsError } from './credits.service';

/**
 * Cobre só a mudança desta branch em `reserve`: `client` opcional e a trava
 * FOR NO KEY UPDATE. O resto do serviço segue coberto por credits.service.spec.ts.
 *
 * NÃO PROVA o comportamento do lock no Postgres (NÃO VALIDADO em Postgres real).
 */
describe('CreditsService.reserve com transação do chamador', () => {
  const userId = 'user-1';
  const ocrJobId = 'job-1';

  const makeTx = (available = 3) => ({
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ creditPolicy: CreditPolicy.METERED }]),
    creditTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: available } }),
      create: jest.fn().mockResolvedValue({}),
    },
    creditReservation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  });

  const makeService = (ownTx = makeTx()) => {
    const prisma: any = {
      $transaction: jest.fn((cb: (t: any) => unknown) => cb(ownTx)),
      creditTransaction: { create: jest.fn().mockResolvedValue({}) },
    };
    return { service: new CreditsService(prisma), prisma, ownTx };
  };

  const sqlOf = (tx: ReturnType<typeof makeTx>) =>
    (tx.$queryRaw.mock.calls[0][0] as string[]).join(' ');

  it('sem `client`: abre a própria transação (comportamento de sempre)', async () => {
    const { service, prisma, ownTx } = makeService();

    const result = await service.reserve(userId, ocrJobId);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ownTx.creditReservation.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ reserved: true, policy: CreditPolicy.METERED });
  });

  it('com `client`: usa a transação do chamador e não abre outra', async () => {
    const { service, prisma, ownTx } = makeService();
    const callerTx = makeTx();

    const result = await service.reserve(userId, ocrJobId, callerTx as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ownTx.creditReservation.create).not.toHaveBeenCalled();
    expect(callerTx.creditReservation.create).toHaveBeenCalledTimes(1);
    expect(callerTx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        amount: -1,
        idempotencyKey: `reserve:${ocrJobId}`,
        ocrJobId,
      }),
    });
    expect(result.reserved).toBe(true);
  });

  it('com `client`: sem saldo lança InsufficientCreditsError para o chamador desfazer tudo', async () => {
    const { service } = makeService();
    const callerTx = makeTx(0);

    await expect(
      service.reserve(userId, ocrJobId, callerTx as never),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(callerTx.creditReservation.create).not.toHaveBeenCalled();
  });

  it('a trava da linha do usuário é FOR NO KEY UPDATE (com e sem `client`)', async () => {
    const { service, ownTx } = makeService();
    const callerTx = makeTx();

    await service.reserve(userId, ocrJobId);
    await service.reserve(userId, ocrJobId, callerTx as never);

    for (const tx of [ownTx, callerTx]) {
      expect(sqlOf(tx)).toContain('FOR NO KEY UPDATE');
      expect(sqlOf(tx)).not.toMatch(/FOR UPDATE/);
    }
  });

  it('reserva já existente continua sem cobrar de novo', async () => {
    const callerTx = makeTx();
    callerTx.creditReservation.findUnique.mockResolvedValue({
      status: CreditReservationStatus.HELD,
    });
    const { service } = makeService();

    const result = await service.reserve(userId, ocrJobId, callerTx as never);

    expect(result.reserved).toBe(true);
    expect(callerTx.creditTransaction.create).not.toHaveBeenCalled();
  });
});
