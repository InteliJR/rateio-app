import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

export default function AccessibilityScreen() {
  const { colors, isDark, toggleTheme, fontScale, setFontScale, getFontSize } =
    useTheme();
  const router = useRouter();

  const getFontSizeLabel = () => {
    if (fontScale <= 0.9) return "Pequeno";
    if (fontScale <= 1.1) return "Padrão";
    if (fontScale <= 1.3) return "Grande";
    return "Muito Grande";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back Button */}
      <TouchableOpacity
        onPress={() => router.push("/profile/config")}
        style={[styles.backButton, { backgroundColor: colors.cardBackground }]}
      >
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Options Container */}
        <View
          style={[
            styles.optionsContainer,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor: colors.divider,
            },
          ]}
        >
          <View
            style={[
              styles.optionItem,
              { backgroundColor: colors.cardBackground },
            ]}
          >
            <Text
              style={[
                styles.optionText,
                { color: colors.text, fontSize: getFontSize(16) },
              ]}
            >
              Tema Claro
            </Text>
            <Switch
              value={!isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.divider, true: colors.primary }}
              thumbColor={!isDark ? colors.accent : colors.background}
              ios_backgroundColor={colors.divider}
            />
          </View>

          <View
            style={[
              styles.sliderContainer,
              { backgroundColor: colors.cardBackground },
            ]}
          >
            <View style={styles.sliderHeader}>
              <Text
                style={[
                  styles.optionText,
                  { color: colors.text, fontSize: getFontSize(16) },
                ]}
              >
                Tamanho da Fonte
              </Text>
              <Text
                style={[
                  styles.fontSizeLabel,
                  { color: colors.textSecondary, fontSize: getFontSize(14) },
                ]}
              >
                {getFontSizeLabel()}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.8}
              maximumValue={1.4}
              step={0.1}
              value={fontScale}
              onValueChange={setFontScale}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.divider}
              thumbTintColor={colors.accent}
            />
            <View style={styles.sliderLabels}>
              <Text
                style={[
                  styles.sliderLabelText,
                  { color: colors.textTertiary, fontSize: getFontSize(14) },
                ]}
              >
                A
              </Text>
              <Text
                style={[
                  styles.sliderLabelText,
                  { color: colors.textTertiary, fontSize: getFontSize(20) },
                ]}
              >
                A
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  backButton: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 80,
    paddingBottom: 40,
  },
  optionsContainer: {
    paddingHorizontal: 20,
    gap: 1,
    backgroundColor: "#F0F0F0",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E0E0E0",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
  },
  optionText: {
    fontSize: 16,
    color: "#333",
  },
  sliderContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  fontSizeLabel: {
    fontSize: 14,
    color: "#666",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  sliderLabelText: {
    fontSize: 14,
    color: "#999",
  },
});
