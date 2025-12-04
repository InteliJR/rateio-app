import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { FeeType } from '@prisma/client';

// Mapeamento de descrições padrão por tipo de taxa
const FEE_DEFAULT_DESCRIPTIONS: Record<FeeType, string> = {
  [FeeType.SERVICE_PERCENTAGE]: 'Taxa de serviço',
  [FeeType.SERVICE_FIXED]: 'Taxa de serviço fixa',
  [FeeType.COVER_CHARGE]: 'Couvert',
};

// Mapeamento de descrições amigáveis por tipo de taxa
const FEE_TYPE_DESCRIPTIONS: Record<FeeType, string> = {
  [FeeType.SERVICE_PERCENTAGE]: 'Percentual sobre o total',
  [FeeType.SERVICE_FIXED]: 'Valor fixo de serviço',
  [FeeType.COVER_CHARGE]: 'Couvert artístico/consumação',
};

@Injectable()
export class FeesService {
  constructor(private prisma: PrismaService) {}

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
   * Validar que a taxa pertence à conta do usuário
   */
  private async validateFeeOwnership(feeId: string, userId: string) {
    const fee = await this.prisma.fee.findUnique({
      where: { id: feeId },
      include: { bill: true },
    });

    if (!fee) {
      throw new NotFoundException('Taxa não encontrada');
    }

    if (fee.bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta taxa');
    }

    return fee;
  }

  /**
   * Validar valor da taxa baseado no tipo
   */
  private validateFeeValue(type: FeeType, value: number) {
    // Validação comum: valor não pode ser negativo
    if (value < 0) {
      throw new BadRequestException('O valor da taxa não pode ser negativo');
    }

    // Validação específica por tipo
    switch (type) {
      case FeeType.SERVICE_PERCENTAGE:
        if (value <= 0 || value > 100) {
          throw new BadRequestException(
            'Para taxa percentual, o valor deve estar entre 0.01 e 100',
          );
        }
        break;

      case FeeType.SERVICE_FIXED:
        if (value <= 0) {
          throw new BadRequestException(
            'Para taxa fixa de serviço, o valor deve ser positivo',
          );
        }
        break;

      case FeeType.COVER_CHARGE:
        if (value <= 0) {
          throw new BadRequestException(
            'Para couvert, o valor deve ser positivo',
          );
        }
        break;

      default:
        if (value <= 0) {
          throw new BadRequestException('O valor da taxa deve ser positivo');
        }
    }
  }

  /**
   * Obter descrição padrão baseada no tipo de taxa
   */
  private getDefaultDescription(type: FeeType): string {
    return FEE_DEFAULT_DESCRIPTIONS[type] || 'Taxa';
  }

  /**
   * Criar taxa
   */
  async create(userId: string, createFeeDto: CreateFeeDto) {
    // Validar que billId foi fornecido
    if (!createFeeDto.billId) {
      throw new BadRequestException('O ID da conta é obrigatório');
    }

    // Validar ownership da conta
    await this.validateBillOwnership(createFeeDto.billId, userId);

    // Validar valor da taxa
    this.validateFeeValue(createFeeDto.type, createFeeDto.value);

    // Usar descrição padrão se não fornecida
    const description =
      createFeeDto.description || this.getDefaultDescription(createFeeDto.type);

    return this.prisma.fee.create({
      data: {
        billId: createFeeDto.billId,
        type: createFeeDto.type,
        value: createFeeDto.value,
        description,
      },
      include: {
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
   * Listar taxas de uma conta
   */
  async findAllByBill(billId: string, userId: string) {
    // Validar ownership da conta
    await this.validateBillOwnership(billId, userId);

    const fees = await this.prisma.fee.findMany({
      where: { billId },
      orderBy: { createdAt: 'asc' },
    });

    // Calcular resumo das taxas
    const summary = {
      totalFixed: 0,
      totalPercentage: 0,
      fees: fees.map((fee) => ({
        ...fee,
        value: Number(fee.value),
        typeDescription: this.getTypeDescription(fee.type),
      })),
    };

    for (const fee of fees) {
      if (fee.type === FeeType.SERVICE_PERCENTAGE) {
        summary.totalPercentage += Number(fee.value);
      } else {
        summary.totalFixed += Number(fee.value);
      }
    }

    return {
      billId,
      ...summary,
    };
  }

  /**
   * Obter descrição do tipo de taxa
   */
  private getTypeDescription(type: FeeType): string {
    return FEE_TYPE_DESCRIPTIONS[type] || 'Taxa';
  }

  /**
   * Buscar taxa específica
   */
  async findOne(id: string, userId: string) {
    const fee = await this.validateFeeOwnership(id, userId);

    const feeWithBill = await this.prisma.fee.findUnique({
      where: { id },
      include: {
        bill: {
          select: {
            id: true,
            establishmentName: true,
            status: true,
            totalAmount: true,
          },
        },
      },
    });

    return {
      ...feeWithBill,
      value: Number(fee.value),
      typeDescription: this.getTypeDescription(fee.type),
    };
  }

  /**
   * Atualizar taxa
   */
  async update(id: string, userId: string, updateFeeDto: UpdateFeeDto) {
    // Validar ownership
    const existingFee = await this.validateFeeOwnership(id, userId);

    // Validar valor se estiver sendo atualizado
    if (updateFeeDto.value !== undefined) {
      const type = updateFeeDto.type || existingFee.type;
      this.validateFeeValue(type, updateFeeDto.value);
    }

    // Se mudou o tipo mas não o valor, validar o valor existente com novo tipo
    if (updateFeeDto.type && updateFeeDto.value === undefined) {
      this.validateFeeValue(updateFeeDto.type, Number(existingFee.value));
    }

    const updated = await this.prisma.fee.update({
      where: { id },
      data: {
        type: updateFeeDto.type,
        value: updateFeeDto.value,
        description: updateFeeDto.description,
      },
      include: {
        bill: {
          select: {
            id: true,
            establishmentName: true,
            status: true,
          },
        },
      },
    });

    return {
      ...updated,
      value: Number(updated.value),
      typeDescription: this.getTypeDescription(updated.type),
    };
  }

  /**
   * Deletar taxa
   */
  async remove(id: string, userId: string) {
    // Validar ownership
    await this.validateFeeOwnership(id, userId);

    await this.prisma.fee.delete({
      where: { id },
    });

    return { message: 'Taxa removida com sucesso' };
  }
}
