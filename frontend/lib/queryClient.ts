import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // Considera os dados "frescos" por 30 segundos
      gcTime: 5 * 60 * 1000, // Mantém cache por 5 minutos (anteriormente cacheTime)
      refetchOnWindowFocus: false, // Não refaz requisição ao focar na janela
      refetchOnMount: false, // Não refaz requisição ao montar se os dados estão frescos
      refetchOnReconnect: false, // Não refaz requisição ao reconectar
      retry: 1, // Tenta novamente apenas 1 vez em caso de erro
    },
  },
});

