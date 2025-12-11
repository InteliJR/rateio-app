import React, { useState } from "react";
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
} from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import billService from "../../../services/bill.service";
import { useBillStore } from "../../../store/billStore";
import { NumericInput } from "../../../components/common/NumericInput";

interface INewBillFormData {
  numPeople: string;
  defineNameOption: "sim" | "nao";
  billName?: string;
  serviceRate: string;
}

const newBillSchema = z
  .object({
    numPeople: z
      .string()
      .min(1, "Campo obrigatório")
      .refine(
        (val) => !isNaN(Number(val)) && Number(val) >= 1,
        "Mínimo de 1 participante"
      ),
    defineNameOption: z.enum(["sim", "nao"]),
    billName: z.string().optional(),
    serviceRate: z
      .string()
      .min(1, "Campo obrigatório")
      .refine(
        (val) => !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 100,
        "A taxa deve ser entre 0% e 100%"
      ),
  })
  .superRefine((data, ctx) => {
    if (
      data.defineNameOption === "sim" &&
      (!data.billName || data.billName.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nome da conta é obrigatório",
        path: ["billName"],
      });
    }
  });

export default function NewBillScreen() {
  const router = useRouter();
  // const { id } = useLocalSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  // Get store actions
  const { addBill } = useBillStore();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<INewBillFormData>({
    resolver: zodResolver(newBillSchema),
    defaultValues: {
      numPeople: "",
      defineNameOption: "nao",
      billName: "",
      serviceRate: "",
    },
    mode: "onChange",
  });

  const defineNameOption = watch("defineNameOption");

  const onSubmit = async (data: INewBillFormData) => {
    setIsLoading(true);
    try {
      const newBill = await billService.createBillSetup({
        participantCount: Number(data.numPeople),
        billName: data.defineNameOption === "sim" ? data.billName : undefined,
        serviceFeePercentage: Number(data.serviceRate),
      });

      // Add to global store
      addBill(newBill);

      router.push({
        pathname: "/(tabs)/(create)/participants",
        params: { id: newBill.id, participantCount: data.numPeople },
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
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adicionar pessoas</Text>

            <Controller
              control={control}
              name="numPeople"
              render={({ field: { onChange, value, onBlur } }) => (
                <NumericInput
                  label="Quantas pessoas irão participar dessa conta?"
                  placeholder="5"
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  editable={!isLoading}
                  error={errors.numPeople?.message}
                  min={1}
                />
              )}
            />

            <Text style={styles.label}>Deseja definir o nome?</Text>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() =>
                  setValue("defineNameOption", "sim", { shouldValidate: true })
                }
                disabled={isLoading}
              >
                <View style={styles.radioCircle}>
                  {defineNameOption === "sim" && (
                    <View style={styles.radioCircleFilled} />
                  )}
                </View>
                <Text style={styles.radioLabel}>Sim</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => {
                  setValue("defineNameOption", "nao", { shouldValidate: true });
                  setValue("billName", ""); // Clear name when switching to 'nao'
                }}
                disabled={isLoading}
              >
                <View style={styles.radioCircle}>
                  {defineNameOption === "nao" && (
                    <View style={styles.radioCircleFilled} />
                  )}
                </View>
                <Text style={styles.radioLabel}>Não</Text>
              </TouchableOpacity>
            </View>

            {defineNameOption === "sim" && (
              <View>
                <Controller
                  control={control}
                  name="billName"
                  render={({ field: { onChange, value, onBlur } }) => (
                    <TextInput
                      style={[
                        styles.input,
                        styles.conditionalInput,
                        errors.billName ? styles.inputError : null,
                      ]}
                      placeholder="Nome da conta"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      editable={!isLoading}
                    />
                  )}
                />
                {errors.billName && (
                  <Text style={styles.errorText}>
                    {errors.billName.message}
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Definir a taxa de serviço</Text>

            <Controller
              control={control}
              name="serviceRate"
              render={({ field: { onChange, value, onBlur } }) => (
                <NumericInput
                  label="Defina a porcentagem da taxa de serviço?"
                  placeholder="10"
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  editable={!isLoading}
                  error={errors.serviceRate?.message}
                  min={0}
                  max={100}
                />
              )}
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.button,
            (!isValid || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit(onSubmit)}
          disabled={!isValid || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFF00" />
          ) : (
            <Text style={styles.buttonText}>Confirmar</Text>
          )}
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
    paddingTop: 24,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "500",
    color: "#333",
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    marginTop: 8,
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
  inputError: {
    borderColor: "#ff4d4d",
  },
  errorText: {
    color: "#ff4d4d",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 8,
  },
  conditionalInput: {
    marginTop: 12,
  },
  radioGroup: {
    flexDirection: "row",
    gap: 24,
    marginTop: 4,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#81007F",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleFilled: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#81007F",
  },
  radioLabel: {
    fontSize: 14,
    color: "#333",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#81007F",
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
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
