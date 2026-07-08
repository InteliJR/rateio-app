// mobile/services/auth.service.ts

import { logger } from '../lib/logger';
import { api } from "./api.service";
import {
  LoginRequest,
  LoginResponse,
  GoogleLoginRequest,
  RegisterRequest,
  RegisterResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from "../types/auth.types";

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>("/auth/login", data);
    return response.data;
  },

  async loginWithGoogle(data: GoogleLoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>("/auth/google", data);
    return response.data;
  },

  async getProfile() {
    const response = await api.get("/auth/me");
    return response.data;
  },

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    try {
      logger.debug("[AuthService] Attempting registration with:", {
        email: data.email,
        name: data.name,
      });
      const response = await api.post<RegisterResponse>("/auth/register", data);
      logger.debug("[AuthService] Registration successful");
      return response.data;
    } catch (error) {
      logger.error("[AuthService] Registration failed:", error);
      throw error;
    }
  },

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return Promise.resolve();
    }

    const response = await api.post("/auth/logout", { refreshToken });
    return response.data;
  },

  async forgotPassword(
    data: ForgotPasswordRequest
  ): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>(
      "/auth/forgot-password",
      data
    );
    return response.data;
  },

  async resetPassword(
    data: ResetPasswordRequest
  ): Promise<ResetPasswordResponse> {
    const response = await api.post<ResetPasswordResponse>(
      "/auth/reset-password",
      data
    );
    return response.data;
  },
};
