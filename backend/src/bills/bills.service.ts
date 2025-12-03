import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrService } from '../ocr/ocr.service';
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
  ) {}

  /**
   * Criar conta com upload de imagem e OCR
   */
  async create(
    file: Express.Multer.File,
    userId: string,
    createBillDto: CreateBillDto,
  ) {
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

  /**
   * Processar OCR da imagem (chamado assincronamente)
   */
  private async processOcr(billId: string, imageUrl: string) {
    try {
      // 1. Fazer OCR
      const ocrResult = await this.ocr.processImage(imageUrl);

      // 2. Validar resultado
      if (!this.ocr.validateOcrResult(ocrResult)) {
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
    const freshUrl = await this.storage.getSignedUrl(bill.imageKey);

    return {
      ...bill,
      imageUrl: freshUrl,
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

    // Deletar imagem do S3
    await this.storage.deleteFile(bill.imageKey);

    // Deletar conta (cascade deleta itens, participantes, divisões)
    await this.prisma.bill.delete({
      where: { id },
    });

    return { message: 'Conta deletada com sucesso' };
  }
}
