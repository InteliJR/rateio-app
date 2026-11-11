import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma, Purchase, PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlayVerifier, GooglePurchaseInfo } from './google-play-verifier';
import { CreditsGranter } from './credits-granter';
import { getProductCredits } from './purchase-products';
import { VerifyGooglePurchaseDto } from './dto/verify-google-purchase.dto';

/** Limite da coluna Int (32 bits) onde os créditos são gravados. */
const MAX_CREDITS = 2_147_483_647;

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

    if (existing && existing.userId === userId) {
      if (existing.status === PurchaseStatus.CREDITED) {
        return this.toResult(existing, true);
      }
      if (existing.status === PurchaseStatus.CANCELED) {
        throw new BadRequestException('Compra cancelada');
      }
      if (existing.status === PurchaseStatus.REJECTED) {
        throw new ForbiddenException('Compra recusada');
      }
      return this.settle(userId, existing);
    }

    // Token novo, ou registrado por outra conta: a Google decide de quem é a
    // compra ANTES de qualquer gravação. Gravar primeiro deixaria quem enviasse
    // o token antes virar dono dele e bloquear o dono real.
    const info = await this.verifier.getProductPurchase(
      dto.productId,
      dto.purchaseToken,
      userId,
    );

    if (info.obfuscatedAccountId && info.obfuscatedAccountId !== userId) {
      this.logger.warn(
        `Token de compra de outra conta enviado por ${userId}; nada foi gravado.`,
      );
      throw new ForbiddenException('Compra pertence a outro usuário');
    }

    if (!info.obfuscatedAccountId) {
      if (info.state === 'CANCELED') {
        throw new BadRequestException('Compra cancelada');
      }
      if (info.state === 'PENDING') {
        // Ainda sem pagamento e sem dono comprovado: não grava. O app valida de
        // novo quando a loja confirmar a compra.
        return {
          status: PurchaseStatus.PENDING,
          productId: dto.productId,
          credits,
          alreadyCredited: false,
        };
      }
      // O app deve enviar o id do usuário (obfuscatedAccountId) ao iniciar a
      // compra; sem ele não há como provar de quem ela é. A Google reembolsa
      // compras não consumidas, então o usuário não fica sem o dinheiro.
      throw new BadRequestException('Compra sem identificação da conta');
    }

    if (existing) {
      return this.settle(userId, await this.reclaim(existing, userId), info);
    }

    const purchase = await this.createPending(userId, dto, credits);
    return this.settle(userId, purchase, info);
  }

  /**
   * A Google confirmou que a compra é de `userId`, mas o token já estava
   * registrado em outra conta (gravado antes desta correção). Devolve o
   * registro ao dono real. Uma compra já creditada a outra conta não é mexida:
   * fica para o suporte, que precisa estornar os créditos de lá.
   */
  private async reclaim(existing: Purchase, userId: string): Promise<Purchase> {
    if (existing.status === PurchaseStatus.CREDITED) {
      this.logger.error(
        `Compra ${existing.id} creditada a ${existing.userId}, mas a Google indica ${userId}. Requer suporte.`,
      );
      throw new ForbiddenException('Compra pertence a outro usuário');
    }

    this.logger.warn(
      `Compra ${existing.id} devolvida de ${existing.userId} para o dono indicado pela Google.`,
    );
    return this.prisma.purchase.update({
      where: { id: existing.id },
      data: { userId, status: PurchaseStatus.PENDING },
    });
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
    verified?: GooglePurchaseInfo,
  ): Promise<PurchaseResult> {
    const info =
      verified ??
      (await this.verifier.getProductPurchase(
        purchase.productId,
        purchase.purchaseToken,
        userId,
      ));

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

    if (!info.obfuscatedAccountId) {
      // O app deve enviar o id do usuário (obfuscatedAccountId) ao iniciar a
      // compra; sem ele não há como provar de quem ela é. A Google reembolsa
      // compras não consumidas, então o usuário não fica sem o dinheiro.
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.REJECTED },
      });
      throw new BadRequestException('Compra sem identificação da conta');
    }

    const credits = this.totalCredits(purchase, info.quantity);

    // O ledger deve ser idempotente por `reference`; assim, requisições
    // concorrentes com o mesmo token não somam créditos duas vezes.
    await this.credits.grant({
      userId,
      credits,
      reference: purchase.id,
    });

    const credited = await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: PurchaseStatus.CREDITED,
        credits,
        orderId: info.orderId ?? purchase.orderId,
        consumedAt: info.consumed ? new Date() : purchase.consumedAt,
      },
    });

    if (!info.consumed) {
      await this.consume(credited);
    }

    return this.toResult(credited, false);
  }

  /**
   * Créditos da compra: valor por unidade do catálogo vezes a quantidade que a
   * Google registrou. Enquanto não creditada, `purchase.credits` guarda só o
   * valor por unidade; ao creditar, passa a guardar o total.
   */
  private totalCredits(purchase: Purchase, quantity = 1): number {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantidade da compra inválida');
    }

    const perUnit = getProductCredits(purchase.productId) ?? purchase.credits;
    const total = perUnit * quantity;
    if (!Number.isSafeInteger(total) || total > MAX_CREDITS) {
      throw new BadRequestException('Quantidade da compra inválida');
    }
    return total;
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
