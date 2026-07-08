// mobile/store/authStore.ts

import { logger } from '../lib/logger';
import { create } from "zustand";
import { storageService } from "../services/storage.service";
import { AuthState } from "../types/auth.types";
import { authService } from "../services/auth.service";
import { userService } from "../services/user.service";
import { queryClient } from "../lib/queryClient";
import { useBillStore } from "./billStore";

const clearLocalSession = async () => {
  await queryClient.cancelQueries();
  queryClient.removeQueries();
  queryClient.clear();
  useBillStore.getState().clearBills();
  await storageService.deleteItem("accessToken");
  await storageService.deleteItem("refreshToken");
  await storageService.deleteItem("userName");
  await storageService.deleteItem("userEmail");
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true, // Começa como true

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      // Limpar COMPLETAMENTE o cache do React Query antes de fazer login
      // Isso garante que dados do usuário anterior não apareçam
      queryClient.cancelQueries(); // Cancela queries pendentes
      queryClient.removeQueries(); // Remove todas as queries do cache
      queryClient.clear(); // Limpa o cache completamente

      // Limpar o store de contas do usuário anterior
      useBillStore.getState().clearBills();

      // Limpar dados de usuário do AsyncStorage anterior
      await storageService.deleteItem("userName");
      await storageService.deleteItem("userEmail");

      const response = await authService.login({ email, password });

      // Salvar tokens no storage
      logger.debug('[AuthStore] Saving tokens to storage...');
      await storageService.setItem("accessToken", response.accessToken);
      await storageService.setItem("refreshToken", response.refreshToken);
      logger.debug('[AuthStore] Tokens saved successfully');

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

  loginWithGoogle: async (idToken: string) => {
    set({ isLoading: true });
    try {
      queryClient.cancelQueries();
      queryClient.removeQueries();
      queryClient.clear();

      useBillStore.getState().clearBills();

      await storageService.deleteItem("userName");
      await storageService.deleteItem("userEmail");

      const response = await authService.loginWithGoogle({ idToken });

      logger.debug('[AuthStore] Saving Google login tokens to storage...');
      await storageService.setItem("accessToken", response.accessToken);
      await storageService.setItem("refreshToken", response.refreshToken);
      logger.debug('[AuthStore] Google login tokens saved successfully');

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
      // Limpar COMPLETAMENTE o cache do React Query antes de fazer registro
      // Isso garante que dados do usuário anterior não apareçam
      queryClient.cancelQueries();
      queryClient.removeQueries();
      queryClient.clear();

      // Limpar o store de contas do usuário anterior
      useBillStore.getState().clearBills();

      // Limpar tokens anteriores para garantir que não há contaminação
      await storageService.deleteItem("accessToken");
      await storageService.deleteItem("refreshToken");
      await storageService.deleteItem("userName");
      await storageService.deleteItem("userEmail");

      const response = await authService.register({ name, email, password });

      // Backend retorna tokens no registro - salvar e autenticar
      if (response.accessToken && response.refreshToken) {
        logger.debug('[AuthStore] Saving tokens from registration...');
        await storageService.setItem("accessToken", response.accessToken);
        await storageService.setItem("refreshToken", response.refreshToken);
        logger.debug('[AuthStore] Registration tokens saved successfully');

        set({
          user: response.user,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        // Fallback caso backend não retorne tokens
        set({ isLoading: false });
      }

      return response;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      const refreshToken = get().refreshToken || await storageService.getItem("refreshToken");

      // Limpar COMPLETAMENTE o cache do React Query ao fazer logout
      queryClient.cancelQueries(); // Cancela queries pendentes
      queryClient.removeQueries(); // Remove todas as queries do cache
      queryClient.clear(); // Limpa o cache completamente

      // Limpar o store de contas
      useBillStore.getState().clearBills();

      await authService.logout(refreshToken || undefined);
      await storageService.deleteItem("accessToken");
      await storageService.deleteItem("refreshToken");

      // Limpar dados de usuário do AsyncStorage
      await storageService.deleteItem("userName");
      await storageService.deleteItem("userEmail");

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      logger.error("Erro ao fazer logout:", error);
      // Mesmo com erro, garantir que os dados locais são limpos
      try {
        queryClient.cancelQueries();
        queryClient.removeQueries();
        queryClient.clear();
        useBillStore.getState().clearBills();
        await storageService.deleteItem("accessToken");
        await storageService.deleteItem("refreshToken");
        await storageService.deleteItem("userName");
        await storageService.deleteItem("userEmail");
      } catch { }

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  deleteAccount: async () => {
    set({ isLoading: true });

    try {
      await userService.deleteAccount();
      await clearLocalSession();

      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      logger.error("Erro ao excluir conta:", error);
      set({ isLoading: false });
      throw error;
    }
  },

  loadTokens: async () => {
    try {
      const accessToken = await storageService.getItem("accessToken");
      const refreshToken = await storageService.getItem("refreshToken");

      logger.debug('[AuthStore] loadTokens - accessToken:', accessToken ? "Found" : "Missing");
      logger.debug('[AuthStore] loadTokens - refreshToken:', refreshToken ? "Found" : "Missing");

      if (accessToken && refreshToken) {
        // Tentar buscar dados do usuário
        try {
          logger.debug('[AuthStore] Fetching user profile...');
          const user = await authService.getProfile();
          logger.debug('[AuthStore] User profile fetched successfully');

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (profileError: any) {
          logger.error('[AuthStore] Failed to fetch profile:', profileError);

          // Se o erro for 401 (Unauthorized), significa que o token é inválido
          if (profileError.response?.status === 401 || profileError.message?.includes('401')) {
            logger.debug('[AuthStore] Profile fetch returned 401, clearing tokens');
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
            logger.debug('[AuthStore] Network error while fetching profile, keeping tokens but not authenticating');
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
          logger.debug('[AuthStore] Profile fetch failed with server error, keeping tokens but not authenticating');
          set({
            user: null,
            accessToken,
            refreshToken,
            isAuthenticated: false, // Não autenticar se não conseguir validar
            isLoading: false,
          });
        }
      } else {
        logger.debug('[AuthStore] No tokens found, user not authenticated');
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch (error) {
      logger.error("Erro ao carregar tokens:", error);
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
