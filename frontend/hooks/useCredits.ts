import { useQuery, useQueryClient } from '@tanstack/react-query';
import creditsService, { CreditBalance } from '../services/credits.service';

export const creditsQueryKey = ['credits', 'balance'] as const;

/**
 * Saldo de créditos da pessoa autenticada.
 *
 * O saldo muda por fora da tela: uma leitura em andamento prende um crédito,
 * uma falha devolve, uma compra soma. Por isso o dado é considerado velho logo
 * e é recarregado ao montar, diferente do padrão do projeto.
 */
export function useCredits(enabled = true) {
  const query = useQuery<CreditBalance>({
    queryKey: creditsQueryKey,
    queryFn: () => creditsService.getBalance(),
    enabled,
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
  });

  const balance = query.data;

  return {
    ...query,
    balance,
    /** Quantas leituras a pessoa pode começar agora. */
    available: balance?.available ?? 0,
    /** Conta isenta, como a de um restaurante parceiro: não consome crédito. */
    isUnlimited: balance?.policy === 'UNLIMITED',
    /**
     * Verdadeiro só quando temos certeza de que não há saldo. Enquanto carrega,
     * ou se a consulta falhar, não bloqueamos o caminho da pessoa.
     */
    hasNoCredits:
      query.isSuccess &&
      balance?.policy === 'METERED' &&
      (balance?.available ?? 0) < 1,
  };
}

/** Recarrega o saldo depois de enviar uma nota, de uma falha ou de uma compra. */
export function useInvalidateCredits() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: creditsQueryKey });
}
