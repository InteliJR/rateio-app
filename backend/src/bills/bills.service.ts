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
import { BillStatus } from '@prisma/client';
import { FinalizeBillDto } from './dto/finalize-bill.dto';

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
   * Buscar todas as contas do usuário
   */
  async findAllByUser(userId: string) {
    return this.prisma.bill.findMany({
      where: { userId },
      include: {
        items: true,
        participants: true,
        fees: true,
        _count: {
          select: {
            items: true,
            participants: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Buscar conta específica
   */
  async findOne(id: string, userId: string) {
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
            divisions: true,
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
      include: {
        items: true,
        participants: true,
        fees: true,
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

  async finalize(id: string, finalizeBillDto: FinalizeBillDto) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
    });

    if (!bill) {
      throw new NotFoundException('Conta não encontrada');
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
  }
}
