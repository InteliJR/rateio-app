// mobile/services/api.service.ts

import { logger } from '../lib/logger';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { storageService } from './storage.service';

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = (configuredApiUrl || (IS_DEV ? 'http://localhost:3000' : '')).replace(/\/$/, '');

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
    if (IS_DEV && expoHost) {
      urls.add(`http://${expoHost}:3000`);
    }

    if (IS_DEV) {
      // Hosts comuns em emuladores/simuladores
      urls.add('http://10.0.2.2:3000');
      urls.add('http://127.0.0.1:3000');
      urls.add('http://localhost:3000');
    }

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
      logger.warn('[API] Base URL atualizada automaticamente após erro de rede:', {
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
    this.assertProductionApiUrl(this.activeBaseURL);
    logger.debug('[API] Using API_URL:', this.activeBaseURL);

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
          config.url?.includes("/auth/google") ||
          config.url?.includes("/auth/register") ||
          config.url?.includes("/auth/forgot-password") ||
          config.url?.includes("/auth/reset-password");

        // Apenas tentar recuperar token se for um endpoint privado
        if (!isPublicEndpoint) {
          const token = await storageService.getItem("accessToken");
          logger.debug(
            "[API] Protected endpoint token:",
            token ? "Found" : "Missing"
          );

          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            logger.debug("[API] Authorization header set with token");
          } else {
            logger.debug("[API] No token found for protected endpoint");
            this.onUnauthorized();
          }
        } else {
          logger.debug("[API] Public endpoint - skipping token retrieval");
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
        logger.error("[API] Error occurred:", {
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
              logger.debug('[API] Retrying request with recovered baseURL...');
              return this.api(originalRequest);
            }
          }

          const retryCount = originalRequest._networkRetryCount || 0;
          
          if (retryCount < RETRY_CONFIG.maxRetries) {
            originalRequest._networkRetryCount = retryCount + 1;
            
            // Backoff exponencial: 1s, 2s, 4s
            const waitTime = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount);
            logger.debug(`[API] Network error. Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
            
            await delay(waitTime);
            return this.api(originalRequest);
          } else {
            logger.error("[API] Max retries reached for network error");
          }
        }

        // Retry para erros 429 (Too Many Requests)
        if (error.response?.status === 429) {
          const retryCount = originalRequest._retryCount || 0;
          
          if (retryCount < RETRY_CONFIG.maxRetries) {
            originalRequest._retryCount = retryCount + 1;
            
            // Backoff exponencial: 2s, 4s, 8s
            const waitTime = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount);
            logger.debug(`[API] Rate limited. Retrying in ${waitTime}ms... (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
            
            await delay(waitTime);
            return this.api(originalRequest);
          } else {
            logger.error("[API] Max retries reached for rate limit");
          }
        }

        // Se erro for 401 e não for uma tentativa de refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          // Se a requisição falhou no endpoint de refresh, fazer logout direto
          if (originalRequest.url?.includes("/auth/refresh")) {
            logger.debug("[API] Refresh token endpoint failed, logging out");
            await this.handleLogout();
            return Promise.reject(error);
          }

          // Evitar múltiplas tentativas simultâneas de refresh
          if ((this as any)._isRefreshing) {
            logger.debug("[API] Token refresh already in progress, waiting...");
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
            const accessToken = await this.refreshAccessToken();

            if (!accessToken) {
              return Promise.reject(error);
            }

            logger.debug("[API] Token refreshed successfully");
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.api(originalRequest);
          } catch (refreshError) {
            logger.error("[API] Token refresh failed:", refreshError);
            await this.handleLogout();
            return Promise.reject(refreshError);
          } finally {
            (this as any)._isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private assertProductionApiUrl(baseUrl: string) {
    if (IS_DEV) {
      return;
    }

    if (!baseUrl) {
      throw new Error('EXPO_PUBLIC_API_URL deve ser configurada no build de produção.');
    }

    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('EXPO_PUBLIC_API_URL deve ser uma URL válida.');
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '10.0.2.2' ||
      hostname.startsWith('192.168.') ||
      hostname.endsWith('.local');

    if (parsed.protocol !== 'https:' || isLocalHost) {
      throw new Error('EXPO_PUBLIC_API_URL deve apontar para uma URL HTTPS pública no build de produção.');
    }
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
          logger.debug(`[API] Retry attempt ${attempt}/${maxRetries} after ${backoffDelay}ms...`);
          await delay(backoffDelay);
        }

        const response = await this.api.request<T>(config);

        if (attempt > 0) {
          logger.debug(`[API] Request succeeded on retry attempt ${attempt}`);
        }

        return response.data;
      } catch (error) {
        lastError = error as AxiosError;

        // Se não é retentável ou é a última tentativa, lança o erro
        if (!this.isRetryableError(lastError) || attempt === maxRetries) {
          if (attempt > 0) {
            logger.error(`[API] All ${maxRetries} retry attempts failed`);
          }
          throw error;
        }

        logger.warn(`[API] Request failed (attempt ${attempt + 1}/${maxRetries + 1}):`, {
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
