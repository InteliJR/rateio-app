// mobile/store/authStore.ts

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
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

      // Salvar tokens no SecureStore
      await SecureStore.setItemAsync("accessToken", response.accessToken);
      await SecureStore.setItemAsync("refreshToken", response.refreshToken);

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

  logout: async () => {
    try {
      await authService.logout();
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");

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
      const accessToken = await SecureStore.getItemAsync("accessToken");
      const refreshToken = await SecureStore.getItemAsync("refreshToken");

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
        await SecureStore.deleteItemAsync("accessToken");
        await SecureStore.deleteItemAsync("refreshToken");
      } catch {}
      set({ isLoading: false, isAuthenticated: false });
    }
  },
}));
