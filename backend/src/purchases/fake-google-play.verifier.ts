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
 *   no-account-...     compra paga sem o identificador da conta
 *   qty<N>-...         compra paga de N unidades (ex.: qty3-abc)
 *   qualquer outro     compra paga de 1 unidade da conta do usuário
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
    accountId?: string,
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
    const quantity = purchaseToken.match(/^qty(\d+)-/)?.[1];
    return {
      state: 'PURCHASED',
      orderId,
      // Como a Google real, devolve o usuário que o app informou na compra;
      // no-account-... simula um app que não enviou o identificador.
      obfuscatedAccountId: purchaseToken.startsWith('no-account-')
        ? undefined
        : accountId,
      consumed,
      quantity: quantity ? Number(quantity) : undefined,
    };
  }

  async consumeProductPurchase(
    _productId: string,
    purchaseToken: string,
  ): Promise<void> {
    this.logger.debug(`Compra simulada consumida: ${purchaseToken}`);
    this.consumed.add(purchaseToken);
  }
}
