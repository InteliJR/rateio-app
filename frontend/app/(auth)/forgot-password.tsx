import React, { useState } from "react";
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
} from "react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MaterialIcons } from "@expo/vector-icons";
import { z } from "zod";
import { authService } from "@/services/auth.service";
import Logo from "@/assets/images/logo.svg";
import { useTheme } from "@/contexts/ThemeContext";

const forgotSchema = z.object({
  email: z
    .string()
    .nonempty("Por favor, informe seu email.")
    .email("Digite um email válido (ex: usuario@dominio.com)."),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, getFontSize } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  const onSubmit = async (data: ForgotFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await authService.forgotPassword({ email: data.email });
      setSentEmail(data.email);
    } catch {
      setServerError(
        "Não foi possível processar sua solicitação. Tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sentEmail) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.content}>
          <View style={styles.stack}>
            <Logo style={styles.logo} />
            <View style={styles.successIcon}>
              <MaterialIcons name="mark-email-read" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text, fontSize: getFontSize(24) }]}>Email enviado!</Text>
            <Text style={[styles.successText, { color: colors.textSecondary, fontSize: getFontSize(14) }]}>
              Se <Text style={[styles.emailHighlight, { color: colors.primary }]}>{sentEmail}</Text> estiver
              cadastrado, você receberá um código de 6 dígitos em breve.
            </Text>
            <Text style={[styles.hintText, { color: colors.textTertiary, fontSize: getFontSize(12) }]}>
              Verifique também sua caixa de spam.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={() =>
                router.push({
                  pathname: "/(auth)/reset-password",
                  params: { email: sentEmail },
                })
              }
            >
              <Text style={[styles.buttonText, { color: colors.accent, fontSize: getFontSize(16) }]}>Inserir código</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setSentEmail(null)}
            >
              <Text style={[styles.linkText, { color: colors.primary, fontSize: getFontSize(14) }]}>Usar outro email</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.linkRow}>
            <Text style={{ color: colors.text }}>Lembrou a senha? </Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={[styles.linkBold, { color: colors.primary, fontSize: getFontSize(14) }]}>Fazer login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <View style={styles.stack}>
          <Logo style={styles.logo} />
          <Text style={[styles.title, { color: colors.text, fontSize: getFontSize(24) }]}>Esqueci minha senha</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: getFontSize(14) }]}>
            Informe seu email e enviaremos um código de 6 dígitos para
            redefinir sua senha.
          </Text>

          {serverError && (
            <Text style={[styles.serverErrorText, { color: colors.error, fontSize: getFontSize(13) }]}>{serverError}</Text>
          )}

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text,
                  },
                  errors.email && [styles.inputError, { borderColor: colors.error }],
                ]}
                placeholder="Email"
                placeholderTextColor={colors.placeholderText}
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isSubmitting}
                autoFocus
              />
            )}
          />
          {errors.email && (
            <Text style={[styles.errorText, { color: colors.error, fontSize: getFontSize(12) }]}>{errors.email.message}</Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              (isSubmitting || !isValid) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.accent, fontSize: getFontSize(16) }]}>Enviar código</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.linkRow}>
          <Text style={{ color: colors.text }}>Lembrou a senha? </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            disabled={isSubmitting}
          >
            <Text style={[styles.linkBold, { color: colors.primary, fontSize: getFontSize(14) }]}>Fazer login</Text>
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
  hintText: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
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
    marginBottom: 8,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
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
  linkButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    color: "#81007F",
    fontSize: 14,
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
  },
  footer: {
    height: "10%",
  },
});
