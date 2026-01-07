// mobile/services/auth.service.ts

import { api } from "./api.service";
import { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from "../types/auth.types";

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>("/auth/login", data);
    return response.data;
  },

  async getProfile() {
    const response = await api.get("/auth/me");
    return response.data;
  },

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    try {
      console.log("[AuthService] Attempting registration with:", {
        email: data.email,
        name: data.name,
      });
      const response = await api.post<RegisterResponse>("/auth/register", data);
      console.log("[AuthService] Registration successful:", response.data);
      return response.data;
    } catch (error) {
      console.error("[AuthService] Registration failed:", error);
      throw error;
    }
  },

  async logout() {
    // Apenas limpa tokens localmente
    // Se tiver endpoint de logout no backend, chame aqui
    return Promise.resolve();
  },
};
