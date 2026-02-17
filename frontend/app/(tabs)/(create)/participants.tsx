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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import participantsService, {
  Participant,
} from "../../../services/participants.service";
import { useTheme } from "../../../contexts/ThemeContext";

export default function ParticipantsScreen() {
  const { colors } = useTheme();
  const { id, participantCount } = useLocalSearchParams();
  const router = useRouter();

  const initialCount = Number(participantCount) || 0;
  const [nameInput, setNameInput] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Carregar participantes existentes
  useEffect(() => {
    loadParticipants();
  }, [id]);

  const loadParticipants = async () => {
    if (!id || typeof id !== "string") {
      setIsLoading(false);
      return;
    }

    try {
      const data = await participantsService.getParticipantsByBill(id);
      setParticipants(data);
    } catch (error: any) {
      console.error("Erro ao carregar participantes:", error);
      Alert.alert("Erro", "Não foi possível carregar os participantes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateParticipant = async (
    participantId: string,
    newName: string,
  ) => {
    if (!newName.trim()) {
      Alert.alert("Atenção", "Digite um nome válido.");
      return;
    }

    try {
      const updated = await participantsService.updateParticipant(
        participantId,
        newName,
      );
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? updated : p)),
      );
      setNameInput("");
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Não foi possível atualizar o participante.",
      );
    }
  };

  const handleAddOrUpdateNext = () => {
    if (!nameInput.trim()) {
      Alert.alert("Atenção", "Digite um nome.");
      return;
    }

    // Encontrar o primeiro participante com nome padrão "Pessoa X"
    const nextParticipant = participants.find((p) =>
      p.name.startsWith("Pessoa "),
    );

    if (nextParticipant) {
      handleUpdateParticipant(nextParticipant.id, nameInput.trim());
    } else {
      Alert.alert("Atenção", "Todos os participantes já foram nomeados.");
      setNameInput("");
    }
  };

  const handleScan = () => {
    // Permitir continuar mesmo sem nomear todos os participantes
    router.push({
      pathname: "/(tabs)/(create)/camera",
      params: {
        id,
        participants: JSON.stringify(participants.map((p) => p.name)),
      },
    });
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          styles.centerContent,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>
          Carregando participantes...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.text }]}>
          Defina os nomes (
          {participants.filter((p) => !p.name.startsWith("Pessoa ")).length}/
          {participants.length})
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                color: colors.text,
              },
            ]}
            placeholder="Digite o nome do participante..."
            placeholderTextColor={colors.placeholderText}
            value={nameInput}
            onChangeText={setNameInput}
            onSubmitEditing={handleAddOrUpdateNext}
            editable={!isSaving}
          />
          <TouchableOpacity
            style={[
              styles.okButton,
              { backgroundColor: colors.primary },
              isSaving && styles.okButtonDisabled,
            ]}
            onPress={handleAddOrUpdateNext}
            disabled={isSaving}
          >
            <Text style={[styles.okButtonText, { color: colors.accent }]}>
              OK
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {participants.map((participant, index) => (
            <View
              key={participant.id}
              style={[
                styles.participantRow,
                { backgroundColor: colors.cardBackground },
              ]}
            >
              <View style={styles.participantInfo}>
                <Text style={[styles.participantName, { color: colors.text }]}>
                  {participant.name}
                </Text>
                {participant.name.startsWith("Pessoa ") && (
                  <Text
                    style={[
                      styles.participantHint,
                      { color: colors.secondaryText },
                    ]}
                  >
                    Opcional - pode manter esse nome
                  </Text>
                )}
              </View>
              {!participant.name.startsWith("Pessoa ") && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      "Editar Participante",
                      `Deseja editar "${participant.name}"?`,
                      [
                        { text: "Cancelar", style: "cancel" },
                        {
                          text: "Editar",
                          onPress: () => {
                            Alert.prompt(
                              "Editar Nome",
                              "Digite o novo nome:",
                              (text) => {
                                if (text && text.trim()) {
                                  handleUpdateParticipant(participant.id, text);
                                }
                              },
                              "plain-text",
                              participant.name,
                            );
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Ionicons name="pencil" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[
            styles.scanButton,
            { backgroundColor: colors.primary },
            isSaving && styles.scanButtonDisabled,
          ]}
          onPress={handleScan}
          disabled={isSaving}
        >
          <Text style={[styles.scanButtonText, { color: colors.accent }]}>
            Escanear
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    paddingTop: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "500",
    color: "#000",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 24,
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#333",
  },
  okButton: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#81007F",
    justifyContent: "center",
    alignItems: "center",
  },
  okButtonDisabled: {
    opacity: 0.5,
  },
  okButtonText: {
    color: "#81007F",
    fontWeight: "bold",
    fontSize: 14,
  },
  listContainer: {
    marginTop: 8,
  },
  participantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  participantHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: "#fff",
    gap: 12,
  },
  skipButton: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#81007F",
    justifyContent: "center",
    alignItems: "center",
  },
  skipButtonText: {
    color: "#81007F",
    fontSize: 16,
    fontWeight: "500",
  },
  scanButton: {
    backgroundColor: "#81007F",
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  scanButtonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    color: "#FFFF00",
    fontSize: 18,
    fontWeight: "500",
  },
});
