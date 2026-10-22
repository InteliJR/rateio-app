import React from "react";
import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../../contexts/ThemeContext";
import { useCredits } from "../../hooks/useCredits";

/**
 * Aviso exibido enquanto a leitura roda.
 *
 * A pessoa acabou de ver o saldo cair em um, então o aplicativo explica que
 * a leitura está apenas reservada e que ela volta se der errado. Sem isso, a
 * impressão é de que o crédito já foi gasto antes de entregar qualquer coisa.
 */
export function CreditReservedNotice() {
  const { colors, getFontSize } = useTheme();
  const { isUnlimited, isError } = useCredits();

  if (isError || isUnlimited) {
    return null;
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.selectionChipInactiveBackground,
          borderColor: colors.selectionChipInactiveBorder,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="information-outline"
        size={22}
        color={colors.primary}
        style={styles.icon}
      />
      <View style={styles.texts}>
        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: getFontSize(14) },
          ]}
        >
          1 leitura reservada
        </Text>
        <Text
          style={[
            styles.text,
            {
              color: colors.selectionChipInactiveText,
              fontSize: getFontSize(13),
            },
          ]}
        >
          Ela só é cobrada se a nota for lida. Se der erro, a leitura volta para
          você.
        </Text>
      </View>
    </View>
  );
}

/**
 * Confirmação de devolução, exibida quando a leitura falha.
 *
 * O valor aqui é de confiança: a pessoa precisa ver que não pagou por uma
 * leitura que não entregou resultado, senão assume que perdeu o crédito.
 */
export function CreditReturnedNotice() {
  const { colors, getFontSize } = useTheme();
  const { available, isUnlimited, isError } = useCredits();

  if (isError || isUnlimited) {
    return null;
  }

  const restantes =
    available === 1 ? "Você continua com 1 leitura." : `Você continua com ${available} leituras.`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.successLight,
          borderColor: colors.successBorder,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="check"
        size={22}
        color={colors.successText}
        style={styles.icon}
      />
      <View style={styles.texts}>
        <Text
          style={[
            styles.title,
            { color: colors.successText, fontSize: getFontSize(14) },
          ]}
        >
          Sua leitura foi devolvida
        </Text>
        <Text
          style={[
            styles.text,
            { color: colors.successText, fontSize: getFontSize(13) },
          ]}
        >
          {restantes} Você não paga por uma leitura que não deu certo.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  icon: {
    marginTop: 1,
  },
  texts: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontWeight: "700",
  },
  text: {
    lineHeight: 18,
  },
});
