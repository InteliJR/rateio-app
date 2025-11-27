import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDivisionDto,
  CreateBatchDivisionDto,
} from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';

@Injectable()
export class DivisionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validar que o item pertence a uma conta do usuário
   */
  private async validateBillItemOwnership(billItemId: string, userId: string) {
    const billItem = await this.prisma.billItem.findUnique({
      where: { id: billItemId },
      include: { bill: true },
    });

    if (!billItem) {
      throw new NotFoundException('Item não encontrado');
    }

    if (billItem.bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a este item');
    }

    return billItem;
  }

  /**
   * Validar que a divisão pertence a uma conta do usuário
   */
  private async validateDivisionOwnership(divisionId: string, userId: string) {
    const division = await this.prisma.division.findUnique({
      where: { id: divisionId },
      include: {
        billItem: {
          include: { bill: true },
        },
      },
    });

    if (!division) {
      throw new NotFoundException('Divisão não encontrada');
    }

    if (division.billItem.bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta divisão');
    }

    return division;
  }

  /**
   * Validar que a soma das divisões não excede o valor do item
   */
  private async validateDivisionSum(
    billItemId: string,
    newShareAmount: number,
    excludeDivisionId?: string,
  ) {
    const billItem = await this.prisma.billItem.findUnique({
      where: { id: billItemId },
      include: { divisions: true },
    });

    if (!billItem) {
      throw new NotFoundException('Item não encontrado');
    }

    // Soma das divisões existentes (excluindo a divisão sendo atualizada, se houver)
    const existingSum = billItem.divisions
      .filter((div) => div.id !== excludeDivisionId)
      .reduce((acc, div) => acc + Number(div.shareAmount), 0);

    const totalSum = existingSum + newShareAmount;
    const itemTotal = Number(billItem.totalPrice);

    if (totalSum > itemTotal + 0.01) {
      // Tolerância para ponto flutuante
      throw new BadRequestException(
        `Soma das divisões (${totalSum.toFixed(2)}) excede o valor do item (${itemTotal.toFixed(2)})`,
      );
    }

    return { billItem, existingSum, totalSum, itemTotal };
  }

  /**
   * Validar que o participante pertence à mesma conta do item
   */
  private async validateParticipantBelongsToBill(
    participantId: string,
    billId: string,
  ) {
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
    });

    if (!participant) {
      throw new NotFoundException(
        `Participante ${participantId} não encontrado`,
      );
    }

    if (participant.billId !== billId) {
      throw new BadRequestException(
        `Participante "${participant.name}" não pertence a esta conta`,
      );
    }

    return participant;
  }

  /**
   * Criar divisão única
   */
  async create(userId: string, createDivisionDto: CreateDivisionDto) {
    // Validar ownership do item
    const billItem = await this.validateBillItemOwnership(
      createDivisionDto.billItemId,
      userId,
    );

    // Validar que o participante pertence à mesma conta
    await this.validateParticipantBelongsToBill(
      createDivisionDto.participantId,
      billItem.billId,
    );

    // Validar soma das divisões
    await this.validateDivisionSum(
      createDivisionDto.billItemId,
      createDivisionDto.shareAmount,
    );

    // Verificar se já existe divisão para este participante neste item
    const existingDivision = await this.prisma.division.findUnique({
      where: {
        billItemId_participantId: {
          billItemId: createDivisionDto.billItemId,
          participantId: createDivisionDto.participantId,
        },
      },
    });

    if (existingDivision) {
      throw new BadRequestException(
        'Já existe uma divisão para este participante neste item. Use o endpoint de atualização.',
      );
    }

    return this.prisma.division.create({
      data: {
        billItemId: createDivisionDto.billItemId,
        participantId: createDivisionDto.participantId,
        shareAmount: createDivisionDto.shareAmount,
      },
      include: {
        participant: true,
        billItem: true,
      },
    });
  }

  /**
   * Criar múltiplas divisões de um item
   */
  async createBatch(userId: string, createBatchDto: CreateBatchDivisionDto) {
    // Validar ownership do item
    const billItem = await this.validateBillItemOwnership(
      createBatchDto.billItemId,
      userId,
    );

    // Validar que todos os participantes pertencem à mesma conta
    for (const division of createBatchDto.divisions) {
      await this.validateParticipantBelongsToBill(
        division.participantId,
        billItem.billId,
      );
    }

    // Calcular soma total das novas divisões
    const totalNewDivisions = createBatchDto.divisions.reduce(
      (acc, div) => acc + div.shareAmount,
      0,
    );

    // Buscar divisões existentes
    const existingDivisions = await this.prisma.division.findMany({
      where: { billItemId: createBatchDto.billItemId },
    });

    const existingSum = existingDivisions.reduce(
      (acc, div) => acc + Number(div.shareAmount),
      0,
    );

    const totalSum = existingSum + totalNewDivisions;
    const itemTotal = Number(billItem.totalPrice);

    if (totalSum > itemTotal + 0.01) {
      throw new BadRequestException(
        `Soma das divisões (${totalSum.toFixed(2)}) excede o valor do item (${itemTotal.toFixed(2)})`,
      );
    }

    // Criar divisões em batch
    const createdDivisions: Awaited<
      ReturnType<typeof this.prisma.division.create>
    >[] = [];

    for (const division of createBatchDto.divisions) {
      // Verificar se já existe
      const existing = await this.prisma.division.findUnique({
        where: {
          billItemId_participantId: {
            billItemId: createBatchDto.billItemId,
            participantId: division.participantId,
          },
        },
      });

      if (existing) {
        // Atualizar divisão existente
        const updated = await this.prisma.division.update({
          where: { id: existing.id },
          data: { shareAmount: division.shareAmount },
          include: { participant: true },
        });
        createdDivisions.push(updated);
      } else {
        // Criar nova divisão
        const created = await this.prisma.division.create({
          data: {
            billItemId: createBatchDto.billItemId,
            participantId: division.participantId,
            shareAmount: division.shareAmount,
          },
          include: { participant: true },
        });
        createdDivisions.push(created);
      }
    }

    return {
      billItem: {
        id: billItem.id,
        name: billItem.name,
        totalPrice: Number(billItem.totalPrice),
      },
      divisions: createdDivisions,
      summary: {
        itemTotal,
        totalDivided: totalSum,
        remaining: Math.round((itemTotal - totalSum) * 100) / 100,
      },
    };
  }

  /**
   * Listar todas as divisões de uma conta
   */
  async findAllByBill(billId: string, userId: string) {
    // Validar ownership da conta
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    if (bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta conta');
    }

    // Buscar todas as divisões dos itens desta conta
    const divisions = await this.prisma.division.findMany({
      where: {
        billItem: {
          billId,
        },
      },
      include: {
        participant: true,
        billItem: true,
      },
      orderBy: [{ billItem: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    });

    // Agrupar por item
    const divisionsByItem: Record<
      string,
      {
        billItem: { id: string; name: string; totalPrice: number };
        divisions: typeof divisions;
        totalDivided: number;
      }
    > = {};

    for (const division of divisions) {
      const itemId = division.billItemId;

      if (!divisionsByItem[itemId]) {
        divisionsByItem[itemId] = {
          billItem: {
            id: division.billItem.id,
            name: division.billItem.name,
            totalPrice: Number(division.billItem.totalPrice),
          },
          divisions: [],
          totalDivided: 0,
        };
      }

      divisionsByItem[itemId].divisions.push(division);
      divisionsByItem[itemId].totalDivided += Number(division.shareAmount);
    }

    return {
      billId,
      items: Object.values(divisionsByItem),
      totalDivisions: divisions.length,
    };
  }

  /**
   * Buscar divisão específica
   */
  async findOne(id: string, userId: string) {
    await this.validateDivisionOwnership(id, userId);

    return this.prisma.division.findUnique({
      where: { id },
      include: {
        participant: true,
        billItem: {
          include: {
            bill: {
              select: {
                id: true,
                establishmentName: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Atualizar valor da divisão
   */
  async update(
    id: string,
    userId: string,
    updateDivisionDto: UpdateDivisionDto,
  ) {
    // Validar ownership
    const division = await this.validateDivisionOwnership(id, userId);

    // Validar soma das divisões (excluindo a atual)
    await this.validateDivisionSum(
      division.billItemId,
      updateDivisionDto.shareAmount,
      id,
    );

    return this.prisma.division.update({
      where: { id },
      data: {
        shareAmount: updateDivisionDto.shareAmount,
      },
      include: {
        participant: true,
        billItem: true,
      },
    });
  }

  /**
   * Remover divisão
   */
  async remove(id: string, userId: string) {
    // Validar ownership
    await this.validateDivisionOwnership(id, userId);

    await this.prisma.division.delete({
      where: { id },
    });

    return { message: 'Divisão removida com sucesso' };
  }
}
