// mobile/app/_layout.tsx

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

// Previne que a splash screen suma automaticamente
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Esconde a splash screen após 1 segundo
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 1000);
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}