// mobile/services/auth.service.ts

import { api } from "./api.service";
import { LoginRequest, LoginResponse } from "../types/auth.types";

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>("/auth/login", data);
    return response.data;
  },

  async getProfile() {
    const response = await api.get("/auth/me");
    return response.data;
  },

  async logout() {
    // Apenas limpa tokens localmente
    // Se tiver endpoint de logout no backend, chame aqui
    return Promise.resolve();
  },
};
