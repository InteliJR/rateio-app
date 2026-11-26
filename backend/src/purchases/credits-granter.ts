import { Injectable } from '@nestjs/common';
import { CreditTransactionType } from '@prisma/client';
import { CreditsService } from '../credits/credits.service';

export interface GrantCreditsInput {
  userId: string;
  credits: number;
  /**
   * Chave de idempotência (id da compra). Chamadas repetidas com a mesma
   * referência não devem somar créditos novamente.
   */
  reference: string;
}

/** Porta para o ledger de créditos. A implementação deve ser idempotente por `reference`. */
export abstract class CreditsGranter {
  abstract grant(input: GrantCreditsInput): Promise<void>;
}

/**
 * Credita a compra no ledger. O prefixo separa a chave das outras origens
 * (cota gratuita, reserva, anúncio). O purchaseToken não é copiado para o
 * ledger: a ligação com a compra é feita pela referência.
 */
@Injectable()
export class LedgerCreditsGranter extends CreditsGranter {
  constructor(private readonly creditsService: CreditsService) {
    super();
  }

  async grant(input: GrantCreditsInput): Promise<void> {
    await this.creditsService.grant({
      userId: input.userId,
      credits: input.credits,
      reference: `purchase:${input.reference}`,
      type: CreditTransactionType.PURCHASE,
      reason: 'Compra no Google Play',
    });
  }
}
