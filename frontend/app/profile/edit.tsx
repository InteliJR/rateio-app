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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

type EditField = "name" | "birthDate" | "email" | null;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [editingField, setEditingField] = useState<EditField>(null);
  const [tempValue, setTempValue] = useState("");

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setInitialLoading(true);
      const userName = await AsyncStorage.getItem("userName");
      const userEmail = await AsyncStorage.getItem("userEmail");
      const userBirthDate = await AsyncStorage.getItem("userBirthDate");

      if (userName) setName(userName);
      if (userEmail) setEmail(userEmail);
      if (userBirthDate) setBirthDate(userBirthDate);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      Alert.alert("Erro", "Não foi possível carregar seus dados");
    } finally {
      setInitialLoading(false);
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

  const handleDateChange = (text: string) => {
    // Remove tudo que não é número
    const cleaned = text.replace(/\D/g, "");

    // Aplica a máscara DD/MM/AAAA
    let formatted = cleaned;
    if (cleaned.length >= 2) {
      formatted = cleaned.slice(0, 2) + "/" + cleaned.slice(2);
    }
    if (cleaned.length >= 4) {
      formatted =
        cleaned.slice(0, 2) +
        "/" +
        cleaned.slice(2, 4) +
        "/" +
        cleaned.slice(4, 8);
    }

    setTempValue(formatted);
  };

  const saveField = async () => {
    if (!tempValue.trim()) {
      Alert.alert("Erro", "Campo não pode estar vazio");
      return;
    }

    // Validações específicas
    if (editingField === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(tempValue)) {
        Alert.alert("Erro", "Email inválido");
        return;
      }
    }

    if (editingField === "birthDate") {
      // Valida formato DD/MM/AAAA
      const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      if (!dateRegex.test(tempValue)) {
        Alert.alert("Erro", "Data inválida. Use o formato DD/MM/AAAA");
        return;
      }
    }

    try {
      setLoading(true);

      // Atualizar o estado e AsyncStorage
      if (editingField === "name") {
        setName(tempValue);
        await AsyncStorage.setItem("userName", tempValue);
      } else if (editingField === "birthDate") {
        setBirthDate(tempValue);
        await AsyncStorage.setItem("userBirthDate", tempValue);
      } else if (editingField === "email") {
        setEmail(tempValue);
        await AsyncStorage.setItem("userEmail", tempValue);
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

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7B2CBF" />
        <Text style={styles.loadingText}>Carregando seus dados...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Back Button */}
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/profile")}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={60} color="#FFF" />
            </View>
            <TouchableOpacity style={styles.cameraButton}>
              <Ionicons name="camera" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.changePhotoText}>Alterar Foto</Text>
        </View>

        {/* Clickable Fields */}
        <View style={styles.fieldsList}>
          {/* Nome */}
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => openEditModal("name", name)}
          >
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Nome</Text>
              <Text style={styles.fieldValue}>{name || "Não informado"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          {/* Data de Nascimento */}
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => openEditModal("birthDate", birthDate)}
          >
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Data de Nascimento</Text>
              <Text style={styles.fieldValue}>
                {birthDate || "Não informado"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          {/* Email */}
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => openEditModal("email", email)}
          >
            <View style={styles.fieldContent}>
              <Text style={styles.fieldLabel}>Email</Text>
              <Text style={styles.fieldValue}>{email || "Não informado"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editingField !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeEditModal}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingField === "name"
                  ? "Editar Nome"
                  : editingField === "birthDate"
                  ? "Editar Data de Nascimento"
                  : "Editar Email"}
              </Text>
              <TouchableOpacity onPress={saveField} disabled={loading}>
                <Text
                  style={[
                    styles.modalSave,
                    loading && styles.modalSaveDisabled,
                  ]}
                >
                  {loading ? "..." : "Salvar"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>
                {editingField === "name"
                  ? "Nome"
                  : editingField === "birthDate"
                  ? "Data de Nascimento"
                  : "Email"}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={tempValue}
                onChangeText={
                  editingField === "birthDate" ? handleDateChange : setTempValue
                }
                placeholder={
                  editingField === "birthDate"
                    ? "DD/MM/AAAA"
                    : `Digite seu ${editingField === "name" ? "nome" : "email"}`
                }
                placeholderTextColor="#999"
                keyboardType={
                  editingField === "email"
                    ? "email-address"
                    : editingField === "birthDate"
                    ? "numeric"
                    : "default"
                }
                autoCapitalize={editingField === "email" ? "none" : "words"}
                maxLength={editingField === "birthDate" ? 10 : undefined}
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
