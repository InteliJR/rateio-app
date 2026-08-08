import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

const DOCUMENTATION_URL = "https://intelijr.github.io/rateio-app/";

const journeySteps = [
  {
    icon: "scan-outline" as const,
    title: "Capture",
    description:
      "Fotografe a conta ou cadastre os itens manualmente. Você sempre pode revisar antes de continuar.",
  },
  {
    icon: "people-outline" as const,
    title: "Divida",
    description:
      "Escolha quem consumiu cada item e distribua taxas do jeito que fizer sentido para o grupo.",
  },
  {
    icon: "checkmark-done-outline" as const,
    title: "Resolva",
    description:
      "Confira o total de cada pessoa, salve a conta e deixe a matemática com a gente.",
  },
];

const productValues = [
  {
    icon: "scale-outline" as const,
    title: "Justo",
    description: "Cada pessoa paga pelo que realmente consumiu.",
  },
  {
    icon: "flash-outline" as const,
    title: "Simples",
    description: "Menos planilha, menos conta de cabeça e menos demora.",
  },
  {
    icon: "eye-outline" as const,
    title: "Transparente",
    description: "Itens, taxas e totais ficam claros para todo mundo.",
  },
];

export default function AboutScreen() {
  const { colors, getFontSize } = useTheme();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const openDocumentation = () => {
    void Linking.openURL(DOCUMENTATION_URL);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[
          styles.backButton,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
            shadowColor: colors.shadow,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Voltar para configurações"
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroOrbLarge} />
          <View style={styles.heroOrbSmall} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="receipt-outline" size={30} color={colors.primary} />
            </View>
            <View style={styles.versionPill}>
              <View style={styles.versionDot} />
              <Text style={[styles.versionText, { fontSize: getFontSize(11) }]}>
                VERSÃO {appVersion}
              </Text>
            </View>
          </View>

          <Text style={[styles.heroEyebrow, { fontSize: getFontSize(12) }]}>
            POR PARTES
          </Text>
          <Text style={[styles.heroTitle, { fontSize: getFontSize(31) }]}>
            A conta chega inteira. A gente deixa tudo por partes.
          </Text>
          <Text style={[styles.heroDescription, { fontSize: getFontSize(15) }]}>
            Uma forma leve, rápida e transparente de dividir momentos — sem
            deixar a amizade por um centavo.
          </Text>
        </View>

        <View style={styles.section}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: colors.primary, fontSize: getFontSize(12) },
            ]}
          >
            DO CLIQUE AO PIX
          </Text>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontSize: getFontSize(24) },
            ]}
          >
            Dividir pode ser a parte mais fácil da noite
          </Text>
          <Text
            style={[
              styles.sectionDescription,
              { color: colors.textSecondary, fontSize: getFontSize(15) },
            ]}
          >
            O Por Partes organiza o caminho para você chegar ao valor certo sem
            interromper a conversa.
          </Text>

          <View style={styles.journeyList}>
            {journeySteps.map((step, index) => (
              <View
                key={step.title}
                style={[
                  styles.journeyCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <View style={styles.journeyRail}>
                  <View
                    style={[
                      styles.stepIcon,
                      { backgroundColor: colors.selectionChipInactiveBackground },
                    ]}
                  >
                    <Ionicons name={step.icon} size={23} color={colors.primary} />
                  </View>
                  {index < journeySteps.length - 1 && (
                    <View
                      style={[
                        styles.journeyLine,
                        { backgroundColor: colors.cardBorder },
                      ]}
                    />
                  )}
                </View>

                <View style={styles.journeyCopy}>
                  <Text
                    style={[
                      styles.stepNumber,
                      { color: colors.primary, fontSize: getFontSize(11) },
                    ]}
                  >
                    0{index + 1}
                  </Text>
                  <Text
                    style={[
                      styles.journeyTitle,
                      { color: colors.text, fontSize: getFontSize(18) },
                    ]}
                  >
                    {step.title}
                  </Text>
                  <Text
                    style={[
                      styles.journeyDescription,
                      {
                        color: colors.textSecondary,
                        fontSize: getFontSize(14),
                      },
                    ]}
                  >
                    {step.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View
          style={[
            styles.intelligenceCard,
            {
              backgroundColor: colors.warningLight,
              borderColor: colors.warning,
            },
          ]}
        >
          <View style={[styles.sparkleIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="sparkles-outline" size={24} color="#5D215F" />
          </View>
          <View style={styles.intelligenceCopy}>
            <Text
              style={[
                styles.intelligenceTitle,
                { color: colors.text, fontSize: getFontSize(17) },
              ]}
            >
              Inteligência para ajudar. Controle sempre seu.
            </Text>
            <Text
              style={[
                styles.intelligenceDescription,
                { color: colors.textSecondary, fontSize: getFontSize(14) },
              ]}
            >
              A leitura automática acelera o cadastro, mas a confirmação final
              continua nas suas mãos.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: colors.primary, fontSize: getFontSize(12) },
            ]}
          >
            NOSSO JEITO
          </Text>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontSize: getFontSize(24) },
            ]}
          >
            Feito para ninguém sair no prejuízo
          </Text>

          <View style={styles.valuesGrid}>
            {productValues.map((value) => (
              <View
                key={value.title}
                style={[
                  styles.valueCard,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Ionicons name={value.icon} size={23} color={colors.primary} />
                <Text
                  style={[
                    styles.valueTitle,
                    { color: colors.text, fontSize: getFontSize(16) },
                  ]}
                >
                  {value.title}
                </Text>
                <Text
                  style={[
                    styles.valueDescription,
                    { color: colors.textSecondary, fontSize: getFontSize(13) },
                  ]}
                >
                  {value.description}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.documentationCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
          onPress={openDocumentation}
          accessibilityRole="link"
          accessibilityLabel="Abrir documentação do Por Partes"
        >
          <View
            style={[
              styles.documentationIcon,
              { backgroundColor: colors.selectionChipInactiveBackground },
            ]}
          >
            <Ionicons name="book-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.documentationCopy}>
            <Text
              style={[
                styles.documentationTitle,
                { color: colors.text, fontSize: getFontSize(16) },
              ]}
            >
              Conheça o projeto
            </Text>
            <Text
              style={[
                styles.documentationDescription,
                { color: colors.textSecondary, fontSize: getFontSize(13) },
              ]}
            >
              Explore a documentação, decisões e detalhes do Por Partes.
            </Text>
          </View>
          <Ionicons name="open-outline" size={21} color={colors.primary} />
        </TouchableOpacity>

        <View style={styles.footer}>
          <View style={styles.madeWithRow}>
            <Text
              style={[
                styles.footerText,
                { color: colors.textSecondary, fontSize: getFontSize(13) },
              ]}
            >
              Desenvolvido com
            </Text>
            <Ionicons name="heart" size={15} color={colors.error} />
            <Text
              style={[
                styles.footerText,
                { color: colors.textSecondary, fontSize: getFontSize(13) },
              ]}
            >
              pela Inteli Júnior
            </Text>
          </View>
          <Text
            style={[
              styles.copyright,
              { color: colors.textTertiary, fontSize: getFontSize(11) },
            ]}
          >
            POR PARTES • VERSÃO {appVersion}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 76,
    paddingBottom: 36,
    gap: 34,
  },
  hero: {
    minHeight: 330,
    borderRadius: 28,
    padding: 24,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroOrbLarge: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -55,
    top: -55,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroOrbSmall: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    left: -24,
    bottom: -34,
    backgroundColor: "rgba(255,255,0,0.12)",
  },
  heroTopRow: {
    position: "absolute",
    top: 22,
    left: 22,
    right: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#FFFF00",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-4deg" }],
  },
  versionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  versionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FFFF00",
  },
  versionText: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  heroEyebrow: {
    color: "#FFFF00",
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    lineHeight: 37,
    letterSpacing: -0.7,
  },
  heroDescription: {
    color: "rgba(255,255,255,0.82)",
    lineHeight: 22,
    marginTop: 12,
  },
  section: {
    gap: 10,
  },
  sectionEyebrow: {
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  sectionTitle: {
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  sectionDescription: {
    lineHeight: 22,
  },
  journeyList: {
    marginTop: 8,
    gap: 10,
  },
  journeyCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  journeyRail: {
    width: 46,
    alignItems: "center",
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  journeyLine: {
    position: "absolute",
    top: 50,
    width: 2,
    height: 54,
  },
  journeyCopy: {
    flex: 1,
  },
  stepNumber: {
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 2,
  },
  journeyTitle: {
    fontWeight: "700",
    marginBottom: 5,
  },
  journeyDescription: {
    lineHeight: 20,
  },
  intelligenceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  sparkleIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  intelligenceCopy: {
    flex: 1,
    gap: 5,
  },
  intelligenceTitle: {
    fontWeight: "700",
    lineHeight: 22,
  },
  intelligenceDescription: {
    lineHeight: 20,
  },
  valuesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  valueCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  valueTitle: {
    fontWeight: "700",
  },
  valueDescription: {
    lineHeight: 19,
  },
  documentationCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 13,
  },
  documentationIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  documentationCopy: {
    flex: 1,
    gap: 3,
  },
  documentationTitle: {
    fontWeight: "700",
  },
  documentationDescription: {
    lineHeight: 18,
  },
  footer: {
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  madeWithRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  footerText: {
    lineHeight: 19,
  },
  copyright: {
    fontWeight: "700",
    letterSpacing: 1.1,
  },
});
