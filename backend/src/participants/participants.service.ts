import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';

@Injectable()
export class ParticipantsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validar que o nome do participante não está vazio
   */
  private validateParticipantName(name: string) {
    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length === 0) {
      throw new BadRequestException(
        'O nome do participante não pode ser vazio',
      );
    }
    return trimmedName;
  }

  /**
   * Validar que a conta pertence ao usuário
   */
  private async validateBillOwnership(billId: string, userId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    if (bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta conta');
    }

    return bill;
  }

  /**
   * Validar que o participante pertence à conta do usuário
   */
  private async validateParticipantOwnership(
    participantId: string,
    userId: string,
  ) {
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
      include: { bill: true },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado');
    }

    if (participant.bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a este participante');
    }

    return participant;
  }

  /**
   * Criar participante
   */
  async create(userId: string, createParticipantDto: CreateParticipantDto) {
    // Validar que a conta pertence ao usuário
    await this.validateBillOwnership(createParticipantDto.billId, userId);

    // Validar e sanitizar nome
    const name = this.validateParticipantName(createParticipantDto.name);

    return this.prisma.participant.create({
      data: {
        billId: createParticipantDto.billId,
        name,
      },
    });
  }

  /**
   * Listar participantes de uma conta
   */
  async findAllByBill(billId: string, userId: string) {
    // Validar que a conta pertence ao usuário
    await this.validateBillOwnership(billId, userId);

    return this.prisma.participant.findMany({
      where: { billId },
      include: {
        divisions: {
          include: {
            billItem: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Buscar participante específico
   */
  async findOne(id: string, userId: string) {
    await this.validateParticipantOwnership(id, userId);

    return this.prisma.participant.findUnique({
      where: { id },
      include: {
        divisions: {
          include: {
            billItem: true,
          },
        },
        bill: {
          select: {
            id: true,
            establishmentName: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Atualizar participante
   */
  async update(
    id: string,
    userId: string,
    updateParticipantDto: UpdateParticipantDto,
  ) {
    // Validar que o participante pertence à conta do usuário
    await this.validateParticipantOwnership(id, userId);

    // Validar e sanitizar nome se fornecido
    const data: { name?: string } = {};
    if (updateParticipantDto.name !== undefined) {
      data.name = this.validateParticipantName(updateParticipantDto.name);
    }

    return this.prisma.participant.update({
      where: { id },
      data,
    });
  }

  /**
   * Deletar participante
   */
  async remove(id: string, userId: string) {
    // Validar que o participante pertence à conta do usuário
    await this.validateParticipantOwnership(id, userId);

    await this.prisma.participant.delete({
      where: { id },
    });

    return { message: 'Participante removido com sucesso' };
  }
}
