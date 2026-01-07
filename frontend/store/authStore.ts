// mobile/store/authStore.ts

import { create } from "zustand";
import { storageService } from "../services/storage.service";
import { AuthState } from "../types/auth.types";
import { authService } from "../services/auth.service";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true, // Começa como true

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
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
      const response = await authService.register({ name, email, password });

      // Salvar tokens e usuário (o backend retorna tokens na resposta)
      console.log("[AuthStore] Saving registration tokens to storage...");
      await storageService.setItem("accessToken", response.accessToken);
      await storageService.setItem("refreshToken", response.refreshToken);
      console.log("[AuthStore] Registration tokens saved successfully");

      set({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
      });
      return response;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
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

      if (accessToken && refreshToken) {
        // Buscar dados do usuário
        const user = await authService.getProfile();

        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
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
