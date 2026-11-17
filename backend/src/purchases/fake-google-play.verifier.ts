import { Injectable, Logger } from '@nestjs/common';
import {
  GooglePlayVerifier,
  GooglePurchaseInfo,
} from './google-play-verifier';

/**
 * Google Play simulada para desenvolvimento local (GOOGLE_PLAY_VERIFIER=fake).
 * O resultado depende do prefixo do purchaseToken:
 *
 *   pending-...        compra pendente
 *   canceled-...       compra cancelada
 *   other-account-...  compra vinculada a outra conta
 *   qualquer outro     compra paga
 *
 * Nunca é ligada em produção (ver createGooglePlayVerifier).
 */
@Injectable()
export class FakeGooglePlayVerifier extends GooglePlayVerifier {
  private readonly logger = new Logger(FakeGooglePlayVerifier.name);
  private readonly consumed = new Set<string>();

  async getProductPurchase(
    _productId: string,
    purchaseToken: string,
  ): Promise<GooglePurchaseInfo> {
    const consumed = this.consumed.has(purchaseToken);
    const orderId = `FAKE.${purchaseToken}`;

    if (purchaseToken.startsWith('pending-')) {
      return { state: 'PENDING', orderId, consumed };
    }
    if (purchaseToken.startsWith('canceled-')) {
      return { state: 'CANCELED', orderId, consumed };
    }
    if (purchaseToken.startsWith('other-account-')) {
      return {
        state: 'PURCHASED',
        orderId,
        obfuscatedAccountId: 'another-user',
        consumed,
      };
    }
    return { state: 'PURCHASED', orderId, consumed };
  }

  async consumeProductPurchase(
    _productId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.debug(`Compra simulada consumida: ${purchaseToken}`);
    this.consumed.add(purchaseToken);
  }
}
