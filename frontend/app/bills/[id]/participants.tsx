import React, { useState, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import Logo from "@/assets/images/logo.svg";
import participantsService from "@/services/participants.service";

// Habilitar LayoutAnimation no Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ParticipantsNamesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const billId = params.id as string;

  // participantCount pode vir dos params ou usar um valor padrão
  const participantCount = params.participantCount
    ? parseInt(params.participantCount as string, 10)
    : 5;

  // Estado para o input de adicionar novo nome
  const [newName, setNewName] = useState("");

  // Estado para a lista de participantes pré-gerados
  const [participants, setParticipants] = useState<string[]>(
    Array(participantCount)
      .fill("")
      .map((_, index) => `Nome Sobrenome ${index + 1}`)
  );

  // Refs para auto-foco nos inputs
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Estados de loading e erro
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função para adicionar novo participante
  const handleAddParticipant = () => {
    const trimmedName = newName.trim();

    // Validação: não adicionar nomes vazios
    if (!trimmedName) {
      return;
    }

    // Procurar o primeiro campo vazio na lista
    const emptyIndex = participants.findIndex(
      (participant) =>
        !participant.trim() || participant.startsWith("Nome Sobrenome")
    );

    if (emptyIndex !== -1) {
      // Preencher o próximo campo vazio
      const newParticipants = [...participants];
      newParticipants[emptyIndex] = trimmedName;
      setParticipants(newParticipants);
    } else {
      // Se todos os campos estiverem preenchidos, criar novo campo na lista
      setParticipants([...participants, trimmedName]);
    }

    // Limpar input superior após adicionar
    setNewName("");
  };

  // Função para remover participante
  const handleRemoveParticipant = (index: number) => {
    // Manter pelo menos 1 campo sempre visível
    if (participants.length <= 1) {
      return;
    }

    // Configurar animação suave de remoção
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });

    // Ao clicar no "X" de um campo, remover aquela linha da lista
    // Os índices são reorganizados automaticamente pelo React ao usar filter
    const newParticipants = participants.filter((_, i) => i !== index);
    setParticipants(newParticipants);
  };

  // Função para atualizar nome do participante
  const handleUpdateParticipant = (index: number, value: string) => {
    const newParticipants = [...participants];
    newParticipants[index] = value;
    setParticipants(newParticipants);
  };

  // Função para navegar para a tela de escanear
  const handleScan = async () => {
    if (!billId) {
      Alert.alert("Erro", "ID da conta não encontrado");
      return;
    }

    // Validar que existe pelo menos 1 participante com nome
    const participantsWithNames = participants.filter(
      (p) => p.trim() && !p.startsWith("Nome Sobrenome")
    );

    if (participantsWithNames.length === 0) {
      Alert.alert(
        "Atenção",
        "É necessário ter pelo menos 1 participante com nome preenchido."
      );
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Salvar participantes no backend
      await participantsService.saveParticipants(billId, participants);

      // Navegar para próxima etapa do fluxo passando billId
      // Se a tela /bills/[id]/scanner existir, usar ela, senão usar camera com billId
      router.push({
        pathname: "/(tabs)/camera",
        params: { billId },
      });
    } catch (err: any) {
      const errorMessage = err.message || "Erro ao salvar participantes";
      setError(errorMessage);
      Alert.alert("Erro", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Título */}
        <Text style={styles.title}>Defina os nomes</Text>

        {/* Campo de input no topo com botão OK */}
        <View style={styles.addContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Digite seu nome..."
              placeholderTextColor="#999"
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleAddParticipant}
            />
          </View>
          <TouchableOpacity
            style={styles.okButton}
            onPress={handleAddParticipant}
          >
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>

        {/* Lista de participantes */}
        <View style={styles.participantsList}>
          {participants.map((participant, index) => (
            <TouchableOpacity
              key={index}
              style={styles.participantItem}
              activeOpacity={1}
              onPress={() => inputRefs.current[index]?.focus()}
            >
              <TextInput
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={styles.participantInput}
                value={participant}
                onChangeText={(value) => handleUpdateParticipant(index, value)}
                placeholder={`Nome Sobrenome ${index + 1}`}
                placeholderTextColor="#999"
                editable={true}
              />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveParticipant(index)}
              >
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Botão Escanear no bottom */}
      <View style={styles.bottomContainer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity
          style={[
            styles.scanButton,
            (isLoading || !billId) && styles.scanButtonDisabled,
          ]}
          onPress={handleScan}
          disabled={isLoading || !billId}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFF00" />
          ) : (
            <Text style={styles.scanButtonText}>Escanear</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push("/(tabs)/(create)")}
        >
          <MaterialCommunityIcons
            name="camera-outline"
            size={24}
            color="#81007F"
          />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Scanner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push("/(tabs)/bills")}
        >
          <MaterialCommunityIcons
            name="invoice-text-clock-outline"
            size={24}
            color="#0009"
          />
          <Text style={styles.navLabel}>Contas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push("/(tabs)/profile")}
        >
          <MaterialCommunityIcons
            name="account-outline"
            size={24}
            color="#0009"
          />
          <Text style={styles.navLabel}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 180, // Espaço para o botão fixo e bottom navigation
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 8,
  },
  logoText: {
    fontSize: 18,
    color: "#81007F",
  },
  title: {
    fontSize: 24,
    fontWeight: "400",
    color: "#333",
    marginBottom: 24,
  },
  addContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 32,
    borderWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 32,
    fontSize: 16,
  },
  okButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#81007F",
  },
  okButtonText: {
    color: "#81007F",
    fontSize: 16,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  participantsList: {
    gap: 12,
  },
  participantItem: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 12,
    gap: 12,
  },
  participantInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    paddingVertical: 8,
  },
  removeButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomContainer: {
    position: "absolute",
    bottom: 80, // Espaço para a bottom navigation
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 12,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  scanButton: {
    backgroundColor: "#81007F",
    paddingVertical: 10,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  scanButtonText: {
    color: "#FFFF00",
    fontSize: 24,
    lineHeight: 24,
    textAlignVertical: "center",
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: "#d00",
    fontSize: 14,
    marginBottom: 8,
    textAlign: "center",
  },
  bottomNavigation: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  navLabel: {
    fontSize: 12,
    marginTop: 4,
    color: "#0009",
  },
  navLabelActive: {
    color: "#81007F",
    fontWeight: "600",
  },
});
