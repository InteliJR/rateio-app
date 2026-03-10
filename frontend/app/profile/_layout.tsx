import React from "react";
import { Stack } from "expo-router";
import LogoHorizontal from "../../assets/images/logo-horizontal.svg";
import { useTheme } from "../../contexts/ThemeContext";

export default function ProfileLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerTitle: () => <LogoHorizontal />,
        headerStyle: { backgroundColor: colors.background },
        // Remover botão de voltar do header - usamos os botões customizados nas telas
        headerBackVisible: false,
        headerLeft: () => null,
      }}
    />
  );
}
