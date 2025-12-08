import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrService } from '../ocr/ocr.service';
import { OcrResultDto } from '../ocr/dto/ocr-result.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { BillStatus, Prisma } from '@prisma/client';

// Campos permitidos para ordenação
export type BillSortField = 'createdAt' | 'totalAmount';
export type SortOrder = 'asc' | 'desc';

// Interface para filtros de busca
export interface BillFilters {
  status?: BillStatus;
  startDate?: Date;
  endDate?: Date;
  sortBy?: BillSortField;
  sortOrder?: SortOrder;
}

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private ocr: OcrService,
  ) { }

  /**
   * Criar conta com upload de imagem e OCR
   */
  async create(
    file: Express.Multer.File | undefined,
    userId: string,
    createBillDto: CreateBillDto,
  ) {
    // Se tiver arquivo, fluxo normal de OCR
    if (file) {
      // 1. Validar arquivo
      if (!this.storage.validateFileType(file.mimetype)) {
        throw new BadRequestException(
          'Apenas imagens são permitidas (JPEG, PNG, WebP)',
        );
      }

      if (!this.storage.validateFileSize(file.size)) {
        throw new BadRequestException('Tamanho máximo: 10MB');
      }

      // 2. Upload da imagem para S3
      const { key, url } = await this.storage.uploadFile(file, 'bills');

      // 3. Criar registro da conta (status: PENDING_OCR)
      const bill = await this.prisma.bill.create({
        data: {
          userId,
          imageUrl: url,
          imageKey: key,
          status: BillStatus.PENDING_OCR,
          establishmentName: createBillDto.establishmentName,
        },
      });

      // 4. Processar OCR (assíncrono - não bloquear resposta)
      this.processOcr(bill.id, url).catch((error) => {
        console.error(`❌ Erro no OCR da conta ${bill.id}:`, error);
      });

      return {
        ...bill,
        message: 'Conta criada. Processando imagem...',
      };
    }

    // Fluxo manual (sem imagem)
    const establishmentName = createBillDto.billName || createBillDto.establishmentName;

    const bill = await this.prisma.bill.create({
      data: {
        userId,
        status: BillStatus.DIVIDING, // Vai direto para divisão
        establishmentName,
        // imageUrl e imageKey ficam null
      },
    });

    // Adicionar taxa de serviço se houver
    if (createBillDto.serviceFeePercentage !== undefined) {
      await this.prisma.fee.create({
        data: {
          billId: bill.id,
          type: 'SERVICE_PERCENTAGE',
          value: createBillDto.serviceFeePercentage,
        },
      });
    }

    // Adicionar participantes iniciais
    if (createBillDto.participantCount && createBillDto.participantCount > 0) {
      const participants = Array.from({ length: createBillDto.participantCount }, (_, i) => ({
        billId: bill.id,
        name: `Pessoa ${i + 1}`,
      }));
      await this.prisma.participant.createMany({ data: participants });
    }

    return bill;
  }

  /**
   * Processar OCR da imagem (chamado assincronamente)
   */
  private async processOcr(billId: string, imageUrl: string) {
    try {
      // 1. Fazer OCR
      const ocrResult = await this.ocr.processImage(imageUrl);

      // 2. Validar resultado
      if (!OcrResultDto.validateOcrResult(ocrResult)) {
        await this.prisma.bill.update({
          where: { id: billId },
          data: {
            status: BillStatus.OCR_FAILED,
            ocrRawText: ocrResult.rawText,
          },
        });
        return;
      }

      // 3. Criar itens reconhecidos
      const items = ocrResult.items.map((item) => ({
        billId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }));

      await this.prisma.billItem.createMany({ data: items });

      // 4. Atualizar conta
      await this.prisma.bill.update({
        where: { id: billId },
        data: {
          status: BillStatus.REVIEWING,
          ocrRawText: ocrResult.rawText,
          totalAmount: ocrResult.totalAmount,
          establishmentName: ocrResult.establishmentName,
        },
      });

      console.log(`✅ OCR processado com sucesso para conta ${billId}`);
    } catch (error) {
      console.error(`❌ Erro no OCR da conta ${billId}:`, error);

      await this.prisma.bill.update({
        where: { id: billId },
        data: { status: BillStatus.OCR_FAILED },
      });
    }
  }

  /**
   * Buscar todas as contas do usuário com paginação e filtros
   */
  async findAllByUser(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: BillFilters,
  ) {
    // Garantir valores mínimos
    const validPage = Math.max(1, page);
    const validLimit = Math.max(1, Math.min(100, limit)); // Limitar máximo de 100
    const skip = (validPage - 1) * validLimit;

    // Construir condições de filtro
    const where: Prisma.BillWhereInput = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    // Construir ordenação
    const sortField = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'desc';
    const orderBy: Prisma.BillOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    // Buscar total de registros
    const total = await this.prisma.bill.count({ where });

    // Buscar dados paginados com campos seletivos
    const data = await this.prisma.bill.findMany({
      where,
      select: {
        id: true,
        status: true,
        imageUrl: true,
        totalAmount: true,
        establishmentName: true,
        createdAt: true,
        updatedAt: true,
        // Contagem de itens e participantes (leve)
        _count: {
          select: {
            items: true,
            participants: true,
          },
        },
        // Apenas resumo das taxas
        fees: {
          select: {
            id: true,
            type: true,
            value: true,
          },
        },
      },
      orderBy,
      skip,
      take: validLimit,
    });

    // Calcular total de páginas
    const totalPages = Math.ceil(total / validLimit);

    return {
      data,
      meta: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages,
      },
    };
  }

  /**
   * Buscar conta específica
   */
  async findOne(id: string, userId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        imageUrl: true,
        imageKey: true,
        totalAmount: true,
        establishmentName: true,
        ocrRawText: true,
        createdAt: true,
        updatedAt: true,
        // Itens com divisões
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            divisions: {
              select: {
                id: true,
                shareAmount: true,
                participant: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        // Participantes com divisões
        participants: {
          select: {
            id: true,
            name: true,
            divisions: {
              select: {
                id: true,
                shareAmount: true,
                billItemId: true,
              },
            },
          },
        },
        // Taxas
        fees: {
          select: {
            id: true,
            type: true,
            description: true,
            value: true,
          },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    if (bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta conta');
    }

    // Gerar nova URL pré-assinada (caso a antiga tenha expirado)
    let freshUrl = bill.imageUrl;
    if (bill.imageKey) {
      freshUrl = await this.storage.getSignedUrl(bill.imageKey);
    }

    return {
      ...bill,
      imageUrl: freshUrl,
    };
  }

  /**
   * Retornar resumo da conta com valores por participante
   */
  async getSummary(id: string, userId: string) {
    // Buscar conta com todas as relações
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            divisions: {
              include: {
                participant: true,
              },
            },
          },
        },
        participants: {
          include: {
            divisions: {
              include: {
                billItem: true,
              },
            },
          },
        },
        fees: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    if (bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta conta');
    }

    // Calcular subtotal (soma de todos os itens)
    const subtotal = bill.items.reduce(
      (acc, item) => acc + Number(item.totalPrice),
      0,
    );

    // Calcular valor total das taxas
    let totalFees = 0;
    for (const fee of bill.fees) {
      if (fee.type === 'SERVICE_PERCENTAGE') {
        totalFees += subtotal * (Number(fee.value) / 100);
      } else {
        totalFees += Number(fee.value);
      }
    }

    // Calcular valores por participante
    const participants = bill.participants.map((participant) => {
      // Soma dos itens consumidos pelo participante
      const itemsSubtotal = participant.divisions.reduce(
        (acc, division) => acc + Number(division.shareAmount),
        0,
      );

      // Taxa proporcional ao consumo
      const participantFees =
        subtotal > 0 ? (itemsSubtotal / subtotal) * totalFees : 0;

      // Total do participante (itens + taxas)
      const total = Math.round((itemsSubtotal + participantFees) * 100) / 100;

      // Itens consumidos pelo participante
      const items = participant.divisions.map((division) => ({
        id: division.billItem.id,
        name: division.billItem.name,
        quantity: division.billItem.quantity,
        unitPrice: Number(division.billItem.unitPrice),
        totalPrice: Number(division.billItem.totalPrice),
        shareAmount: Number(division.shareAmount),
      }));

      // Taxas proporcionais do participante
      const fees = bill.fees.map((fee) => {
        let feeValue = 0;
        if (fee.type === 'SERVICE_PERCENTAGE') {
          feeValue =
            subtotal > 0
              ? (itemsSubtotal / subtotal) *
                (subtotal * (Number(fee.value) / 100))
              : 0;
        } else {
          feeValue =
            subtotal > 0 ? (itemsSubtotal / subtotal) * Number(fee.value) : 0;
        }

        return {
          id: fee.id,
          type: fee.type,
          description: fee.description,
          originalValue: Number(fee.value),
          participantShare: Math.round(feeValue * 100) / 100,
        };
      });

      return {
        id: participant.id,
        name: participant.name,
        subtotal: Math.round(itemsSubtotal * 100) / 100,
        fees: Math.round(participantFees * 100) / 100,
        total,
        items,
        feeDetails: fees,
      };
    });

    // Gerar nova URL pré-assinada (caso a antiga tenha expirado)
    const freshUrl = await this.storage.getSignedUrl(bill.imageKey);

    return {
      bill: {
        id: bill.id,
        status: bill.status,
        establishmentName: bill.establishmentName,
        imageUrl: freshUrl,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
      },
      participants,
      summary: {
        subtotal: Math.round(subtotal * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        total: Math.round((subtotal + totalFees) * 100) / 100,
      },
    };
  }

  /**
   * Atualizar conta
   */
  async update(id: string, userId: string, updateBillDto: UpdateBillDto) {
    const bill = await this.findOne(id, userId);

    // Se enviou novos itens, atualizar
    if (updateBillDto.items) {
      // Deletar itens antigos
      await this.prisma.billItem.deleteMany({
        where: { billId: id },
      });

      // Criar novos itens
      const items = updateBillDto.items.map((item) => ({
        billId: id,
        ...item,
      }));

      await this.prisma.billItem.createMany({ data: items });
    }

    // Atualizar conta
    return this.prisma.bill.update({
      where: { id },
      data: {
        status: updateBillDto.status,
        establishmentName: updateBillDto.establishmentName,
        totalAmount: updateBillDto.totalAmount,
      },
      select: {
        id: true,
        status: true,
        imageUrl: true,
        totalAmount: true,
        establishmentName: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
        participants: {
          select: {
            id: true,
            name: true,
          },
        },
        fees: {
          select: {
            id: true,
            type: true,
            description: true,
            value: true,
          },
        },
      },
    });
  }

  /**
   * Deletar conta (e imagem do S3)
   */
  async remove(id: string, userId: string) {
    const bill = await this.findOne(id, userId);

    // Deletar imagem do S3 se existir
    if (bill.imageKey) {
      await this.storage.deleteFile(bill.imageKey);
    }

    // Deletar conta (cascade deleta itens, participantes, divisões)
    await this.prisma.bill.delete({
      where: { id },
    });

    return { message: 'Conta deletada com sucesso' };
  }

  async validateFinalize(
    id: string,
    userId: string,
    finalizeBillDto: FinalizeBillDto,
  ) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    // Validar se a conta pertence ao usuário
    if (bill.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta conta');
    }

    if (
      !(
        bill.status === BillStatus.DIVIDING ||
        bill.status === BillStatus.REVIEWING
      )
    ) {
      throw new BadRequestException(
        'Conta não está em um estado válido para finalização',
      );
    }

    const billItens = await this.prisma.billItem.findMany({
      where: { billId: id },
    });

    if (billItens.length === 0) {
      throw new BadRequestException('Conta não possui itens para finalizar');
    }

    for (const item of billItens) {
      const divisions = finalizeBillDto.divisions.filter(
        (div) => div.billItemId === item.id,
      );

      if (divisions.length === 0) {
        throw new BadRequestException(
          `Item "${item.name}" não possui divisões`,
        );
      }

      const divisionSum = divisions.reduce(
        (acc, div) => acc + Number(div.shareAmount),
        0,
      );
      const itemTotal = Number(item.totalPrice);

      // Usar tolerância para comparação de decimais (evitar problemas de ponto flutuante)
      if (Math.abs(divisionSum - itemTotal) > 0.01) {
        throw new BadRequestException(
          `Soma das divisões (${divisionSum.toFixed(2)}) para o item "${item.name}" não corresponde ao preço total (${itemTotal.toFixed(2)})`,
        );
      }
    }
  }

  async finalize(id: string, userId: string, finalizeBillDto: FinalizeBillDto) {
    await this.validateFinalize(id, userId, finalizeBillDto);

    // Buscar participantes da conta para calcular taxas proporcionais
    const participants = await this.prisma.participant.findMany({
      where: { billId: id },
    });

    // Calcular total por participante da conta (sem taxas)
    const participantTotals: Record<string, number> = {};
    for (const participant of participants) {
      participantTotals[participant.id] = 0;
    }

    for (const division of finalizeBillDto.divisions) {
      if (!participantTotals[division.participantId]) {
        participantTotals[division.participantId] = 0;
      }
      participantTotals[division.participantId] += Number(division.shareAmount);
    }

    // Calcular subtotal (soma de todos os itens divididos)
    const subtotal = Object.values(participantTotals).reduce(
      (acc, val) => acc + val,
      0,
    );

    // Persistir divisões
    for (const division of finalizeBillDto.divisions) {
      await this.prisma.division.create({
        data: {
          billItemId: division.billItemId,
          participantId: division.participantId,
          shareAmount: division.shareAmount,
        },
      });
    }

    // Persistir taxas e calcular valor total das taxas
    let totalFees = 0;
    const persistedFees: Awaited<ReturnType<typeof this.prisma.fee.create>>[] =
      [];

    if (finalizeBillDto.fees && finalizeBillDto.fees.length > 0) {
      for (const fee of finalizeBillDto.fees) {
        const persistedFee = await this.prisma.fee.create({
          data: {
            billId: id,
            type: fee.type,
            description: fee.description,
            value: fee.value,
          },
        });
        persistedFees.push(persistedFee);

        // Calcular valor real da taxa
        if (fee.type === 'SERVICE_PERCENTAGE') {
          totalFees += subtotal * (Number(fee.value) / 100);
        } else {
          totalFees += Number(fee.value);
        }
      }
    }

    // Calcular total por participante incluindo taxas (proporcionalmente)
    const participantTotalsWithFees: Record<
      string,
      { subtotal: number; fees: number; total: number }
    > = {};

    for (const participantId of Object.keys(participantTotals)) {
      const participantSubtotal = participantTotals[participantId];
      // Taxa proporcional ao consumo do participante
      const participantFees =
        subtotal > 0 ? (participantSubtotal / subtotal) * totalFees : 0;

      participantTotalsWithFees[participantId] = {
        subtotal: participantSubtotal,
        fees: Math.round(participantFees * 100) / 100, // Arredondar para 2 casas decimais
        total: Math.round((participantSubtotal + participantFees) * 100) / 100,
      };
    }

    // Atualizar status da conta para COMPLETED
    const bill = await this.prisma.bill.update({
      where: { id },
      data: {
        status: BillStatus.COMPLETED,
      },
      include: {
        items: true,
        participants: true,
        fees: true,
      },
    });

    // Retornar resumo da finalização com valores por participante
    return {
      bill,
      summary: {
        subtotal,
        totalFees,
        grandTotal: subtotal + totalFees,
      },
      participantTotals: participantTotalsWithFees,
      fees: persistedFees,
    };
  }
}
