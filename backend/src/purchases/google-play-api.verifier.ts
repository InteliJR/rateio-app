import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import {
  GooglePlayVerifier,
  GooglePurchaseInfo,
  GooglePurchaseState,
} from './google-play-verifier';

const ANDROID_PUBLISHER_URL =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

interface ProductPurchaseResponse {
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
}

@Injectable()
export class GooglePlayApiVerifier extends GooglePlayVerifier {
  private readonly logger = new Logger(GooglePlayApiVerifier.name);
  private auth?: GoogleAuth;

  async getProductPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<GooglePurchaseInfo> {
    const data = await this.request<ProductPurchaseResponse>(
      'GET',
      this.tokenUrl(productId, purchaseToken),
    );

    return {
      state: this.mapState(data.purchaseState),
      orderId: data.orderId,
      obfuscatedAccountId: data.obfuscatedExternalAccountId,
      consumed: data.consumptionState === 1,
    };
  }

  async consumeProductPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<void> {
    await this.request(
      'POST',
      `${this.tokenUrl(productId, purchaseToken)}:consume`,
    );
  }

  // purchaseState: 0 = comprada, 1 = cancelada, 2 = pendente
  private mapState(purchaseState?: number): GooglePurchaseState {
    if (purchaseState === 0) return 'PURCHASED';
    if (purchaseState === 2) return 'PENDING';
    return 'CANCELED';
  }

  private tokenUrl(productId: string, purchaseToken: string) {
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    if (!packageName) {
      throw new ServiceUnavailableException(
        'Verificação de compras do Google Play não configurada',
      );
    }

    return `${ANDROID_PUBLISHER_URL}/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  }

  private getAuth(): GoogleAuth {
    if (this.auth) return this.auth;

    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new ServiceUnavailableException(
        'Verificação de compras do Google Play não configurada',
      );
    }

    this.auth = new GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    return this.auth;
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    url: string,
  ): Promise<T> {
    try {
      const client = await this.getAuth().getClient();
      const response = await client.request<T>({ url, method });
      return response.data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Falha ao consultar a Google Play Developer API: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível validar a compra no Google Play',
      );
    }
  }
}
