import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditPolicy,
  CreditReservationStatus,
  CreditTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService, InsufficientCreditsError } from './credits.service';

type TxMock = {
  $queryRaw: jest.Mock;
  creditTransaction: {
    aggregate: jest.Mock;
    create: jest.Mock;
  };
  creditReservation: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('CreditsService', () => {
  let service: CreditsService;
  let prisma: any;
  let tx: TxMock;

  const userId = 'user-1';
  const ocrJobId = 'job-1';

  beforeEach(async () => {
    tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ creditPolicy: CreditPolicy.METERED }]),
      creditTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 3 } }),
        create: jest.fn().mockResolvedValue({}),
      },
      creditReservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ocrJobId,
          userId,
          status: CreditReservationStatus.HELD,
        }),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prisma = {
      $transaction: jest.fn((callback: (t: TxMock) => unknown) => callback(tx)),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          creditPolicy: CreditPolicy.METERED,
        }),
      },
      creditTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 3 } }),
        create: jest.fn().mockResolvedValue({}),
      },
      creditReservation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CreditsService>(CreditsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalance', () => {
    it('soma o ledger e separa o que está reservado', async () => {
      prisma.creditTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 2 },
      });
      prisma.creditReservation.count.mockResolvedValue(1);

      const balance = await service.getBalance(userId);

      expect(balance.available).toBe(2);
      expect(balance.held).toBe(1);
      expect(balance.balance).toBe(3);
      expect(balance.policy).toBe(CreditPolicy.METERED);
    });

    it('trata ledger vazio como saldo zero, e não como erro', async () => {
      prisma.creditTransaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const balance = await service.getBalance(userId);

      expect(balance.available).toBe(0);
      expect(balance.balance).toBe(0);
    });
  });

  describe('grant', () => {
    it('não soma duas vezes com a mesma referência', async () => {
      prisma.creditTransaction.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicada', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );

      await expect(
        service.grant({ userId, credits: 10, reference: 'compra-1' }),
      ).resolves.toBeUndefined();
    });

    it('propaga erros que não sejam de duplicidade', async () => {
      prisma.creditTransaction.create.mockRejectedValueOnce(
        new Error('conexão perdida'),
      );

      await expect(
        service.grant({ userId, credits: 10, reference: 'compra-2' }),
      ).rejects.toThrow('conexão perdida');
    });

    it('ignora concessão de valor zero ou negativo', async () => {
      await service.grant({ userId, credits: 0, reference: 'vazia' });

      expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('reserve', () => {
    it('debita um crédito e cria a reserva', async () => {
      const result = await service.reserve(userId, ocrJobId);

      expect(result.reserved).toBe(true);
      expect(tx.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: CreditTransactionType.RESERVE,
            amount: -1,
            idempotencyKey: `reserve:${ocrJobId}`,
          }),
        }),
      );
      expect(tx.creditReservation.create).toHaveBeenCalled();
    });

    it('recusa quando não há saldo disponível', async () => {
      tx.creditTransaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

      await expect(service.reserve(userId, ocrJobId)).rejects.toBeInstanceOf(
        InsufficientCreditsError,
      );
      expect(tx.creditReservation.create).not.toHaveBeenCalled();
    });

    it('trava a linha do usuário antes de conferir o saldo', async () => {
      await service.reserve(userId, ocrJobId);

      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it('não debita conta isenta', async () => {
      tx.$queryRaw.mockResolvedValue([
        { creditPolicy: CreditPolicy.UNLIMITED },
      ]);

      const result = await service.reserve(userId, ocrJobId);

      expect(result.reserved).toBe(false);
      expect(result.policy).toBe(CreditPolicy.UNLIMITED);
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('reaproveita a reserva do mesmo trabalho em vez de cobrar de novo', async () => {
      tx.creditReservation.findUnique.mockResolvedValue({
        ocrJobId,
        userId,
        status: CreditReservationStatus.HELD,
      });

      const result = await service.reserve(userId, ocrJobId);

      expect(result.reserved).toBe(true);
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
      expect(tx.creditReservation.create).not.toHaveBeenCalled();
    });
  });

  describe('consume e release', () => {
    it('consume fecha a reserva sem mexer no saldo', async () => {
      await service.consume(ocrJobId);

      expect(tx.creditReservation.updateMany).toHaveBeenCalledWith({
        where: { ocrJobId, status: CreditReservationStatus.HELD },
        data: { status: CreditReservationStatus.CONSUMED },
      });
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('fecha a reserva em uma operação condicional, não lendo antes de atualizar', async () => {
      // Se a leitura viesse primeiro, um consume e um release simultâneos
      // passariam os dois pela checagem e o crédito voltaria numa leitura
      // que foi entregue.
      await service.release(ocrJobId);

      expect(tx.creditReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ocrJobId, status: CreditReservationStatus.HELD },
        }),
      );
      expect(tx.creditReservation.findUnique).not.toHaveBeenCalled();
    });

    it('release devolve o crédito ao usuário', async () => {
      await service.release(ocrJobId, 'OCR falhou');

      expect(tx.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: CreditTransactionType.RELEASE,
            amount: 1,
            reason: 'OCR falhou',
          }),
        }),
      );
    });

    it('fechar a mesma reserva duas vezes não devolve crédito duas vezes', async () => {
      // A reserva já saiu de HELD, então o UPDATE condicional não pega nada.
      tx.creditReservation.updateMany.mockResolvedValue({ count: 0 });

      await service.release(ocrJobId);

      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('não falha quando não existe reserva, como numa conta isenta', async () => {
      tx.creditReservation.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.consume(ocrJobId)).resolves.toBeUndefined();
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('releaseExpired', () => {
    it('devolve as reservas vencidas', async () => {
      prisma.creditReservation.findMany.mockResolvedValue([
        { ocrJobId: 'job-a' },
        { ocrJobId: 'job-b' },
      ]);
      tx.creditReservation.findUnique.mockResolvedValue({
        ocrJobId: 'job-a',
        userId,
        status: CreditReservationStatus.HELD,
      });

      const released = await service.releaseExpired();

      expect(released).toBe(2);
    });
  });
});
