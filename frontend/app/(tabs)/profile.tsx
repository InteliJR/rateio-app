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
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../../services/auth.service";
import { userService } from "../../services/user.service";
import { API_URL } from "../../services/api.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../contexts/ThemeContext";

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, getFontSize } = useTheme();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref para evitar chamadas duplicadas
  const lastLoadTime = React.useRef<number>(0);
  const MIN_LOAD_INTERVAL = 5000; // 5 segundos entre carregamentos

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      // Só carregar se passou tempo suficiente desde última chamada
      if (now - lastLoadTime.current > MIN_LOAD_INTERVAL) {
        lastLoadTime.current = now;
        loadUserData();
      }
    }, [])
  );

  const buildAvatarUrl = (rawUrl: string | null | undefined): string | null => {
    if (!rawUrl) return null;

    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      // Adicionar timestamp para evitar cache
      const separator = rawUrl.includes('?') ? '&' : '?';
      return `${rawUrl}${separator}t=${Date.now()}`;
    }

    // Adicionar timestamp para evitar cache
    return `${API_URL}${rawUrl}?t=${Date.now()}`;
  };

  const loadUserData = async () => {
    try {
      setLoading(true);
      const profile = await userService.getProfile();
      setUserName(profile.name);
      setUserEmail(profile.email);

      // Construir URL completa do avatar (S3 ou local)
      setUserAvatarUrl(buildAvatarUrl(profile.avatarUrl));

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
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={[
            styles.loadingText,
            { color: colors.textSecondary, fontSize: getFontSize(16) },
          ]}
        >
          Carregando perfil...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          {userAvatarUrl ? (
            <Image source={{ uri: userAvatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={60} color="#FFF" />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.userName,
            { color: colors.text, fontSize: getFontSize(24) },
          ]}
        >
          {userName || "Usuário"}
        </Text>
        {userEmail && (
          <Text
            style={[
              styles.userEmail,
              { color: colors.textTertiary, fontSize: getFontSize(14) },
            ]}
          >
            {userEmail}
          </Text>
        )}
      </View>

      {/* Menu Options */}
      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={[
            styles.menuItem,
            { backgroundColor: colors.card, shadowColor: colors.shadow },
          ]}
          onPress={handleEditProfile}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="pencil-outline" size={24} color={colors.text} />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.text, fontSize: getFontSize(16) },
              ]}
            >
              Editar Perfil
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={24}
            color={colors.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.menuItem,
            { backgroundColor: colors.card, shadowColor: colors.shadow },
          ]}
          onPress={handleSecurity}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons
              name="lock-closed-outline"
              size={24}
              color={colors.text}
            />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.text, fontSize: getFontSize(16) },
              ]}
            >
              Segurança
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={24}
            color={colors.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.menuItem,
            { backgroundColor: colors.card, shadowColor: colors.shadow },
          ]}
          onPress={handleSettings}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="settings-outline" size={24} color={colors.text} />
            <Text
              style={[
                styles.menuItemText,
                { color: colors.text, fontSize: getFontSize(16) },
              ]}
            >
              Configuração
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={24}
            color={colors.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.menuItem,
            { backgroundColor: colors.card, shadowColor: colors.shadow },
          ]}
          onPress={handleLogout}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="log-out-outline" size={24} color="#E53935" />
            <Text
              style={[
                styles.menuItemText,
                styles.logoutText,
                { fontSize: getFontSize(16) },
              ]}
            >
              Logout
            </Text>
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
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e0e0e0",
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
