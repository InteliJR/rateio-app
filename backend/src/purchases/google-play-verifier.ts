export type GooglePurchaseState = 'PURCHASED' | 'PENDING' | 'CANCELED';

export interface GooglePurchaseInfo {
  state: GooglePurchaseState;
  orderId?: string;
  /** Identificador do usuário enviado pelo app na compra. Obrigatório para creditar. */
  obfuscatedAccountId?: string;
  /** Se a Google já registrou o consumo desta compra. */
  consumed: boolean;
  /** Unidades compradas na transação. Ausente equivale a 1. */
  quantity?: number;
}

/**
 * Porta para a Google Play Developer API. Os testes usam uma versão falsa;
 * em runtime a implementação real é GooglePlayApiVerifier.
 */
export abstract class GooglePlayVerifier {
  /**
   * `accountId` é o usuário que está validando a compra. A Google real o
   * ignora; só a versão simulada o usa, para devolvê-lo como dono da compra.
   */
  abstract getProductPurchase(
    productId: string,
    purchaseToken: string,
    accountId?: string,
  ): Promise<GooglePurchaseInfo>;

  abstract consumeProductPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<void>;
}
