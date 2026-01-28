// mobile/services/api.service.ts

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { storageService } from './storage.service';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Configurações de retry
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 segundo inicial
  retryableStatuses: [408, 500, 502, 503, 504], // Status codes que devem ser retentados
  retryableErrors: ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'ERR_NETWORK'],
};

// Função de delay com backoff exponencial
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
            await this.handleLogout();
            return Promise.reject(error);
          }

          originalRequest._retry = true;

          try {
            const refreshToken = await storageService.getItem("refreshToken");

            if (!refreshToken) {
              await this.handleLogout();
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

            // Atualizar header da requisição original
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;

            // Retentar requisição original
            return this.api(originalRequest);
          } catch (refreshError) {
            console.error("[API] Token refresh failed:", refreshError);
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

  /**
   * Verifica se o erro é retentável
   */
  private isRetryableError(error: AxiosError): boolean {
    // Erro de rede (sem resposta)
    if (!error.response) {
      const errorCode = (error as any).code;
      return RETRY_CONFIG.retryableErrors.some(code => 
        errorCode === code || error.message?.includes('Network')
      );
    }
    
    // Erro com status retentável
    return RETRY_CONFIG.retryableStatuses.includes(error.response.status);
  }

  /**
   * Executa uma requisição com retry automático
   */
  async requestWithRetry<T>(
    config: AxiosRequestConfig,
    customRetries?: number
  ): Promise<T> {
    const maxRetries = customRetries ?? RETRY_CONFIG.maxRetries;
    let lastError: AxiosError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffDelay = RETRY_CONFIG.retryDelay * Math.pow(2, attempt - 1);
          console.log(`[API] Retry attempt ${attempt}/${maxRetries} after ${backoffDelay}ms...`);
          await delay(backoffDelay);
        }

        const response = await this.api.request<T>(config);
        
        if (attempt > 0) {
          console.log(`[API] Request succeeded on retry attempt ${attempt}`);
        }
        
        return response.data;
      } catch (error) {
        lastError = error as AxiosError;
        
        // Se não é retentável ou é a última tentativa, lança o erro
        if (!this.isRetryableError(lastError) || attempt === maxRetries) {
          if (attempt > 0) {
            console.error(`[API] All ${maxRetries} retry attempts failed`);
          }
          throw error;
        }
        
        console.warn(`[API] Request failed (attempt ${attempt + 1}/${maxRetries + 1}):`, {
          url: config.url,
          error: lastError.message,
          code: (lastError as any).code,
        });
      }
    }

    throw lastError;
  }

  /**
   * POST com retry automático - ideal para uploads
   */
  async postWithRetry<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
    customRetries?: number
  ): Promise<T> {
    return this.requestWithRetry<T>(
      {
        method: 'POST',
        url,
        data,
        ...config,
      },
      customRetries
    );
  }
}

export const apiService = new ApiService();
export const api = apiService.getApi();