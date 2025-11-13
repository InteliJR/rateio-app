// mobile/app/(tabs)/index.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../../frontend/store/authStore";
import { api } from "../../../frontend/services/api.service";

export default function ScannerScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    try {
      const response = await api.get("/health");
      setHealthData(response.data);
    } catch (error) {
      console.error("Erro ao buscar health:", error);
      setHealthData({ error: "Falha ao conectar com o backend" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Sair", "Deseja realmente sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Bem-vindo!</Text>
          <Text style={styles.subtitle}>Você está logado como:</Text>
        </View>

        <View style={styles.userCard}>
          <View style={styles.userInfo}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={styles.value}>{user?.name}</Text>
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{user?.email}</Text>
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.label}>Role:</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user?.role}</Text>
            </View>
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.label}>ID:</Text>
            <Text style={styles.valueSmall}>{user?.id}</Text>
          </View>
        </View>

        <View style={styles.successBox}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>
            Frontend integrado com sucesso ao backend!
          </Text>
        </View>

        <View style={styles.healthCard}>
          <Text style={styles.healthTitle}>🏥 Status do Backend (/health)</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
          ) : (
            <View style={styles.healthContent}>
              <Text style={styles.healthJson}>
                {JSON.stringify(healthData, null, 2)}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sair</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 24,
  },
  header: {
    marginTop: 40,
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  value: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  valueSmall: {
    fontSize: 12,
    color: "#666",
    fontFamily: "monospace",
  },
  roleBadge: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  successBox: {
    backgroundColor: "#d4edda",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#c3e6cb",
  },
  successIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    color: "#155724",
    fontWeight: "500",
  },
  healthCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  healthTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  loader: {
    marginVertical: 20,
  },
  healthContent: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  healthJson: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#495057",
  },
  logoutButton: {
    backgroundColor: "#dc3545",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 40,
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});