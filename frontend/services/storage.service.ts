// services/storage.service.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Serviço de armazenamento seguro que funciona em todas as plataformas
 * - Mobile (iOS/Android): Usa SecureStore
 * - Web: Usa localStorage como fallback
 */
class StorageService {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Web: usar localStorage
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('[Storage] Error setting item on web:', error);
        throw error;
      }
    } else {
      // Mobile: usar SecureStore
      await SecureStore.setItemAsync(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      // Web: usar localStorage
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.error('[Storage] Error getting item on web:', error);
        return null;
      }
    } else {
      // Mobile: usar SecureStore
      return await SecureStore.getItemAsync(key);
    }
  }

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Web: usar localStorage
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('[Storage] Error deleting item on web:', error);
        throw error;
      }
    } else {
      // Mobile: usar SecureStore
      await SecureStore.deleteItemAsync(key);
    }
  }
}

export const storageService = new StorageService();
