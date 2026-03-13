// mobile/services/api.service.ts

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { storageService } from './storage.service';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Configurações de retry
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 segundo inicial
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Status codes que devem ser retentados (incluindo 429)
  retryableErrors: ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'ERR_NETWORK'],
};

// Função de delay com backoff exponencial
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class ApiService {
  private api: AxiosInstance;
  private onUnauthorized: () => void = () => { };
  private activeBaseURL: string;
  private refreshPromise: Promise<string | null> | null = null;

  private parseExpoHost(): string | null {
    const hostUri =
      (Constants as any)?.expoConfig?.hostUri ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost;

    if (!hostUri || typeof hostUri !== 'string') {
      return null;
    }

    const host = hostUri.split(':')[0]?.trim();
    return host || null;
  }

  private getCandidateBaseUrls(): string[] {
    const urls = new Set<string>();

    if (API_URL) {
      urls.add(API_URL);
    }

    const expoHost = this.parseExpoHost();
    if (expoHost) {
      urls.add(`http://${expoHost}:3000`);
    }

    // Hosts comuns em emuladores/simuladores
    urls.add('http://10.0.2.2:3000');
    urls.add('http://127.0.0.1:3000');
    urls.add('http://localhost:3000');

    return Array.from(urls).map((url) => url.replace(/\/$/, ''));
  }

  private async probeBaseUrl(baseUrl: string, timeoutMs: number = 2000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async tryRecoverBaseUrl(originalRequestUrl?: string): Promise<boolean> {
    const candidates = this
      .getCandidateBaseUrls()
      .filter((url) => url !== this.activeBaseURL);

    for (const candidate of candidates) {
      const isReachable = await this.probeBaseUrl(candidate);
      if (!isReachable) {
        continue;
      }

      this.activeBaseURL = candidate;
      this.api.defaults.baseURL = candidate;
      console.warn('[API] Base URL atualizada automaticamente após erro de rede:', {
        previous: API_URL,
        current: candidate,
        request: originalRequestUrl,
      });
      return true;
    }

    return false;
  }

  constructor() {
    this.activeBaseURL = API_URL;
    console.log('[API] Using API_URL:', this.activeBaseURL);

    this.api = axios.create({
      baseURL: this.activeBaseURL,
      timeout: 10000,
    });

    // Interceptor para adicionar token
    this.api.interceptors.request.use(
      async (config) => {
        // Evita Content-Type incorreto em multipart/form-data no React Native.
        // O runtime deve definir automaticamente o boundary.
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
          const headers = config.headers as any;

          if (headers?.set) {
            headers.set('Content-Type', undefined);
            headers.set('content-type', undefined);
          } else if (headers) {
            delete headers['Content-Type'];
            delete headers['content-type'];
          }
        }

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

        // Retry para Network Errors (sem resposta do servidor)
        if (!error.response && error.message === 'Network Error') {
          if (!originalRequest?._hostRecoveryAttempted) {
            originalRequest._hostRecoveryAttempted = true;
            const switched = await this.tryRecoverBaseUrl(originalRequest?.url);

            if (switched) {
              originalRequest.baseURL = this.activeBaseURL;
              console.log('[API] Retrying request with recovered baseURL...');
              return this.api(originalRequest);
            }
          }

          const retryCount = originalRequest._networkRetryCount || 0;
          
          if (retryCount < RETRY_CONFIG.maxRetries) {
            originalRequest._networkRetryCount = retryCount + 1;
            
            // Backoff exponencial: 1s, 2s, 4s
            const waitTime = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount);
            console.log(`[API] Network error. Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
            
            await delay(waitTime);
            return this.api(originalRequest);
          } else {
            console.error("[API] Max retries reached for network error");
          }
        }

        // Retry para erros 429 (Too Many Requests)
        if (error.response?.status === 429) {
          const retryCount = originalRequest._retryCount || 0;
          
          if (retryCount < RETRY_CONFIG.maxRetries) {
            originalRequest._retryCount = retryCount + 1;
            
            // Backoff exponencial: 2s, 4s, 8s
            const waitTime = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount);
            console.log(`[API] Rate limited. Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
            
            await delay(waitTime);
            return this.api(originalRequest);
          } else {
            console.error("[API] Max retries reached for rate limit");
          }
        }

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

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshToken = await storageService.getItem('refreshToken');

        if (!refreshToken) {
          await this.handleLogout();
          return null;
        }

        const candidates = [this.activeBaseURL, ...this.getCandidateBaseUrls()]
          .filter((url, index, arr) => !!url && arr.indexOf(url) === index);

        for (const candidate of candidates) {
          try {
            const response = await axios.post(`${candidate}/auth/refresh`, { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = response.data;

            await storageService.setItem('accessToken', accessToken);
            if (newRefreshToken) {
              await storageService.setItem('refreshToken', newRefreshToken);
            }

            this.activeBaseURL = candidate;
            this.api.defaults.baseURL = candidate;

            return accessToken;
          } catch {
            continue;
          }
        }

        await this.handleLogout();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async recoverBaseUrlOnNetworkError(originalRequestUrl?: string): Promise<boolean> {
    return this.tryRecoverBaseUrl(originalRequestUrl);
  }

  setUnauthorizedCallback(callback: () => void) {
    this.onUnauthorized = callback;
  }

  getApi() {
    return this.api;
  }

  getCurrentBaseUrl() {
    return this.activeBaseURL;
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