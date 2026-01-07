import React, { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Logo from "@/assets/images/logo.svg";
import { useAuthStore } from "@/store/authStore";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const registerSchema = z
  .object({
    name: z.string().nonempty("Informe seu nome.").min(3, "Nome muito curto."),
    email: z
      .string()
      .nonempty("Informe seu email.")
      .email("Formato de email inválido.")
      .refine(
        (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
        "Verifique se o email está completo."
      ),
    password: z
      .string()
      .nonempty("Informe uma senha.")
      .min(8, "A senha precisa ter ao menos 8 caracteres."),
    confirmPassword: z.string().nonempty("Confirme sua senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register: registerUser, isLoading, loadTokens } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Initialize loading state on mount
    loadTokens();
  }, [loadTokens]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      const response = await registerUser(data.name, data.email, data.password);
      Alert.alert(
        "Cadastro realizado",
        "Conta criada com sucesso! Você já está logado.",
        [
          {
            text: "Continuar",
            onPress: () => router.replace("/(tabs)/(create)/new"),
          },
        ]
      );
    } catch (error: any) {
      console.error("[RegisterPage] Registration error:", error);
      setServerError(getApiErrorMessage(error));
    }
  };

  function getApiErrorMessage(err: any): string {
    console.log("[RegisterPage] Error details:", { err });
    const data = err?.response?.data;
    if (data) {
      console.log("[RegisterPage] Response data:", data);
      if (Array.isArray(data.errors)) {
        const arr = data.errors
          .map((e: any) => e?.message || String(e))
          .filter(Boolean);
        if (arr.length) return arr.join("\n");
      }
      if (
        data.errors &&
        typeof data.errors === "object" &&
        !Array.isArray(data.errors)
      ) {
        const msgs = Object.values(data.errors)
          .map((e: any) => (typeof e === "string" ? e : e?.message))
          .filter(Boolean) as string[];
        if (msgs.length) return msgs.join("\n");
      }
      switch (data.code) {
        case "EMAIL_IN_USE":
          return "Este email já está em uso.";
        case "WEAK_PASSWORD":
          return "A senha fornecida é considerada fraca.";
        case "INVALID_DATA":
          return "Dados inválidos. Verifique os campos.";
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
    }
    console.log("[RegisterPage] Returning generic error message");
    return "Não foi possível realizar o cadastro. Tente novamente.";
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.stack}>
          <Logo style={styles.logo} />
          <Text style={styles.title}>Cadastro</Text>

          {serverError && (
            <Text style={styles.serverErrorText}>{serverError}</Text>
          )}

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                placeholder="Nome"
                value={value}
                onChangeText={onChange}
                autoCapitalize="words"
                editable={!isLoading}
              />
            )}
          />
          {errors.name && (
            <Text style={styles.errorText}>{errors.name.message}</Text>
          )}

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="Email"
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isLoading}
              />
            )}
          />
          {errors.email && (
            <Text style={styles.errorText}>{errors.email.message}</Text>
          )}

          <View
            style={[
              styles.passwordContainer,
              errors.password && styles.inputError,
            ]}
          >
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Senha"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
              )}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              disabled={isLoading}
            >
              <MaterialIcons
                name={showPassword ? "visibility" : "visibility-off"}
                size={20}
                color="#333"
              />
            </TouchableOpacity>
          </View>
          {errors.password && (
            <Text style={styles.errorText}>{errors.password.message}</Text>
          )}

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[
                  styles.input,
                  errors.confirmPassword && styles.inputError,
                ]}
                placeholder="Confirmar senha"
                value={value}
                onChangeText={onChange}
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />
            )}
          />
          {errors.confirmPassword && (
            <Text style={styles.errorText}>
              {errors.confirmPassword.message}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              (isLoading || !isValid) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading || !isValid}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFF00" />
            ) : (
              <Text style={styles.buttonText}>Criar conta</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.linkRow}>
          <Text style={{ color: "#333" }}>Já possui conta? </Text>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            disabled={isLoading}
          >
            <Text style={{ color: "#81007F", fontWeight: "bold" }}>Entrar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  stack: {
    width: "100%",
    gap: 16,
  },
  logo: {
    alignSelf: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  form: {
    width: "100%",
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
    borderColor: "#d00",
  },
  errorText: {
    color: "#d00",
    marginTop: -16,
    marginBottom: 16,
    marginLeft: 8,
    fontSize: 12,
  },
  serverErrorText: {
    color: "#d00",
    marginBottom: 16,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  eyeIcon: {
    fontSize: 20,
  },
  button: {
    backgroundColor: "#81007F",
    paddingVertical: 14,
    borderRadius: 32,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFF00",
    fontSize: 16,
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  footer: {
    height: "10%",
  },
});
