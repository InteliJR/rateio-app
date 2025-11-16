import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import Logo from '@/assets/images/logo.svg';
import { z } from 'zod';

export default function LoginScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { login, isLoading } = useAuthStore();
  const router = useRouter();

  const loginSchema = z.object({
    email: z
      .string()
      .nonempty('Por favor, informe seu email.')
      .email('Digite um email válido (ex: usuario@dominio.com).'),
    password: z
      .string()
      .nonempty('Por favor, informe sua senha.')
      .min(6, 'A senha precisa ter pelo menos 6 caracteres.'),
  });

  type LoginFormData = z.infer<typeof loginSchema>;

  const { control, handleSubmit, formState: { errors, isValid } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onChange',
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      router.replace('/(tabs)');
    } catch (error: any) {
      const message = getApiErrorMessage(error);
      setServerError(message);
    }
  };

  function getApiErrorMessage(err: any): string {
    const data = err?.response?.data;
    if (data) {
      // Lista de erros como array
      if (Array.isArray(data.errors)) {
        const arr = data.errors.map((e: any) => e?.message || String(e)).filter(Boolean);
        if (arr.length) return arr.join('\n');
      }
      // Objeto de erros campo->mensagem
      if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
        const msgs = Object.values(data.errors).map((e: any) => (typeof e === 'string' ? e : e?.message)).filter(Boolean) as string[];
        if (msgs.length) return msgs.join('\n');
      }
      // Códigos específicos
      switch (data.code) {
        case 'INVALID_CREDENTIALS':
          return 'Email ou senha incorretos.';
        case 'USER_NOT_FOUND':
          return 'Usuário não encontrado.';
        case 'ACCOUNT_LOCKED':
          return 'Conta bloqueada temporariamente. Tente mais tarde.';
        case 'USER_INACTIVE':
          return 'Conta ainda não ativada. Verifique seu email.';
        case 'TOO_MANY_ATTEMPTS':
          return 'Muitas tentativas falhas. Aguarde alguns minutos.';
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
    }
    return 'Não foi possível fazer login. Tente novamente.';
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Logo style={styles.logo} />

        <View style={styles.form}>
          <Text style={styles.title}>Login</Text>

          {serverError && (
            <Text style={styles.serverErrorText}>{serverError}</Text>
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
          {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}

          <View style={[styles.passwordContainer, errors.password && styles.inputError]}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.passwordInput]}
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
                name={showPassword ? 'visibility' : 'visibility-off'}
                size={20}
                color="#333"
              />
            </TouchableOpacity>
          </View>
          {errors.password && <Text style={styles.errorText}>{errors.password.message}</Text>}

          <TouchableOpacity
            style={[styles.button, (isLoading || !isValid) && styles.buttonDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading || !isValid}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFF00" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: '#333' }}>Não possui uma conta? </Text>
            <TouchableOpacity onPress={() => router.push('/register')} disabled={isLoading}>
              <Text style={{ color: '#81007F', fontWeight: 'bold' }}>Cadastre-se</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 32,
    marginBottom: 24,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputError: {
    borderColor: '#d00',
  },
  errorText: {
    color: '#d00',
    marginTop: -16,
    marginBottom: 16,
    marginLeft: 8,
    fontSize: 12,
  },
  serverErrorText: {
    color: '#d00',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 32,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd',
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
    backgroundColor: '#81007F',
    paddingVertical: 14,
    borderRadius: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFF00',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    height: '15%',
  },
});