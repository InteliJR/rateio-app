import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../../contexts/ThemeContext";
import { useCredits } from "../../hooks/useCredits";

/**
 * Faixa de saldo exibida acima das opções de criar conta.
 *
 * Quando a consulta falha, a faixa some em vez de mostrar erro: criar conta
 * manualmente não depende de crédito, e um aviso vermelho aqui faria a pessoa
 * achar que o aplicativo inteiro está fora do ar.
 */
export function CreditBalanceChip() {
  const { colors, getFontSize } = useTheme();
  const { balance, isLoading, isError, isUnlimited } = useCredits();

  if (isError) {
    return null;
  }

  const descricao = () => {
    if (isUnlimited) {
      return "Sua conta não tem limite de leituras.";
    }
    if (balance?.resetsAt) {
      const data = new Date(balance.resetsAt).toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
      });
      return `Renova em ${data}`;
    }
    return `De ${balance?.freeGrantTotal ?? 0} leituras gratuitas`;
  };

  const titulo = () => {
    if (isUnlimited) {
      return "Leituras ilimitadas";
    }
    const restantes = balance?.available ?? 0;
    return restantes === 1 ? "1 leitura restante" : `${restantes} leituras restantes`;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.selectionChipInactiveBackground,
          borderColor: colors.selectionChipInactiveBorder,
        },
      ]}
      accessibilityRole="summary"
    >
      <View style={[styles.iconBox, { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons
          name="card-text-outline"
          size={22}
          color={colors.accent}
        />
      </View>

      <View style={styles.texts}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            <Text
              style={[
                styles.title,
                { color: colors.text, fontSize: getFontSize(15) },
              ]}
            >
              {titulo()}
            </Text>
            <Text
              style={[
                styles.description,
                {
                  color: colors.selectionChipInactiveText,
                  fontSize: getFontSize(12),
                },
              ]}
            >
              {descricao()}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    gap: 2,
    minHeight: 36,
    justifyContent: "center",
  },
  title: {
    fontWeight: "700",
  },
  description: {
    lineHeight: 16,
  },
});

export default CreditBalanceChip;
