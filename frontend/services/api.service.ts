// mobile/services/api.service.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

class ApiService {
  private api: AxiosInstance;
  private onUnauthorized: () => void = () => { };

  constructor() {
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
        const token = await SecureStore.getItemAsync('accessToken');

        // Verificar se é endpoint público
        const isPublicEndpoint = config.url?.includes('/auth/login') || config.url?.includes('/auth/register');

        console.log('[API] Token from SecureStore:', token ? 'Found' : 'Missing');

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('[API] Authorization header set');
        } else {
          console.log('[API] No token found, request will be sent without Authorization header');
          if (!isPublicEndpoint) {
            console.log('[API] Non-public endpoint and no token, triggering unauthorized callback');
            this.onUnauthorized();
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Interceptor para tratar erros
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expirado - fazer logout
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('refreshToken');
          this.onUnauthorized();
        }
        return Promise.reject(error);
      }
    );
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