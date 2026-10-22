export type GooglePurchaseState = 'PURCHASED' | 'PENDING' | 'CANCELED';

export interface GooglePurchaseInfo {
  state: GooglePurchaseState;
  orderId?: string;
  /** Identificador do usuário enviado pelo app na compra, quando existir. */
  obfuscatedAccountId?: string;
  /** Se a Google já registrou o consumo desta compra. */
  consumed: boolean;
}

/**
 * Porta para a Google Play Developer API. Os testes usam uma versão falsa;
 * em runtime a implementação real é GooglePlayApiVerifier.
 */
export abstract class GooglePlayVerifier {
  abstract getProductPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<GooglePurchaseInfo>;

  abstract consumeProductPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<void>;
}
