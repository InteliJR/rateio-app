import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { logger } from "../../lib/logger";
import { lightColors, darkColors } from "../../contexts/ThemeContext";

interface Props {
  children: React.ReactNode;
  /** Permite testar o conteúdo de recuperação sem provocar uma exceção real. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Captura exceções de renderização e mostra uma tela com saída, em vez de
 * deixar o aplicativo em branco.
 *
 * Precisa ser classe: o React só oferece captura de erro de renderização por
 * `componentDidCatch` e `getDerivedStateFromError`, que não têm equivalente
 * em hook.
 *
 * Não usa o ThemeContext de propósito: se a falha for na leitura do tema, o
 * componente de recuperação cairia junto. As cores vêm direto dos tokens.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Sem dados pessoais: só a mensagem e a pilha de componentes.
    logger.error("[ErrorBoundary] Falha de renderização:", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    // Sem acesso ao tema aqui, então segue o tema claro, que é o padrão do app.
    const colors = lightColors;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: colors.warningLight,
              borderColor: colors.warning,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="alert-outline"
            size={34}
            color={colors.warning}
          />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          Algo deu errado nesta tela
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Suas contas continuam salvas. Você pode tentar abrir de novo.
        </Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={this.handleReset}
          accessibilityRole="button"
        >
          <Text style={styles.buttonLabel}>Tentar de novo</Text>
        </TouchableOpacity>

        {__DEV__ ? (
          <Text style={[styles.devDetail, { color: colors.textTertiary }]}>
            {error.message}
          </Text>
        ) : null}
      </View>
    );
  }
}

export const darkRecoveryColors = darkColors;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 16,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  button: {
    minHeight: 52,
    minWidth: 200,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginTop: 8,
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  devDetail: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});

export default ErrorBoundary;
