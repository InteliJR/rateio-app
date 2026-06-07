import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../contexts/ThemeContext";

export default function OAuthRedirectScreen() {
  const router = useRouter();
  const { colors, getFontSize } = useTheme();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace("/");
    }, 6000);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text
        style={[
          styles.text,
          { color: colors.textSecondary, fontSize: getFontSize(14) },
        ]}
      >
        Concluindo login...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  text: {
    textAlign: "center",
    fontWeight: "500",
  },
});
