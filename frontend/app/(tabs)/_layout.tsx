import { Tabs } from 'expo-router';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#000', tabBarInactiveTintColor: '#0009' }}>
      <Tabs.Screen name="scanner" options={{
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="camera-outline" size={24} color={color} />,
        tabBarLabel: 'Scanner'
      }} />
      <Tabs.Screen name="accounts" options={{
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="invoice-text-clock-outline" size={24} color={color} />,
        tabBarLabel: 'Contas'
      }} />
      <Tabs.Screen name="profile" options={{
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="account-outline" size={24} color={color} />,
        tabBarLabel: 'Perfil'
      }} />
    </Tabs>
  );
}