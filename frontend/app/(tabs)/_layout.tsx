import { Tabs } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import LogoHorizontal from "../../assets/images/logo-horizontal.svg";
import { useTheme } from "../../contexts/ThemeContext";

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: { backgroundColor: colors.tabBarBackground },
        headerStyle: { backgroundColor: colors.tabBarBackground },
        headerTintColor: colors.text,
        headerTitleAlign: "center",
        headerTitle: () => <LogoHorizontal />,
      }}
    >
      <Tabs.Screen
        name="bills"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="invoice-text-clock-outline"
              size={24}
              color={color}
            />
          ),
          tabBarLabel: "Histórico",
        }}
      />
      <Tabs.Screen
        name="(create)"
        options={{
          href: "/(tabs)/(create)/camera",
          popToTopOnBlur: true,
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="camera-outline"
              size={24}
              color={color}
            />
          ),
          tabBarLabel: "Escanear conta",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="account-outline"
              size={24}
              color={color}
            />
          ),
          tabBarLabel: "Perfil",
        }}
      />
    </Tabs>
  );
}
