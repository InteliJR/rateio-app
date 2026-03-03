import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { userService } from "../../services/user.service";
import { API_URL } from "../../services/api.service";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../contexts/ThemeContext";

type EditField = "name" | "email" | null;

export default function EditProfileScreen() {
  const { colors, getFontSize } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [editingField, setEditingField] = useState<EditField>(null);
  const [tempValue, setTempValue] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const buildAvatarUrl = (rawUrl: string | null | undefined): string | null => {
    if (!rawUrl) return null;

    // Se o backend já devolve uma URL absoluta (ex: S3), usamos como está
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      // Adicionar timestamp para evitar cache
      const separator = rawUrl.includes('?') ? '&' : '?';
      return `${rawUrl}${separator}t=${Date.now()}`;
    }

    // Caso seja uma URL relativa (ex: /uploads/avatars/...), prefixar com a base da API
    // Adicionar timestamp para evitar cache
    return `${API_URL}${rawUrl}?t=${Date.now()}`;
  };

  const loadUserData = async () => {
    try {
      setInitialLoading(true);
      const profile = await userService.getProfile();
      setName(profile.name);
      setEmail(profile.email);
      setCreatedAt(profile.createdAt);

      // Construir URL completa do avatar (S3 ou local)
      setAvatarUrl(buildAvatarUrl(profile.avatarUrl));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      Alert.alert("Erro", "Não foi possível carregar seus dados");
    } finally {
      setInitialLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permissão necessária",
        "Precisamos de permissão para acessar suas fotos.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    setUploadingAvatar(true);
    try {
      const updatedProfile = await userService.uploadAvatar(uri);
      console.log("[EDIT] Upload response:", updatedProfile);
      console.log("[EDIT] Avatar URL from backend:", updatedProfile.avatarUrl);

      // Construir URL completa do avatar (S3 ou local)
      const fullAvatarUrl = buildAvatarUrl(updatedProfile.avatarUrl);
      console.log("[EDIT] Full avatar URL:", fullAvatarUrl);
      setAvatarUrl(fullAvatarUrl);

      Alert.alert("Sucesso", "Foto de perfil atualizada com sucesso!");
    } catch (error) {
      console.error("Erro ao fazer upload da imagem:", error);
      Alert.alert("Erro", "Não foi possível atualizar a foto de perfil.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openEditModal = (field: EditField, currentValue: string) => {
    setEditingField(field);
    setTempValue(currentValue);
  };

  const closeEditModal = () => {
    setEditingField(null);
    setTempValue("");
  };

  const saveField = async () => {
    if (!tempValue.trim()) {
      Alert.alert("Erro", "Campo não pode estar vazio");
      return;
    }

    // Email não deve ser editável
    if (editingField === "email") {
      Alert.alert("Atenção", "O email não pode ser alterado");
      return;
    }

    try {
      setLoading(true);

      // Atualizar via API
      if (editingField === "name") {
        await userService.updateProfile({ name: tempValue });
        setName(tempValue);
        await AsyncStorage.setItem("userName", tempValue);
      }

      closeEditModal();
      Alert.alert("Sucesso", "Alteração salva com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      Alert.alert("Erro", "Não foi possível salvar as alterações");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return "Data indisponível";
    }
  };

  if (initialLoading) {
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
            { color: colors.text, fontSize: getFontSize(16) },
          ]}
        >
          Carregando seus dados...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/profile")}
          style={[
            styles.backButton,
            { backgroundColor: colors.cardBackground },
          ]}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <>
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  onError={(e) =>
                    console.error(
                      "[EDIT] Image load error:",
                      e.nativeEvent.error,
                    )
                  }
                  onLoad={() =>
                    console.log("[EDIT] Image loaded successfully:", avatarUrl)
                  }
                />
              </>
            ) : (
              <View
                style={[styles.avatar, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="person" size={60} color={colors.accent} />
              </View>
            )}
            <TouchableOpacity
              style={[styles.cameraButton, { backgroundColor: colors.primary }]}
              onPress={pickImage}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="camera" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.changePhotoText,
              { color: colors.text, fontSize: getFontSize(14) },
            ]}
          >
            Alterar Foto
          </Text>
        </View>

        {/* Clickable Fields */}
        <View style={styles.fieldsList}>
          {/* Nome */}
          <TouchableOpacity
            style={[
              styles.fieldRow,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.divider,
              },
            ]}
            onPress={() => openEditModal("name", name)}
          >
            <View style={styles.fieldContent}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: colors.secondaryText, fontSize: getFontSize(14) },
                ]}
              >
                Nome
              </Text>
              <Text
                style={[
                  styles.fieldValue,
                  { color: colors.text, fontSize: getFontSize(16) },
                ]}
              >
                {name || "Não informado"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.secondaryText}
            />
          </TouchableOpacity>

          {/* Email (Somente Leitura) */}
          <View
            style={[
              styles.fieldRow,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.divider,
              },
            ]}
          >
            <View style={styles.fieldContent}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: colors.secondaryText, fontSize: getFontSize(14) },
                ]}
              >
                Email
              </Text>
              <Text
                style={[
                  styles.fieldValue,
                  { color: colors.text, fontSize: getFontSize(16) },
                ]}
              >
                {email || "Não informado"}
              </Text>
            </View>
            <Ionicons
              name="lock-closed"
              size={18}
              color={colors.secondaryText}
            />
          </View>

          {/* Data de Cadastro (Opcional) */}
          {createdAt && (
            <View
              style={[
                styles.fieldRow,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.divider,
                },
              ]}
            >
              <View style={styles.fieldContent}>
                <Text
                  style={[styles.fieldLabel, { color: colors.secondaryText }]}
                >
                  Membro desde
                </Text>
                <Text style={[styles.fieldValue, { color: colors.text }]}>
                  {formatDate(createdAt)}
                </Text>
              </View>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={colors.secondaryText}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editingField !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={closeEditModal}
      >
        <View
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.cardBackground },
            ]}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeEditModal}>
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
                {editingField === "name" ? "Editar Nome" : "Editar Email"}
              </Text>
              <TouchableOpacity onPress={saveField} disabled={loading}>
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

            <View style={styles.modalBody}>
              <Text
                style={[
                  styles.modalLabel,
                  { color: colors.text, fontSize: getFontSize(14) },
                ]}
              >
                {editingField === "name" ? "Nome" : "Email"}
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text,
                  },
                ]}
                value={tempValue}
                onChangeText={setTempValue}
                placeholder={`Digite seu ${
                  editingField === "name" ? "nome" : "email"
                }`}
                placeholderTextColor={colors.placeholderText}
                keyboardType={
                  editingField === "email" ? "email-address" : "default"
                }
                autoCapitalize={editingField === "email" ? "none" : "words"}
                autoFocus
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  avatarSection: {
    alignItems: "center",
    paddingVertical: 32,
    paddingTop: 60,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#7B2CBF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e0e0e0",
  },
  cameraButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#7B2CBF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFF",
  },
  changePhotoText: {
    fontSize: 14,
    color: "#7B2CBF",
    fontWeight: "600",
  },
  fieldsList: {
    paddingHorizontal: 20,
    gap: 1,
    backgroundColor: "#F5F5F5",
    marginTop: 24,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  fieldContent: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  fieldValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "400",
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
    paddingBottom: 40,
    minHeight: 300,
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
    gap: 12,
  },
  modalLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  modalInput: {
    fontSize: 16,
    color: "#333",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});
