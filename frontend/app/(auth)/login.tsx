import React, { useEffect, useState } from "react";
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
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import Logo from "@/assets/images/logo.svg";
import { z } from "zod";
import { storageService } from "@/services/storage.service";
import { useTheme } from "@/contexts/ThemeContext";

export default function LoginScreen() {
  const { colors, getFontSize } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const { login, loginWithGoogle } = useAuthStore();
  const router = useRouter();
  const isBusy = isSubmitting || isGoogleSubmitting;

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
  const isGoogleConfigured = Boolean(googleWebClientId);

  useEffect(() => {
    if (!googleWebClientId) return;

    GoogleSignin.configure({
      webClientId: googleWebClientId,
      scopes: ["profile", "email"],
    });
  }, [googleWebClientId]);

  const loginSchema = z.object({
    email: z
      .string()
      .nonempty("Por favor, informe seu email.")
      .email("Digite um email válido (ex: usuario@dominio.com)."),
    password: z
      .string()
      .nonempty("Por favor, informe sua senha.")
      .min(8, "A senha precisa ter pelo menos 8 caracteres."),
  });

  type LoginFormData = z.infer<typeof loginSchema>;

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
      router.replace("/(tabs)/bills");
    } catch (error: any) {
      const message = getApiErrorMessage(error);
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setServerError(null);

    if (!isGoogleConfigured) {
      setServerError(
        "Login com Google nao configurado. Defina o Web Client ID no .env do app."
      );
      return;
    }

    setIsGoogleSubmitting(true);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      const result = await GoogleSignin.signIn();

      if (!isSuccessResponse(result)) {
        return;
      }

      const idToken = result.data.idToken;

      if (!idToken) {
        throw new Error("Token Google nao retornado.");
      }

      await loginWithGoogle(idToken);
      router.replace("/(tabs)/bills");
    } catch (error: any) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            return;
          case statusCodes.IN_PROGRESS:
            setServerError("Login com Google ja esta em andamento.");
            return;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            setServerError("Google Play Services indisponivel ou desatualizado.");
            return;
        }
      }

      setServerError(getApiErrorMessage(error));
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  function getApiErrorMessage(err: any): string {
    const data = err?.response?.data;
    if (data) {
      // Lista de erros como array
      if (Array.isArray(data.errors)) {
        const arr = data.errors
          .map((e: any) => e?.message || String(e))
          .filter(Boolean);
        if (arr.length) return arr.join("\n");
      }
      // Objeto de erros campo->mensagem
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
      // Códigos específicos
      switch (data.code) {
        case "INVALID_CREDENTIALS":
          return "Email ou senha incorretos.";
        case "USER_NOT_FOUND":
          return "Usuário não encontrado.";
        case "ACCOUNT_LOCKED":
          return "Conta bloqueada temporariamente. Tente mais tarde.";
        case "USER_INACTIVE":
          return "Conta ainda não ativada. Verifique seu email.";
        case "TOO_MANY_ATTEMPTS":
          return "Muitas tentativas falhas. Aguarde alguns minutos.";
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
    }
    return "Não foi possível fazer login. Tente novamente.";
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <View style={styles.stack}>
          <Logo style={styles.logo} />
          <Text
            style={[
              styles.title,
              { color: colors.text, fontSize: getFontSize(28) },
            ]}
          >
            Login
          </Text>

          {serverError && (
            <Text
              style={[styles.serverErrorText, { fontSize: getFontSize(14) }]}
            >
              {serverError}
            </Text>
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
                  errors.email && styles.inputError,
                ]}
                placeholder="Email"
                placeholderTextColor={colors.placeholderText}
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isBusy}
              />
            )}
          />
          {errors.email && (
            <Text style={[styles.errorText, { fontSize: getFontSize(12) }]}>
              {errors.email.message}
            </Text>
          )}

          <View
            style={[
              styles.passwordContainer,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
              },
              errors.password && styles.inputError,
            ]}
          >
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[
                    styles.passwordInput,
                    { color: colors.text, fontSize: getFontSize(16) },
                  ]}
                  placeholder="Senha"
                  placeholderTextColor={colors.placeholderText}
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  editable={!isBusy}
                />
              )}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              disabled={isBusy}
            >
              <MaterialIcons
                name={showPassword ? "visibility" : "visibility-off"}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {errors.password && (
            <Text style={[styles.errorText, { fontSize: getFontSize(12) }]}>
              {errors.password.message}
            </Text>
          )}

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => router.push("/(auth)/forgot-password")}
            disabled={isBusy}
          >
            <Text style={styles.forgotLinkText}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              (isBusy || !isValid) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={isBusy || !isValid}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text
                style={[
                  styles.buttonText,
                  { color: colors.accent, fontSize: getFontSize(16) },
                ]}
              >
                Entrar
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View
              style={[styles.dividerLine, { backgroundColor: colors.inputBorder }]}
            />
            <Text
              style={[styles.dividerText, { color: colors.textSecondary }]}
            >
              ou
            </Text>
            <View
              style={[styles.dividerLine, { backgroundColor: colors.inputBorder }]}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.googleButton,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
              },
              (isBusy || !isGoogleConfigured) && styles.buttonDisabled,
            ]}
            onPress={handleGoogleLogin}
            disabled={isBusy || !isGoogleConfigured}
          >
            {isGoogleSubmitting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text
                  style={[
                    styles.googleIcon,
                    { color: colors.text, fontSize: getFontSize(18) },
                  ]}
                >
                  G
                </Text>
                <Text
                  style={[
                    styles.googleButtonText,
                    { color: colors.text, fontSize: getFontSize(16) },
                  ]}
                >
                  Entrar com Google
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.linkRow}>
          <Text
            style={{ color: colors.textSecondary, fontSize: getFontSize(14) }}
          >
            Não possui uma conta?{" "}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/register")}
            disabled={isBusy}
          >
            <Text
              style={{
                color: colors.primary,
                fontWeight: "bold",
                fontSize: getFontSize(14),
              }}
            >
              Cadastre-se
            </Text>
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
    marginBottom: 24,
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  googleButton: {
    minHeight: 48,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  googleIcon: {
    fontWeight: "700",
  },
  googleButtonText: {
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  forgotLink: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    marginTop: -8,
  },
  forgotLinkText: {
    color: "#81007F",
    fontSize: 13,
    fontWeight: "500",
  },
  footer: {
    height: "10%",
  },
});
