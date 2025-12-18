import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../../services/auth.service";
import { userService } from "../../services/user.service";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function ProfileScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const profile = await userService.getProfile();
      setUserName(profile.name);
      setUserEmail(profile.email);

      // Atualizar AsyncStorage para compatibilidade
      await AsyncStorage.setItem("userName", profile.name);
      await AsyncStorage.setItem("userEmail", profile.email);
    } catch (error) {
      console.error("Erro ao carregar dados do usuário:", error);
      Alert.alert("Erro", "Não foi possível carregar os dados do perfil");

      // Fallback para AsyncStorage
      const name = await AsyncStorage.getItem("userName");
      const email = await AsyncStorage.getItem("userEmail");
      if (name) setUserName(name);
      if (email) setUserEmail(email);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sair", "Deseja realmente sair da sua conta?", [
      {
        text: "Cancelar",
        style: "cancel",
      },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            await authService.logout();
            router.replace("/(auth)/login");
          } catch (error) {
            console.error("Erro ao fazer logout:", error);
            Alert.alert("Erro", "Não foi possível sair. Tente novamente.");
          }
        },
      },
    ]);
  };

  const handleEditProfile = () => {
    router.push("/profile/edit");
  };

  const handleSecurity = () => {
    router.push("/profile/security");
  };

  const handleSettings = () => {
    router.push("/profile/config");
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7B2CBF" />
        <Text style={styles.loadingText}>Carregando perfil...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={60} color="#FFF" />
          </View>
        </View>
        <Text style={styles.userName}>{userName || "Usuário"}</Text>
        {userEmail && <Text style={styles.userEmail}>{userEmail}</Text>}
      </View>

      {/* Menu Options */}
      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="pencil-outline" size={24} color="#333" />
            <Text style={styles.menuItemText}>Editar Perfil</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleSecurity}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="lock-closed-outline" size={24} color="#333" />
            <Text style={styles.menuItemText}>Segurança</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="settings-outline" size={24} color="#333" />
            <Text style={styles.menuItemText}>Configuração</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="log-out-outline" size={24} color="#E53935" />
            <Text style={[styles.menuItemText, styles.logoutText]}>Logout</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  contentContainer: {
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#7B2CBF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  userName: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#999",
  },
  menuContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  logoutText: {
    color: "#E53935",
  },
});
