import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import LogoHorizontal from '../../assets/images/logo-horizontal.svg';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: '#000',
      tabBarInactiveTintColor: '#0009',
      headerTitleAlign: 'center',
      headerTitle: () => <LogoHorizontal />
    }}>
      <Tabs.Screen name="(create)" options={{
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="camera-outline" size={24} color={color} />,
        tabBarLabel: 'Scanner',
      }} />
      <Tabs.Screen name="(bills)" options={{
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="invoice-text-clock-outline" size={24} color={color} />,
        tabBarLabel: 'Contas',
      }} />
      <Tabs.Screen name="profile" options={{
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="account-outline" size={24} color={color} />,
        tabBarLabel: 'Perfil'
      }} />
    </Tabs>
  );
}