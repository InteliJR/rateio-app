// mobile/app/index.tsx

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../../frontend/store/authStore';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, loadTokens } = useAuthStore();

  useEffect(() => {
    // Carrega os tokens ao montar o componente
    const initAuth = async () => {
      await loadTokens();
    };
    initAuth();
  }, []);

  useEffect(() => {
    // Só redireciona quando terminar de carregar
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [isAuthenticated, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});