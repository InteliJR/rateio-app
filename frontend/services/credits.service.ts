// mobile/services/credits.service.ts

import { logger } from '../lib/logger';
import { apiService } from './api.service';

export type CreditPolicy = 'METERED' | 'UNLIMITED';

export interface CreditBalance {
  /** Créditos que a pessoa possui, incluindo os reservados. */
  balance: number;
  /** Créditos presos em leituras em andamento. */
  held: number;
  /** Créditos utilizáveis agora. É este o número exibido nas telas. */
  available: number;
  policy: CreditPolicy;
  freeGrantTotal: number;
  /** Quando a cota gratuita renova. Nulo enquanto a cota for concedida uma única vez. */
  resetsAt: string | null;
}

/**
 * Enquanto a API de créditos não estiver publicada, as telas funcionam com
 * dados de exemplo. Ligar por EXPO_PUBLIC_CREDITS_MOCK=true.
 */
const USE_MOCK = process.env.EXPO_PUBLIC_CREDITS_MOCK === 'true';

const MOCK_BALANCE: CreditBalance = {
  balance: 3,
  held: 0,
  available: 3,
  policy: 'METERED',
  freeGrantTotal: 3,
  resetsAt: null,
};

/** Código que o backend usa quando a leitura não pode começar por falta de saldo. */
export const INSUFFICIENT_CREDITS_STATUS = 402;

export function isInsufficientCreditsError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === INSUFFICIENT_CREDITS_STATUS;
}

class CreditsService {
  /**
   * Saldo da pessoa autenticada. Usado na criação de conta, para decidir se
   * a leitura por foto pode começar, e no perfil.
   */
  async getBalance(): Promise<CreditBalance> {
    if (USE_MOCK) {
      logger.debug('[CreditsService] Usando saldo de exemplo');
      return MOCK_BALANCE;
    }

    try {
      const api = apiService.getApi();
      const response = await api.get('/credits/balance');
      logger.debug('[CreditsService] Saldo recebido:', response.data);
      return response.data;
    } catch (error: any) {
      logger.error(
        '[CreditsService] Erro ao consultar saldo:',
        error.response?.data || error,
      );
      throw error;
    }
  }
}

export const creditsService = new CreditsService();
export default creditsService;
