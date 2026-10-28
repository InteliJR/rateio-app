import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma, Purchase, PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlayVerifier } from './google-play-verifier';
import { CreditsGranter } from './credits-granter';
import { getProductCredits } from './purchase-products';
import { VerifyGooglePurchaseDto } from './dto/verify-google-purchase.dto';

export interface PurchaseResult {
  status: PurchaseStatus;
  productId: string;
  credits: number;
  /** true quando o token já havia sido creditado antes. */
  alreadyCredited: boolean;
}

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: GooglePlayVerifier,
    private readonly credits: CreditsGranter,
  ) {}

  async verifyGooglePurchase(
    userId: string,
    dto: VerifyGooglePurchaseDto,
  ): Promise<PurchaseResult> {
    const credits = getProductCredits(dto.productId);
    if (!credits) {
      throw new BadRequestException('Produto desconhecido');
    }

    const existing = await this.prisma.purchase.findUnique({
      where: { purchaseToken: dto.purchaseToken },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('Compra pertence a outro usuário');
      }
      if (existing.status === PurchaseStatus.CREDITED) {
        return this.toResult(existing, true);
      }
      if (existing.status === PurchaseStatus.CANCELED) {
        throw new BadRequestException('Compra cancelada');
      }
      if (existing.status === PurchaseStatus.REJECTED) {
        throw new ForbiddenException('Compra recusada');
      }
    }

    const purchase =
      existing ?? (await this.createPending(userId, dto, credits));

    return this.settle(userId, purchase);
  }

  /**
   * Reprocessa compras do usuário que ficaram pendentes ou sem consumo
   * (app fechado no meio do fluxo, falha de rede, reinstalação).
   */
  async reconcile(userId: string): Promise<PurchaseResult[]> {
    const open = await this.prisma.purchase.findMany({
      where: {
        userId,
        OR: [
          { status: PurchaseStatus.PENDING },
          { status: PurchaseStatus.CREDITED, consumedAt: null },
        ],
      },
    });

    const results: PurchaseResult[] = [];
    for (const purchase of open) {
      try {
        if (purchase.status === PurchaseStatus.CREDITED) {
          await this.consume(purchase);
          results.push(this.toResult(purchase, true));
        } else {
          results.push(await this.settle(userId, purchase));
        }
      } catch (error) {
        this.logger.warn(
          `Falha ao reconciliar compra ${purchase.id}: ${(error as Error).message}`,
        );
      }
    }
    return results;
  }

  private async settle(
    userId: string,
    purchase: Purchase,
  ): Promise<PurchaseResult> {
    const info = await this.verifier.getProductPurchase(
      purchase.productId,
      purchase.purchaseToken,
    );

    if (info.obfuscatedAccountId && info.obfuscatedAccountId !== userId) {
      // Mantém o registro para suporte/antifraude, fora da fila de reconciliação.
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.REJECTED },
      });
      throw new ForbiddenException('Compra pertence a outro usuário');
    }

    if (info.state === 'PENDING') {
      return this.toResult(purchase, false);
    }

    if (info.state === 'CANCELED') {
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.CANCELED },
      });
      throw new BadRequestException('Compra cancelada');
    }

    // O ledger deve ser idempotente por `reference`; assim, requisições
    // concorrentes com o mesmo token não somam créditos duas vezes.
    await this.credits.grant({
      userId,
      credits: purchase.credits,
      reference: purchase.id,
    });

    const credited = await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: PurchaseStatus.CREDITED,
        orderId: info.orderId ?? purchase.orderId,
        consumedAt: info.consumed ? new Date() : purchase.consumedAt,
      },
    });

    if (!info.consumed) {
      await this.consume(credited);
    }

    return this.toResult(credited, false);
  }

  /** Consumir libera o produto para nova compra; falha aqui não desfaz o crédito. */
  private async consume(purchase: Purchase) {
    try {
      await this.verifier.consumeProductPurchase(
        purchase.productId,
        purchase.purchaseToken,
      );
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { consumedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `Compra ${purchase.id} creditada, mas não consumida: ${(error as Error).message}`,
      );
    }
  }

  private async createPending(
    userId: string,
    dto: VerifyGooglePurchaseDto,
    credits: number,
  ): Promise<Purchase> {
    try {
      return await this.prisma.purchase.create({
        data: {
          userId,
          productId: dto.productId,
          purchaseToken: dto.purchaseToken,
          credits,
        },
      });
    } catch (error) {
      // Requisição concorrente com o mesmo token criou o registro primeiro.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const purchase = await this.prisma.purchase.findUniqueOrThrow({
          where: { purchaseToken: dto.purchaseToken },
        });
        if (purchase.userId !== userId) {
          throw new ForbiddenException('Compra pertence a outro usuário');
        }
        return purchase;
      }
      throw error;
    }
  }

  private toResult(
    purchase: Purchase,
    alreadyCredited: boolean,
  ): PurchaseResult {
    return {
      status: purchase.status,
      productId: purchase.productId,
      credits: purchase.credits,
      alreadyCredited,
    };
  }
}
