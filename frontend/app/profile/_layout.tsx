import React from "react";
import { Stack } from "expo-router";
import LogoHorizontal from "../../assets/images/logo-horizontal.svg";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerTitle: () => <LogoHorizontal />,
        // Remover botão de voltar do header - usamos os botões customizados nas telas
        headerBackVisible: false,
        headerLeft: () => null,
      }}
    />
  );
}


