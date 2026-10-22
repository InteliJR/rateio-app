import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../../contexts/ThemeContext";
import { useCredits } from "../../hooks/useCredits";

interface InsufficientCreditsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Leva para a criação manual, que é gratuita e não passa por crédito. */
  onCreateManually: () => void;
  /** Leva para a compra. Enquanto a loja não estiver pronta, fica indisponível. */
  onBuyCredits?: () => void;
}

/**
 * Aviso de que as leituras acabaram.
 *
 * Mostra as duas saídas de propósito: se a compra fosse a única opção visível,
 * a pessoa concluiria que o aplicativo inteiro virou pago, quando na verdade
 * dividir contas na mão continua gratuito e sem limite.
 */
export const InsufficientCreditsSheet: React.FC<
  InsufficientCreditsSheetProps
> = ({ visible, onClose, onCreateManually, onBuyCredits }) => {
  const { colors, getFontSize } = useTheme();
  const { balance } = useCredits(visible);

  const renovacao = balance?.resetsAt
    ? `Suas leituras gratuitas voltam em ${new Date(
        balance.resetsAt,
      ).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}.`
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityLabel="Fechar aviso"
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.divider }]} />

          <View style={styles.header}>
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
                size={26}
                color={colors.warning}
              />
            </View>

            <View style={styles.headerTexts}>
              <Text
                style={[
                  styles.title,
                  { color: colors.text, fontSize: getFontSize(20) },
                ]}
              >
                Suas leituras acabaram
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: colors.textSecondary,
                    fontSize: getFontSize(13),
                  },
                ]}
              >
                Você usou as {balance?.freeGrantTotal ?? 0} leituras gratuitas.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.notice,
              {
                backgroundColor: colors.successLight,
                borderColor: colors.successBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.noticeTitle,
                { color: colors.successText, fontSize: getFontSize(14) },
              ]}
            >
              Dividir contas continua grátis
            </Text>
            <Text
              style={[
                styles.noticeText,
                { color: colors.successText, fontSize: getFontSize(13) },
              ]}
            >
              A leitura por foto é o que usa crédito. Digitar os itens e dividir
              com o grupo não tem limite.
            </Text>
          </View>

          <View style={styles.actions}>
            {onBuyCredits ? (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={onBuyCredits}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.primaryLabel, { fontSize: getFontSize(16) }]}
                >
                  Comprar mais leituras
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.primary,
                },
              ]}
              onPress={onCreateManually}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.secondaryLabel,
                  { color: colors.primary, fontSize: getFontSize(16) },
                ]}
              >
                Adicionar itens manualmente
              </Text>
            </TouchableOpacity>
          </View>

          {renovacao ? (
            <Text
              style={[
                styles.footer,
                { color: colors.textTertiary, fontSize: getFontSize(12) },
              ]}
            >
              {renovacao}
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 20,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTexts: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontWeight: "700",
  },
  subtitle: {
    lineHeight: 18,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  noticeTitle: {
    fontWeight: "700",
  },
  noticeText: {
    lineHeight: 18,
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    fontWeight: "700",
  },
  footer: {
    textAlign: "center",
    lineHeight: 16,
  },
});

export default InsufficientCreditsSheet;
