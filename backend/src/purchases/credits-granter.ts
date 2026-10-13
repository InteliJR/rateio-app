import { Injectable, Logger } from '@nestjs/common';

export interface GrantCreditsInput {
  userId: string;
  credits: number;
  /**
   * Chave de idempotência (id da compra). Chamadas repetidas com a mesma
   * referência não devem somar créditos novamente.
   */
  reference: string;
}

/**
 * Porta para o ledger de créditos (EPIC-02), que ainda não existe.
 * A implementação do ledger deve ser idempotente por `reference`.
 */
export abstract class CreditsGranter {
  abstract grant(input: GrantCreditsInput): Promise<void>;
}

/** Substituir pela implementação real quando o ledger existir. */
@Injectable()
export class PlaceholderCreditsGranter extends CreditsGranter {
  private readonly logger = new Logger(PlaceholderCreditsGranter.name);

  async grant(input: GrantCreditsInput): Promise<void> {
    this.logger.warn(
      `Ledger indisponível: ${input.credits} créditos não foram somados ao usuário ${input.userId} (compra ${input.reference})`,
    );
  }
}
