// mobile/services/api.service.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import { storageService } from './storage.service';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

class ApiService {
  private api: AxiosInstance;
  private onUnauthorized: () => void = () => { };

  constructor() {
    console.log('[API] Using API_URL:', API_URL);
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Interceptor para adicionar token
    this.api.interceptors.request.use(
      async (config) => {
        // Verificar se é endpoint público
        const isPublicEndpoint =
          config.url?.includes("/auth/login") ||
          config.url?.includes("/auth/register");

        // Apenas tentar recuperar token se for um endpoint privado
        if (!isPublicEndpoint) {
          const token = await storageService.getItem("accessToken");
          console.log(
            "[API] Token from SecureStore:",
            token ? "Found" : "Missing"
          );
          console.log(
            "[API] Token value:",
            token ? `${token.substring(0, 20)}...` : "none"
          );

          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log("[API] Authorization header set with token");
          } else {
            console.log("[API] No token found for protected endpoint");
            this.onUnauthorized();
          }
        } else {
          console.log("[API] Public endpoint - skipping token retrieval");
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Interceptor para tratar erros
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Log detalhado de erros
        console.error("[API] Error occurred:", {
          status: error.response?.status,
          url: originalRequest?.url,
          data: error.response?.data,
          message: error.message,
        });

        // Se erro for 401 e não for uma tentativa de refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          // Se a requisição falhou no endpoint de refresh, fazer logout direto
          if (originalRequest.url?.includes("/auth/refresh")) {
            console.log("[API] Refresh token endpoint failed, logging out");
            await this.handleLogout();
            return Promise.reject(error);
          }

          // Evitar múltiplas tentativas simultâneas de refresh
          if ((this as any)._isRefreshing) {
            console.log("[API] Token refresh already in progress, waiting...");
            // Aguardar o refresh atual terminar
            return new Promise(async (resolve, reject) => {
              const maxWait = 5000; // 5 segundos máximo
              const startTime = Date.now();
              const checkRefresh = setInterval(async () => {
                if (!(this as any)._isRefreshing) {
                  clearInterval(checkRefresh);
                  // Retentar com novo token
                  const newToken = await storageService.getItem("accessToken");
                  if (newToken) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    resolve(this.api(originalRequest));
                  } else {
                    clearInterval(checkRefresh);
                    reject(error);
                  }
                } else if (Date.now() - startTime > maxWait) {
                  clearInterval(checkRefresh);
                  reject(new Error("Token refresh timeout"));
                }
              }, 100);
            });
          }

          originalRequest._retry = true;
          (this as any)._isRefreshing = true;

          try {
            const refreshToken = await storageService.getItem("refreshToken");

            if (!refreshToken) {
              console.log("[API] No refresh token found, logging out");
              await this.handleLogout();
              (this as any)._isRefreshing = false;
              return Promise.reject(error);
            }

            console.log("[API] Attempting to refresh token...");

            // Fazer chamada de refresh diretamente com axios (para evitar loop do interceptor)
            const response = await axios.post(`${API_URL}/auth/refresh`, {
              refreshToken,
            });

            const { accessToken, refreshToken: newRefreshToken } =
              response.data;

            // Salvar novos tokens
            await storageService.setItem("accessToken", accessToken);
            if (newRefreshToken) {
              await storageService.setItem("refreshToken", newRefreshToken);
            }

            console.log("[API] Token refreshed successfully");

            // Marcar refresh como completo
            (this as any)._isRefreshing = false;

            // Atualizar header da requisição original
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;

            // Retentar requisição original
            return this.api(originalRequest);
          } catch (refreshError) {
            console.error("[API] Token refresh failed:", refreshError);
            (this as any)._isRefreshing = false;
            await this.handleLogout();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async handleLogout() {
    await storageService.deleteItem('accessToken');
    await storageService.deleteItem('refreshToken');
    this.onUnauthorized();
  }

  setUnauthorizedCallback(callback: () => void) {
    this.onUnauthorized = callback;
  }

  getApi() {
    return this.api;
  }
}

export const apiService = new ApiService();
export const api = apiService.getApi();