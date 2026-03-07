import React, { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MaterialIcons } from "@expo/vector-icons";
import { z } from "zod";
import { authService } from "@/services/auth.service";
import Logo from "@/assets/images/logo.svg";

const resetSchema = z
  .object({
    token: z
      .string()
      .nonempty("Por favor, informe o código.")
      .length(6, "O código deve ter 6 dígitos.")
      .regex(/^\d{6}$/, "O código deve conter apenas números."),
    newPassword: z
      .string()
      .nonempty("Por favor, informe a nova senha.")
      .min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirmPassword: z
      .string()
      .nonempty("Por favor, confirme a nova senha."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: { token: "", newPassword: "", confirmPassword: "" },
    mode: "onChange",
  });

  const onSubmit = async (data: ResetFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await authService.resetPassword({
        email: email ?? "",
        token: data.token,
        newPassword: data.newPassword,
      });
      setSuccess(true);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      if (
        msg?.includes("inválido") ||
        msg?.includes("expirado") ||
        msg?.includes("Código")
      ) {
        setServerError(
          "Código inválido ou expirado. Solicite um novo código."
        );
      } else {
        setServerError(
          "Não foi possível redefinir a senha. Tente novamente."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.stack}>
            <Logo style={styles.logo} />
            <View style={styles.successIcon}>
              <MaterialIcons name="check-circle" size={56} color="#81007F" />
            </View>
            <Text style={styles.title}>Senha redefinida!</Text>
            <Text style={styles.successText}>
              Sua senha foi alterada com sucesso. Faça login com sua nova senha.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.buttonText}>Ir para o login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.stack}>
          <Logo style={styles.logo} />
          <Text style={styles.title}>Nova senha</Text>
          <Text style={styles.subtitle}>
            Insira o código de 6 dígitos enviado para{" "}
            {email ? (
              <Text style={styles.emailHighlight}>{email}</Text>
            ) : (
              "seu email"
            )}{" "}
            e escolha uma nova senha.
          </Text>

          {serverError && (
            <Text style={styles.serverErrorText}>{serverError}</Text>
          )}

          {/* Código */}
          <Controller
            control={control}
            name="token"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[styles.input, styles.codeInput, errors.token && styles.inputError]}
                placeholder="Código (6 dígitos)"
                value={value}
                onChangeText={onChange}
                keyboardType="number-pad"
                maxLength={6}
                editable={!isSubmitting}
              />
            )}
          />
          {errors.token && (
            <Text style={styles.errorText}>{errors.token.message}</Text>
          )}

          {/* Nova senha */}
          <View
            style={[
              styles.passwordContainer,
              errors.newPassword && styles.inputError,
            ]}
          >
            <Controller
              control={control}
              name="newPassword"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Nova senha"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showNewPassword}
                  editable={!isSubmitting}
                />
              )}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNewPassword(!showNewPassword)}
              disabled={isSubmitting}
            >
              <MaterialIcons
                name={showNewPassword ? "visibility" : "visibility-off"}
                size={20}
                color="#333"
              />
            </TouchableOpacity>
          </View>
          {errors.newPassword && (
            <Text style={styles.errorText}>{errors.newPassword.message}</Text>
          )}

          {/* Confirmar senha */}
          <View
            style={[
              styles.passwordContainer,
              errors.confirmPassword && styles.inputError,
            ]}
          >
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Confirmar nova senha"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showConfirmPassword}
                  editable={!isSubmitting}
                />
              )}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isSubmitting}
            >
              <MaterialIcons
                name={showConfirmPassword ? "visibility" : "visibility-off"}
                size={20}
                color="#333"
              />
            </TouchableOpacity>
          </View>
          {errors.confirmPassword && (
            <Text style={styles.errorText}>
              {errors.confirmPassword.message}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              (isSubmitting || !isValid) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFF00" />
            ) : (
              <Text style={styles.buttonText}>Redefinir senha</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.linkRow}>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/forgot-password")}
            disabled={isSubmitting}
          >
            <Text style={styles.linkBold}>Não recebi o código</Text>
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
  successIcon: {
    alignSelf: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: "bold",
    color: "#81007F",
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
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: "bold",
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
    marginBottom: 8,
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
    marginTop: 24,
  },
  linkBold: {
    color: "#81007F",
    fontWeight: "bold",
    fontSize: 14,
  },
  footer: {
    height: "10%",
  },
});
