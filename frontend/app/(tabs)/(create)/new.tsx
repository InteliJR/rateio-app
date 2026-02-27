import React, { useState, useRef } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ionicons } from "@expo/vector-icons";
import billService from "../../../services/bill.service";
import { useBillStore } from "../../../store/billStore";
import { NumericInput } from "../../../components/common/NumericInput";

interface INewBillFormData {
  billName?: string;
  serviceRate: string;
  couvertValue?: string;
}

interface ParticipantInput {
  id: number;
  name: string;
}

const newBillSchema = z.object({
  billName: z.string().optional(),
  serviceRate: z
    .string()
    .min(1, "Campo obrigatório")
    .refine(
      (val) => !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 100,
      "A taxa deve ser entre 0% e 100%"
    ),
  couvertValue: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === "" || (!isNaN(Number(val)) && Number(val) >= 0),
      "O valor deve ser um número positivo"
    ),
});

export default function NewBillScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [participants, setParticipants] = useState<ParticipantInput[]>([
    { id: 1, name: "Pessoa 1" },
  ]);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Get store actions
  const { addBill } = useBillStore();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<INewBillFormData>({
    resolver: zodResolver(newBillSchema),
    defaultValues: {
      billName: "",
      serviceRate: "",
      couvertValue: "",
    },
    mode: "onChange",
  });

  const addParticipant = () => {
    const nextId = participants.length + 1;
    setParticipants([...participants, { id: nextId, name: `Pessoa ${nextId}` }]);
  };

  const removeParticipant = (id: number) => {
    if (participants.length <= 1) {
      Alert.alert("Atenção", "É necessário pelo menos 1 participante");
      return;
    }
    setParticipants(participants.filter((p) => p.id !== id));
  };

  const updateParticipantName = (id: number, name: string) => {
    setParticipants(
      participants.map((p) => (p.id === id ? { ...p, name } : p))
    );
  };

  const onSubmit = async (data: INewBillFormData) => {
    if (participants.length === 0) {
      Alert.alert("Atenção", "Adicione pelo menos 1 participante");
      return;
    }

    setIsLoading(true);
    try {
      const participantNames = participants.map((p) => p.name.trim() || `Pessoa ${p.id}`);
      
      const newBill = await billService.createBillSetup({
        participantCount: participants.length,
        billName: data.billName?.trim() || undefined,
        serviceFeePercentage: Number(data.serviceRate),
        coverChargeValue: data.couvertValue && data.couvertValue.trim() !== "" 
          ? Number(data.couvertValue) 
          : undefined,
        coverChargeType: data.couvertValue && data.couvertValue.trim() !== "" 
          ? 'per_person' 
          : undefined,
        participantNames,
      });

      // Add to global store
      addBill(newBill);

      // Ir direto para a câmera
      router.push({
        pathname: "/(tabs)/(create)/camera",
        params: { id: newBill.id },
      });
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Não foi possível criar a conta. Tente novamente."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Seção: Nome da Conta */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nome da conta</Text>
            <Controller
              control={control}
              name="billName"
              render={({ field: { onChange, value, onBlur } }) => (
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Jantar de aniversário (opcional)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  editable={!isLoading}
                />
              )}
            />
          </View>

          {/* Seção: Taxa de Serviço */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Taxa de serviço</Text>

            <Controller
              control={control}
              name="serviceRate"
              render={({ field: { onChange, value, onBlur } }) => (
                <NumericInput
                  label="Porcentagem da taxa de serviço"
                  placeholder="Ex: 10"
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  editable={!isLoading}
                  error={errors.serviceRate?.message}
                  min={0}
                  max={100}
                  suffix="%"
                />
              )}
            />
          </View>

          {/* Seção: Couvert */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Couvert (opcional)</Text>

            <Controller
              control={control}
              name="couvertValue"
              render={({ field: { onChange, value, onBlur } }) => (
                <NumericInput
                  label="Valor por pessoa"
                  placeholder="Ex: 20.00"
                  value={value ?? ""}
                  onChange={onChange}
                  onBlur={onBlur}
                  editable={!isLoading}
                  error={errors.couvertValue?.message}
                  min={0}
                  prefix="R$"
                  allowDecimal={true}
                />
              )}
            />
          </View>

          {/* Seção: Participantes */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Participantes ({participants.length})
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={addParticipant}
                disabled={isLoading}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.participantsList}>
              {participants.map((participant) => (
                <View key={participant.id} style={styles.participantRow}>
                  {editingId === participant.id ? (
                    <TextInput
                      style={styles.participantInput}
                      value={participant.name}
                      onChangeText={(text) => updateParticipantName(participant.id, text)}
                      onBlur={() => setEditingId(null)}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollToEnd({ animated: true });
                        }, 100);
                      }}
                      autoFocus
                      selectTextOnFocus
                      editable={!isLoading}
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.participantNameButton}
                      onPress={() => setEditingId(participant.id)}
                      disabled={isLoading}
                    >
                      <Text style={styles.participantNameText}>
                        {participant.name}
                      </Text>
                      <Ionicons name="pencil" size={16} color="#999" />
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeParticipant(participant.id)}
                    disabled={isLoading || participants.length <= 1}
                  >
                    <Ionicons 
                      name="close-circle" 
                      size={24} 
                      color={participants.length <= 1 ? "#ddd" : "#ff4d4d"} 
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* Botão Escanear */}
          <TouchableOpacity
            style={[
              styles.button,
              (!isValid || isLoading || participants.length === 0) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={!isValid || isLoading || participants.length === 0}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFF00" />
            ) : (
              <Text style={styles.buttonText}>Escanear conta</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
    paddingTop: 24,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  addButton: {
    backgroundColor: "#81007F",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  participantsList: {
    gap: 8,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantNameButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  participantNameText: {
    fontSize: 16,
    color: "#333",
  },
  participantInput: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 2,
    borderColor: "#81007F",
  },
  removeButton: {
    padding: 4,
  },
  input: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 32,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  hintText: {
    color: "#999",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
    marginLeft: 8,
  },
  button: {
    backgroundColor: "#81007F",
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFF00",
    fontSize: 18,
    fontWeight: "500",
  },
});
