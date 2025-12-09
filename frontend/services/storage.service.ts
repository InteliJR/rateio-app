// services/storage.service.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Serviço de armazenamento que funciona em todas as plataformas
 * - Mobile (iOS/Android): Usa SecureStore
 * - Web: Usa localStorage
 */
class StorageService {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('[Storage] Error setting item on web:', error);
        throw error;
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.error('[Storage] Error getting item on web:', error);
        return null;
      }
    } else {
      return await SecureStore.getItemAsync(key);
    }
  }

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('[Storage] Error deleting item on web:', error);
        throw error;
      }
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  }
}

export const storageService = new StorageService();
