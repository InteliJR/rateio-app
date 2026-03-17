import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { userService } from "../../services/user.service";
import { API_URL } from "../../services/api.service";
import { useTheme } from "../../contexts/ThemeContext";

export default function SecurityScreen() {
  const { colors, getFontSize } = useTheme();
  const router = useRouter();
  const [userName, setUserName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  React.useEffect(() => {
    loadUserData();
  }, []);

  const buildAvatarUrl = (rawUrl: string | null | undefined): string | null => {
    if (!rawUrl) return null;

    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      // Adicionar timestamp para evitar cache
      const separator = rawUrl.includes("?") ? "&" : "?";
      return `${rawUrl}${separator}t=${Date.now()}`;
    }

    // Adicionar timestamp para evitar cache
    return `${API_URL}${rawUrl}?t=${Date.now()}`;
  };

  const loadUserData = async () => {
    try {
      // Tentar buscar do backend primeiro
      const profile = await userService.getProfile();
      setUserName(profile.name);
      setAvatarUrl(buildAvatarUrl(profile.avatarUrl));

      // Atualizar AsyncStorage para fallback
      await AsyncStorage.setItem("userName", profile.name);
    } catch (error) {
      console.error("Erro ao carregar dados do usuário:", error);

      // Fallback para AsyncStorage se API falhar
      try {
        const name = await AsyncStorage.getItem("userName");
        if (name) setUserName(name);
      } catch (storageError) {
        console.error("Erro ao carregar nome do AsyncStorage:", storageError);
      }
    }
  };

  const openPasswordModal = () => {
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSavePassword = async () => {
    // Validações
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Erro", "Todos os campos são obrigatórios");
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert("Erro", "A nova senha deve ter no mínimo 8 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Erro", "As senhas não coincidem");
      return;
    }

    try {
      setLoading(true);
      await userService.updateProfile({ password: newPassword });
      Alert.alert("Sucesso", "Senha alterada com sucesso!");
      closePasswordModal();
    } catch (error: any) {
      console.error("Erro ao alterar senha:", error);
      const errorMessage =
        error.response?.data?.message || "Não foi possível alterar a senha";
      Alert.alert("Erro", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back Button */}
      <TouchableOpacity
        onPress={() => router.push("/(tabs)/profile")}
        style={[styles.backButton, { backgroundColor: colors.cardBackground }]}
      >
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[
                  styles.avatarImage,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.primary,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <Ionicons name="person" size={60} color={colors.accent} />
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
        </View>

        {/* Security Options */}
        <View
          style={[
            styles.optionsContainer,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor: colors.divider,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.optionItem,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={openPasswordModal}
          >
            <Text
              style={[
                styles.optionText,
                { color: colors.text, fontSize: getFontSize(16) },
              ]}
            >
              Alterar Senha
            </Text>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colors.secondaryText}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closePasswordModal}
      >
        <View
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: colors.divider },
              ]}
            >
              <TouchableOpacity onPress={closePasswordModal}>
                <Text
                  style={[
                    styles.modalCancel,
                    { color: colors.error, fontSize: getFontSize(16) },
                  ]}
                >
                  Cancelar
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.text, fontSize: getFontSize(18) },
                ]}
              >
                Alterar Senha
              </Text>
              <TouchableOpacity onPress={handleSavePassword} disabled={loading}>
                <Text
                  style={[
                    styles.modalSave,
                    { color: colors.primary, fontSize: getFontSize(16) },
                    loading && styles.modalSaveDisabled,
                  ]}
                >
                  {loading ? "..." : "Salvar"}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Senha Atual */}
              <View style={styles.inputGroup}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: colors.text, fontSize: getFontSize(14) },
                  ]}
                >
                  Senha Atual
                </Text>
                <View
                  style={[
                    styles.passwordContainer,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Digite sua senha atual"
                    placeholderTextColor={colors.placeholderText}
                    secureTextEntry={!showCurrentPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showCurrentPassword ? "eye-off" : "eye"}
                      size={20}
                      color={colors.secondaryText}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Nova Senha */}
              <View style={styles.inputGroup}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: colors.text, fontSize: getFontSize(14) },
                  ]}
                >
                  Nova Senha
                </Text>
                <View
                  style={[
                    styles.passwordContainer,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor={colors.placeholderText}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showNewPassword ? "eye-off" : "eye"}
                      size={20}
                      color={colors.secondaryText}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirmar Senha */}
              <View style={styles.inputGroup}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: colors.text, fontSize: getFontSize(14) },
                  ]}
                >
                  Confirmar Nova Senha
                </Text>
                <View
                  style={[
                    styles.passwordContainer,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Digite novamente a nova senha"
                    placeholderTextColor={colors.placeholderText}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showConfirmPassword ? "eye-off" : "eye"}
                      size={20}
                      color={colors.secondaryText}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  backButton: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 40,
    paddingTop: 60,
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
  },
  optionsContainer: {
    paddingHorizontal: 20,
    gap: 1,
    backgroundColor: "#F0F0F0",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E0E0E0",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: "#FFF",
  },
  optionText: {
    fontSize: 16,
    color: "#333",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalCancel: {
    fontSize: 16,
    color: "#666",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  modalSave: {
    fontSize: 16,
    color: "#7B2CBF",
    fontWeight: "600",
  },
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
    marginBottom: 8,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  eyeButton: {
    paddingHorizontal: 16,
  },
});
