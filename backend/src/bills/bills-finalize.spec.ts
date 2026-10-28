import { BadRequestException } from '@nestjs/common';
import { BillsService } from './bills.service';
import { BillStatus } from '@prisma/client';

describe('BillsService - validateFinalize', () => {
  let service: BillsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      bill: {
        findUnique: jest.fn(),
      },
      billItem: {
        findMany: jest.fn(),
      },
      participant: {
        findMany: jest.fn(),
      },
      division: {
        upsert: jest.fn(),
      },
      fee: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };

    service = new BillsService(
      prismaMock,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('deve rejeitar finalização com billItemId pertencente a outra conta (BUG-012 / Task 7.3)', async () => {
    prismaMock.bill.findUnique.mockResolvedValue({
      id: 'bill-1',
      userId: 'user-1',
      status: BillStatus.DIVIDING,
    });

    prismaMock.billItem.findMany.mockResolvedValue([
      { id: 'item-1', name: 'Item 1', totalPrice: 50, billId: 'bill-1' },
    ]);

    prismaMock.participant.findMany.mockResolvedValue([
      { id: 'part-1', name: 'User 1', billId: 'bill-1' },
    ]);

    const maliciousDto: any = {
      divisions: [
        { billItemId: 'item-1', participantId: 'part-1', shareAmount: 50 },
        { billItemId: 'item-from-other-bill', participantId: 'part-1', shareAmount: 10 },
      ],
      fees: [],
    };

    await expect(
      service.validateFinalize('bill-1', 'user-1', maliciousDto),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateFinalize('bill-1', 'user-1', maliciousDto),
    ).rejects.toThrow('Divisão referencia item inválido ou de outra conta');
  });

  it('deve rejeitar finalização com participantId pertencente a outra conta', async () => {
    prismaMock.bill.findUnique.mockResolvedValue({
      id: 'bill-1',
      userId: 'user-1',
      status: BillStatus.DIVIDING,
    });

    prismaMock.billItem.findMany.mockResolvedValue([
      { id: 'item-1', name: 'Item 1', totalPrice: 50, billId: 'bill-1' },
    ]);

    prismaMock.participant.findMany.mockResolvedValue([
      { id: 'part-1', name: 'User 1', billId: 'bill-1' },
    ]);

    const maliciousDto: any = {
      divisions: [
        { billItemId: 'item-1', participantId: 'participant-from-other-bill', shareAmount: 50 },
      ],
      fees: [],
    };

    await expect(
      service.validateFinalize('bill-1', 'user-1', maliciousDto),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateFinalize('bill-1', 'user-1', maliciousDto),
    ).rejects.toThrow('Divisão referencia participante inválido ou de outra conta');
  });

  it('deve aceitar divisões válidas quando pertencem à própria conta', async () => {
    prismaMock.bill.findUnique.mockResolvedValue({
      id: 'bill-1',
      userId: 'user-1',
      status: BillStatus.DIVIDING,
    });

    prismaMock.billItem.findMany.mockResolvedValue([
      { id: 'item-1', name: 'Item 1', totalPrice: 50, billId: 'bill-1' },
    ]);

    prismaMock.participant.findMany.mockResolvedValue([
      { id: 'part-1', name: 'User 1', billId: 'bill-1' },
    ]);

    const validDto: any = {
      divisions: [
        { billItemId: 'item-1', participantId: 'part-1', shareAmount: 50 },
      ],
      fees: [],
    };

    await expect(
      service.validateFinalize('bill-1', 'user-1', validDto),
    ).resolves.not.toThrow();
  });
});

