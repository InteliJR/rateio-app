import { Stack } from 'expo-router';

export default function CreateLayout() {
  return (
    <Stack initialRouteName='new' screenOptions={{ headerShown: false }}>
      <Stack.Screen name="new" />
      <Stack.Screen name="participants" />
      <Stack.Screen name="camera" />
    </Stack>
  );
}
