import { Stack } from 'expo-router';

export default function CreateLayout() {
  return (
    <Stack initialRouteName='camera' screenOptions={{ headerShown: false }}>
      <Stack.Screen name="camera" />
      <Stack.Screen name="new" />
      <Stack.Screen name="participants" />
      <Stack.Screen name="scanned" />
      <Stack.Screen name="split" />
      <Stack.Screen name="summary" />
    </Stack>
  );
}
