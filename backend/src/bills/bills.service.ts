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
import { FinalizeBillDto } from './dto/finalize-bill.dto';
import { CreateBillItemDto } from '../bill-items/dto/create-bill-item.dto';
import { UpdateBillItemDto } from '../bill-items/dto/update-bill-item.dto';
import { BatchUpdateBillItemsDto } from './dto/update-bill.dto';
import { FeesService } from '../fees/fees.service';
import { CreateFeeDto } from '../fees/dto/create-fee.dto';
import { BillStatus, Prisma } from '@prisma/client';

// Campos permitidos para ordenação
export type BillSortField = 'createdAt' | 'totalAmount';
export type SortOrder = 'asc' | 'desc';

// Interface para filtros de busca
export interface BillFilters {
  status?: BillStatus;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sortBy?: BillSortField;
  sortOrder?: SortOrder;
}

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private ocr: OcrService,
    private feesService: FeesService,
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
    try {
      const establishmentName = createBillDto.billName || createBillDto.establishmentName;

      const bill = await this.prisma.bill.create({
        data: {
          userId,
          status: BillStatus.DIVIDING, // Vai direto para divisão
          establishmentName,
          imageUrl: '',
          imageKey: '',
        } as any,
      });

      // Adicionar taxa de serviço se houver
      if (
        createBillDto.serviceFeePercentage !== undefined &&
        createBillDto.serviceFeePercentage !== null &&
        !isNaN(Number(createBillDto.serviceFeePercentage)) &&
        Number(createBillDto.serviceFeePercentage) >= 0 &&
        Number(createBillDto.serviceFeePercentage) <= 100
      ) {
        try {
          await this.prisma.fee.create({
            data: {
              billId: bill.id,
              type: 'SERVICE_PERCENTAGE',
              value: Number(createBillDto.serviceFeePercentage),
            },
          });
        } catch (feeError) {
          console.error('[BillsService] Erro ao criar taxa de serviço:', feeError);
          // Se falhar ao criar a fee, deletar a bill criada para manter consistência
          await this.prisma.bill.delete({ where: { id: bill.id } });
          throw new BadRequestException(
            `Erro ao criar taxa de serviço: ${feeError instanceof Error ? feeError.message : 'Erro desconhecido'}`,
          );
        }
      }

      // Adicionar couvert se houver (sempre por pessoa)
      if (
        createBillDto.coverChargeValue !== undefined &&
        createBillDto.coverChargeValue !== null &&
        !isNaN(Number(createBillDto.coverChargeValue)) &&
        Number(createBillDto.coverChargeValue) > 0
      ) {
        try {
          // O valor do couvert é sempre por pessoa
          const valuePerPerson = Number(createBillDto.coverChargeValue);

          await this.prisma.fee.create({
            data: {
              billId: bill.id,
              type: 'COVER_CHARGE',
              value: valuePerPerson,
              description: 'Couvert por pessoa',
            },
          });
        } catch (feeError) {
          console.error('[BillsService] Erro ao criar couvert:', feeError);
          // Se falhar ao criar couvert, deletar fees e bill criadas
          await this.prisma.fee.deleteMany({ where: { billId: bill.id } }).catch(() => { });
          await this.prisma.bill.delete({ where: { id: bill.id } });
          throw new BadRequestException(
            `Erro ao criar couvert: ${feeError instanceof Error ? feeError.message : 'Erro desconhecido'}`,
          );
        }
      }

      // Adicionar participantes iniciais
      if (
        createBillDto.participantCount !== undefined &&
        createBillDto.participantCount !== null &&
        !isNaN(Number(createBillDto.participantCount)) &&
        Number(createBillDto.participantCount) > 0
      ) {
        try {
          const participantCount = Number(createBillDto.participantCount);
          const participantNames = createBillDto.participantNames || [];
          
          const participants = Array.from({ length: participantCount }, (_, i) => ({
            billId: bill.id,
            // Usar nome fornecido se existir, senão usar nome padrão
            name: participantNames[i]?.trim() || `Pessoa ${i + 1}`,
          }));
          await this.prisma.participant.createMany({ data: participants });
        } catch (participantError) {
          console.error('[BillsService] Erro ao criar participantes:', participantError);
          // Se falhar ao criar participantes, deletar a bill e fee criadas
          await this.prisma.fee.deleteMany({ where: { billId: bill.id } }).catch(() => { });
          await this.prisma.bill.delete({ where: { id: bill.id } });
          throw new BadRequestException(
            `Erro ao criar participantes: ${participantError instanceof Error ? participantError.message : 'Erro desconhecido'}`,
          );
        }
      }

      return bill;
    } catch (error) {
      console.error('[BillsService] Erro ao criar conta:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Erro ao criar conta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    }
  }

  /**
   * Upload de imagem para conta existente + OCR
   */
  async uploadImage(
    billId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, userId },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    if (!file) {
      throw new BadRequestException('Arquivo de imagem obrigatório');
    }

    // 1. Validar arquivo
    if (!this.storage.validateFileType(file.mimetype)) {
      throw new BadRequestException(
        'Apenas imagens são permitidas (JPEG, PNG, WebP)',
      );
    }

    if (!this.storage.validateFileSize(file.size)) {
      throw new BadRequestException('Tamanho máximo: 10MB');
    }

    // 2. Upload da imagem para o S3
    const { url, key } = await this.storage.uploadFile(file, 'bills');

    // 3. Atualizar conta com imagem e status pendente
    const updatedBill = await this.prisma.bill.update({
      where: { id: billId },
      data: {
        imageUrl: url,
        imageKey: key,
        status: BillStatus.PENDING_OCR,
      },
    });

    // 4. Iniciar processamento OCR assíncrono
    this.processOcr(updatedBill.id, url).catch((error) => {
      console.error(`❌ Erro no OCR da conta ${updatedBill.id}:`, error);
    });

    return {
      ...updatedBill,
      message: 'Imagem enviada. Processando OCR...',
    };
  }

  /**
   * Reprocessar OCR de uma conta que falhou anteriormente
   */
  async retryOcr(billId: string, userId: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, userId },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    if (bill.status !== BillStatus.OCR_FAILED) {
      throw new BadRequestException(
        'Reprocessamento OCR só é permitido para contas com status OCR_FAILED',
      );
    }

    if (!bill.imageUrl) {
      throw new BadRequestException(
        'Conta não possui imagem para reprocessar',
      );
    }

    // Remover itens existentes (pode haver itens parciais de tentativa anterior)
    await this.prisma.billItem.deleteMany({ where: { billId } });

    // Resetar status para PENDING_OCR
    const updatedBill = await this.prisma.bill.update({
      where: { id: billId },
      data: { status: BillStatus.PENDING_OCR },
    });

    // Re-disparar OCR de forma assíncrona
    this.processOcr(billId, bill.imageUrl).catch((error) => {
      console.error(`❌ Erro no retry OCR da conta ${billId}:`, error);
    });

    return {
      ...updatedBill,
      message: 'Reprocessando OCR...',
    };
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

    if (filters?.search) {
      where.establishmentName = {
        contains: filters.search,
        mode: 'insensitive',
      };
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
    const freshUrl = bill.imageKey ? await this.storage.getSignedUrl(bill.imageKey) : null;

    // Mapear itens gerais da conta
    const billItems = bill.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
    }));

    return {
      bill: {
        id: bill.id,
        status: bill.status,
        establishmentName: bill.establishmentName,
        imageUrl: freshUrl,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
      },
      items: billItems,
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

    // Persistir divisões (usar upsert para evitar duplicatas)
    // As divisões já podem ter sido criadas na tela de divisão
    for (const division of finalizeBillDto.divisions) {
      await this.prisma.division.upsert({
        where: {
          billItemId_participantId: {
            billItemId: division.billItemId,
            participantId: division.participantId,
          },
        },
        update: {
          shareAmount: division.shareAmount,
        },
        create: {
          billItemId: division.billItemId,
          participantId: division.participantId,
          shareAmount: division.shareAmount,
        },
      });
    }

    // Persistir taxas e calcular valor total das taxas
    // Deletar taxas existentes antes de criar novas (para evitar duplicatas)
    await this.prisma.fee.deleteMany({
      where: { billId: id },
    });

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
   * Verificar se a conta é a mais recente do usuário
   */
  private async isLatestBillForUser(billId: string, userId: string): Promise<boolean> {
    const latestBill = await this.prisma.bill.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    
    return latestBill?.id === billId;
  }

  /**
   * Recalcular o totalAmount da conta baseado nos itens + taxas
   * Permite edição livre durante REVIEWING e DIVIDING
   * Bloqueia apenas COMPLETED (exceto se for a conta mais recente do usuário)
   */
  private async recalculateBillTotal(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        fees: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
    }

    // Bloquear edição de contas finalizadas, EXCETO se for a conta mais recente do usuário
    if (bill.status === 'COMPLETED') {
      const isLatest = await this.isLatestBillForUser(billId, bill.userId);
      if (!isLatest) {
        throw new BadRequestException(
          'Não é possível modificar uma conta finalizada.'
        );
      }
    }

    // Calcular soma dos itens
    const itemsSum = bill.items.reduce(
      (acc, item) => acc + Number(item.totalPrice),
      0,
    );

    // Calcular soma das taxas
    const feesSum = bill.fees.reduce(
      (acc, fee) => acc + Number(fee.value),
      0,
    );

    const calculatedTotal = itemsSum + feesSum;

    // Durante REVIEWING e DIVIDING: recalcular total automaticamente
    // Isso permite que o usuário adicione/corrija itens que o OCR não detectou
    await this.prisma.bill.update({
      where: { id: billId },
      data: { totalAmount: calculatedTotal },
    });

    return calculatedTotal;
  }

  /**
   * Validar que a soma dos itens não ultrapassa o totalAmount da conta
   * Chama recalculateBillTotal que decide entre validar ou recalcular
   */
  private async validateItemsTotal(billId: string) {
    await this.recalculateBillTotal(billId);
  }

  /**
   * Criar item individual
   */
  async createItem(
    billId: string,
    userId: string,
    createBillItemDto: CreateBillItemDto,
  ) {
    // Validar ownership
    await this.validateBillOwnership(billId, userId);

    // Validar que totalPrice = unitPrice * quantity (com tolerância)
    const expectedTotal = createBillItemDto.unitPrice * createBillItemDto.quantity;
    const difference = Math.abs(createBillItemDto.totalPrice - expectedTotal);
    if (difference > 0.01) {
      throw new BadRequestException(
        `O preço total (${createBillItemDto.totalPrice}) deve ser igual a quantidade × preço unitário (${expectedTotal})`,
      );
    }

    // Criar item
    const item = await this.prisma.billItem.create({
      data: {
        billId,
        name: createBillItemDto.name,
        quantity: createBillItemDto.quantity,
        unitPrice: createBillItemDto.unitPrice,
        totalPrice: createBillItemDto.totalPrice,
      },
    });

    // Validar soma dos itens vs totalAmount
    await this.validateItemsTotal(billId);

    return item;
  }

  /**
   * Atualizar item individual
   */
  async updateItem(
    billId: string,
    itemId: string,
    userId: string,
    updateBillItemDto: UpdateBillItemDto,
  ) {
    // Validar ownership da conta
    await this.validateBillOwnership(billId, userId);

    // Validar que o item pertence à conta
    const item = await this.prisma.billItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.billId !== billId) {
      throw new BadRequestException('Item não pertence a esta conta');
    }

    // Preparar dados para atualização
    const updateData: {
      name?: string;
      quantity?: number;
      unitPrice?: number;
      totalPrice?: number;
    } = {};

    if (updateBillItemDto.name !== undefined) {
      const trimmedName = updateBillItemDto.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('O nome do item não pode estar vazio');
      }
      updateData.name = trimmedName;
    }

    if (updateBillItemDto.quantity !== undefined) {
      updateData.quantity = updateBillItemDto.quantity;
    }

    if (updateBillItemDto.unitPrice !== undefined) {
      updateData.unitPrice = updateBillItemDto.unitPrice;
    }

    if (updateBillItemDto.totalPrice !== undefined) {
      updateData.totalPrice = updateBillItemDto.totalPrice;
    }

    // Se atualizou quantity ou unitPrice, recalcular totalPrice se não foi fornecido
    if (
      (updateBillItemDto.quantity !== undefined ||
        updateBillItemDto.unitPrice !== undefined) &&
      updateBillItemDto.totalPrice === undefined
    ) {
      const finalQuantity =
        updateBillItemDto.quantity ?? item.quantity;
      const finalUnitPrice =
        updateBillItemDto.unitPrice ?? Number(item.unitPrice);
      updateData.totalPrice = finalQuantity * finalUnitPrice;
    }

    // Validar que totalPrice = unitPrice * quantity (com tolerância)
    const finalQuantity = updateData.quantity ?? item.quantity;
    const finalUnitPrice =
      updateData.unitPrice ?? Number(item.unitPrice);
    const finalTotalPrice = updateData.totalPrice ?? Number(item.totalPrice);
    const expectedTotal = finalQuantity * finalUnitPrice;
    const difference = Math.abs(finalTotalPrice - expectedTotal);

    if (difference > 0.01) {
      throw new BadRequestException(
        `O preço total (${finalTotalPrice}) deve ser igual a quantidade × preço unitário (${expectedTotal})`,
      );
    }

    // Atualizar item
    const updatedItem = await this.prisma.billItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Validar soma dos itens vs totalAmount
    await this.validateItemsTotal(billId);

    return updatedItem;
  }

  /**
   * Deletar item individual
   */
  async deleteItem(billId: string, itemId: string, userId: string) {
    // Validar ownership da conta
    await this.validateBillOwnership(billId, userId);

    // Validar que o item pertence à conta
    const item = await this.prisma.billItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.billId !== billId) {
      throw new BadRequestException('Item não pertence a esta conta');
    }

    // Deletar item
    await this.prisma.billItem.delete({
      where: { id: itemId },
    });

    // Validar soma dos itens vs totalAmount (após deletar)
    await this.validateItemsTotal(billId);

    return { message: 'Item removido com sucesso' };
  }

  /**
   * Atualizar itens em lote
   * Substitui todos os itens existentes pelos itens fornecidos
   */
  async batchUpdateItems(
    billId: string,
    userId: string,
    batchUpdateDto: BatchUpdateBillItemsDto,
  ) {
    // Validar ownership
    await this.validateBillOwnership(billId, userId);

    // Validar cada item
    for (const itemDto of batchUpdateDto.items) {
      // Validar que totalPrice = unitPrice * quantity (com tolerância)
      const expectedTotal = itemDto.unitPrice * itemDto.quantity;
      const difference = Math.abs(itemDto.totalPrice - expectedTotal);
      if (difference > 0.01) {
        throw new BadRequestException(
          `Item "${itemDto.name}": o preço total (${itemDto.totalPrice}) deve ser igual a quantidade × preço unitário (${expectedTotal})`,
        );
      }
    }

    // Deletar todos os itens existentes
    await this.prisma.billItem.deleteMany({
      where: { billId },
    });

    // Criar novos itens
    const items = batchUpdateDto.items.map((item) => ({
      billId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));

    await this.prisma.billItem.createMany({ data: items });

    // Validar soma dos itens vs totalAmount
    await this.validateItemsTotal(billId);

    // Retornar todos os itens criados
    const allItems = await this.prisma.billItem.findMany({
      where: { billId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      message: `${items.length} item(ns) atualizado(s)`,
      items: allItems,
    };
  }

  /**
   * Criar taxa/couvert
   */
  async createFee(
    billId: string,
    userId: string,
    createFeeDto: CreateFeeDto,
  ) {
    // Validar ownership
    await this.validateBillOwnership(billId, userId);

    // Garantir que o billId do DTO corresponde ao parâmetro
    if (createFeeDto.billId !== billId) {
      throw new BadRequestException(
        'O ID da conta no body deve corresponder ao ID na URL',
      );
    }

    // Reutilizar FeesService
    return this.feesService.create(userId, createFeeDto);
  }

  /**
   * Duplicar conta (reutilizar) - cria uma nova conta com os mesmos itens, participantes e taxas
   * A nova conta fica em status DIVIDING para edição
   */
  async duplicate(billId: string, userId: string) {
    // 1. Buscar conta original com todos os dados
    const originalBill = await this.prisma.bill.findFirst({
      where: { id: billId, userId },
      include: {
        items: true,
        participants: true,
        fees: true,
      },
    });

    if (!originalBill) {
      throw new NotFoundException('Conta não encontrada');
    }

    // 2. Criar nova conta (sem imagem, status DIVIDING para edição)
    const newBill = await this.prisma.bill.create({
      data: {
        userId,
        status: BillStatus.DIVIDING,
        establishmentName: originalBill.establishmentName 
          ? `${originalBill.establishmentName} (Cópia)` 
          : 'Conta Reutilizada',
        imageUrl: '', // Nova conta não tem imagem
        imageKey: '',
        totalAmount: originalBill.totalAmount,
      },
    });

    // 3. Duplicar participantes
    if (originalBill.participants.length > 0) {
      const participantsData = originalBill.participants.map((p) => ({
        billId: newBill.id,
        name: p.name,
      }));
      await this.prisma.participant.createMany({ data: participantsData });
    }

    // 4. Duplicar itens (sem divisões - usuário vai refazer)
    if (originalBill.items.length > 0) {
      const itemsData = originalBill.items.map((item) => ({
        billId: newBill.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }));
      await this.prisma.billItem.createMany({ data: itemsData });
    }

    // 5. Duplicar taxas
    if (originalBill.fees.length > 0) {
      const feesData = originalBill.fees.map((fee) => ({
        billId: newBill.id,
        type: fee.type,
        value: fee.value,
        description: fee.description,
      }));
      await this.prisma.fee.createMany({ data: feesData });
    }

    // 6. Retornar nova conta com dados completos
    const newBillWithData = await this.prisma.bill.findUnique({
      where: { id: newBill.id },
      include: {
        items: true,
        participants: true,
        fees: true,
      },
    });

    return {
      ...newBillWithData,
      message: 'Conta duplicada com sucesso. Você pode editar os itens e participantes.',
    };
  }
}
