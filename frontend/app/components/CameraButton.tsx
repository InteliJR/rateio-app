import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

/**
 * Exemplo de botão para abrir a câmera
 * Você pode adicionar este componente em qualquer tela
 */
export default function CameraButton() {
  const router = useRouter();

  const handleOpenCamera = () => {
    router.push("/camera");
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleOpenCamera}>
      <Ionicons name="camera" size={24} color="#FFFFFF" />
      <Text style={styles.buttonText}>Escanear Nota Fiscal</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
