import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../../contexts/ThemeContext";
import { useCredits } from "../../hooks/useCredits";

/**
 * Card de saldo no perfil.
 *
 * Serve para a pessoa conferir quantas leituras tem sem precisar começar uma
 * conta. Some quando a consulta falha, pelo mesmo motivo da faixa na criação
 * de conta: o perfil inteiro não depende de créditos.
 */
export function CreditBalanceCard() {
  const { colors, getFontSize } = useTheme();
  const { balance, isLoading, isError, isUnlimited, available } = useCredits();

  if (isError) {
    return null;
  }

  const total = balance?.freeGrantTotal ?? 0;
  const proporcao = total > 0 ? Math.min(available / total, 1) : 0;

  const renovacao = balance?.resetsAt
    ? `Renova em ${new Date(balance.resetsAt).toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
      })}`
    : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: colors.textSecondary, fontSize: getFontSize(13) },
        ]}
      >
        Suas leituras
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : isUnlimited ? (
        <Text
          style={[
            styles.unlimited,
            { color: colors.primary, fontSize: getFontSize(20) },
          ]}
        >
          Sem limite de leituras
        </Text>
      ) : (
        <>
          <View style={styles.amountRow}>
            <Text
              style={[
                styles.amount,
                { color: colors.primary, fontSize: getFontSize(40) },
              ]}
            >
              {available}
            </Text>
            <Text
              style={[
                styles.amountLabel,
                { color: colors.textSecondary, fontSize: getFontSize(15) },
              ]}
            >
              de {total} leituras
            </Text>
          </View>

          <View
            style={[styles.track, { backgroundColor: colors.backgroundTertiary }]}
            accessibilityElementsHidden
          >
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.primary, flex: proporcao },
              ]}
            />
            <View style={{ flex: 1 - proporcao }} />
          </View>

          {renovacao ? (
            <View style={styles.footerRow}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={18}
                color={colors.textSecondary}
              />
              <Text
                style={[
                  styles.footerText,
                  { color: colors.textSecondary, fontSize: getFontSize(13) },
                ]}
              >
                {renovacao}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 14,
  },
  label: {
    fontWeight: "600",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  amount: {
    fontWeight: "700",
  },
  amountLabel: {
    paddingBottom: 4,
  },
  unlimited: {
    fontWeight: "700",
  },
  track: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  fill: {
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    lineHeight: 18,
  },
});

export default CreditBalanceCard;
