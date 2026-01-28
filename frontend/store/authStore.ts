// mobile/store/authStore.ts

import { create } from "zustand";
import { storageService } from "../services/storage.service";
import { AuthState } from "../types/auth.types";
import { authService } from "../services/auth.service";
import { queryClient } from "../lib/queryClient";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true, // Começa como true

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      // Limpar cache do React Query antes de fazer login
      // Isso garante que dados do usuário anterior não apareçam
      queryClient.clear();
      
      const response = await authService.login({ email, password });

      // Salvar tokens no storage
      console.log('[AuthStore] Saving tokens to storage...');
      await storageService.setItem("accessToken", response.accessToken);
      await storageService.setItem("refreshToken", response.refreshToken);
      console.log('[AuthStore] Tokens saved successfully');

      set({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      // Limpar cache do React Query antes de fazer registro
      queryClient.clear();
      
      const response = await authService.register({ name, email, password });

      // Note: Backend currently does not return tokens on register. User must login afterwards.
      // console.log("[AuthStore] User registered:", response);

      // set({
      //   user: response.user,
      //   isAuthenticated: false, // Wait for explicit login
      //   isLoading: false,
      // });
      return response;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      // Limpar cache do React Query ao fazer logout
      // Isso remove todos os dados em cache, incluindo as contas do usuário
      queryClient.clear();
      
      await authService.logout();
      await storageService.deleteItem("accessToken");
      await storageService.deleteItem("refreshToken");

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  },

  loadTokens: async () => {
    try {
      const accessToken = await storageService.getItem("accessToken");
      const refreshToken = await storageService.getItem("refreshToken");

      console.log('[AuthStore] loadTokens - accessToken:', accessToken ? "Found" : "Missing");
      console.log('[AuthStore] loadTokens - refreshToken:', refreshToken ? "Found" : "Missing");

      if (accessToken && refreshToken) {
        // Tentar buscar dados do usuário
        try {
          console.log('[AuthStore] Fetching user profile...');
          const user = await authService.getProfile();
          console.log('[AuthStore] User profile fetched successfully');

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (profileError: any) {
          console.error('[AuthStore] Failed to fetch profile:', profileError);

          // Se o erro for 401 (Unauthorized), significa que o token é inválido
          if (profileError.response?.status === 401 || profileError.message?.includes('401')) {
            console.log('[AuthStore] Profile fetch returned 401, clearing tokens');
            await get().logout(); // Garante que limpamos tudo
            return; // Interrompe aqui, mantendo estado de deslogado
          }

          // Para erros de rede (sem resposta do servidor), manter tokens mas não autenticar
          // Isso evita problemas quando o servidor está temporariamente indisponível
          const isNetworkError = !profileError.response || 
                                 profileError.code === 'ECONNABORTED' ||
                                 profileError.message?.includes('Network') ||
                                 profileError.message?.includes('timeout');

          if (isNetworkError) {
            console.log('[AuthStore] Network error while fetching profile, keeping tokens but not authenticating');
            set({
              user: null,
              accessToken,
              refreshToken,
              isAuthenticated: false, // Não autenticar se não conseguir validar
              isLoading: false,
            });
            return;
          }

          // Para outros erros (ex: 500), tentar novamente após um delay
          // ou manter tokens mas não autenticar
          console.log('[AuthStore] Profile fetch failed with server error, keeping tokens but not authenticating');
          set({
            user: null,
            accessToken,
            refreshToken,
            isAuthenticated: false, // Não autenticar se não conseguir validar
            isLoading: false,
          });
        }
      } else {
        console.log('[AuthStore] No tokens found, user not authenticated');
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch (error) {
      console.error("Erro ao carregar tokens:", error);
      // Se falhar, limpar tokens
      try {
        await storageService.deleteItem("accessToken");
        await storageService.deleteItem("refreshToken");
      } catch { }
      set({ isLoading: false, isAuthenticated: false });
    }
  },
}));

// Configurar callback de logout na API
import { apiService } from "../services/api.service";
apiService.setUnauthorizedCallback(() => {
  useAuthStore.getState().logout();
});
