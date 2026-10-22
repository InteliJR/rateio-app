import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../../../contexts/ThemeContext";
import { CreditBalanceChip } from "../../../components/credits/CreditBalanceChip";
import { InsufficientCreditsSheet } from "../../../components/credits/InsufficientCreditsSheet";
import { useCredits } from "../../../hooks/useCredits";

export default function CreateStartScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { hasNoCredits } = useCredits();
  const [showNoCredits, setShowNoCredits] = useState(false);

  const irParaManual = () => {
    setShowNoCredits(false);
    router.push({
      pathname: "/(tabs)/(create)/new",
      params: { mode: "manual" },
    });
  };

  const lerNotaFiscal = () => {
    // Só barra quando temos certeza de que não há saldo. Em caso de dúvida,
    // deixa seguir: o backend recusa e a tela de leitura trata o erro.
    if (hasNoCredits) {
      setShowNoCredits(true);
      return;
    }
    router.push("/(tabs)/(create)/camera");
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Criar conta
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Escolha como deseja adicionar os itens da conta.
        </Text>
      </View>

      <CreditBalanceChip />

      <View style={styles.options}>
        <TouchableOpacity
          style={[
            styles.option,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
          activeOpacity={0.85}
          onPress={lerNotaFiscal}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons
              name="camera-outline"
              size={28}
              color={colors.accent}
            />
          </View>
          <View style={styles.optionText}>
            <View style={styles.optionTitleRow}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                Ler nota fiscal
              </Text>
              <Text
                style={[
                  styles.badge,
                  {
                    color: colors.selectionChipInactiveText,
                    backgroundColor: colors.selectionChipInactiveBackground,
                    borderColor: colors.selectionChipInactiveBorder,
                  },
                ]}
              >
                usa 1 leitura
              </Text>
            </View>
            <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
              Tire uma foto ou escolha uma imagem para reconhecer os itens automaticamente.
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.option,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/(create)/new",
              params: { mode: "manual" },
            })
          }
        >
          <View style={[styles.iconBox, { backgroundColor: colors.backgroundTertiary }]}>
            <MaterialCommunityIcons
              name="playlist-plus"
              size={28}
              color={colors.primary}
            />
          </View>
          <View style={styles.optionText}>
            <View style={styles.optionTitleRow}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                Adicionar manualmente
              </Text>
              <Text
                style={[
                  styles.badge,
                  {
                    color: colors.successText,
                    backgroundColor: colors.successLight,
                    borderColor: colors.successBorder,
                  },
                ]}
              >
                sempre grátis
              </Text>
            </View>
            <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
              Informe os dados da conta e cadastre os itens sem usar a câmera.
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <InsufficientCreditsSheet
        visible={showNoCredits}
        onClose={() => setShowNoCredits(false)}
        onCreateManually={irParaManual}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    gap: 24,
    justifyContent: "center",
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  options: {
    gap: 14,
  },
  option: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  optionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
