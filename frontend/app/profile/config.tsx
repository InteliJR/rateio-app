import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { userService } from "../../services/user.service";
import { API_URL } from "../../services/api.service";
import { useTheme } from "../../contexts/ThemeContext";

export default function ConfigScreen() {
  const { colors, getFontSize } = useTheme();
  const router = useRouter();
  const [userName, setUserName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadUserData();
  }, []);

  const buildAvatarUrl = (rawUrl: string | null | undefined): string | null => {
    if (!rawUrl) return null;

    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      return rawUrl;
    }

    return `${API_URL}${rawUrl}`;
  };

  const loadUserData = async () => {
    try {
      const profile = await userService.getProfile();
      setUserName(profile.name);
      setAvatarUrl(buildAvatarUrl(profile.avatarUrl));
      await AsyncStorage.setItem("userName", profile.name);
    } catch (error) {
      console.error("Erro ao carregar dados do usuário:", error);
      try {
        const name = await AsyncStorage.getItem("userName");
        if (name) setUserName(name);
      } catch (storageError) {
        console.error("Erro ao carregar nome do AsyncStorage:", storageError);
      }
    }
  };

  const handleAccessibility = () => {
    router.push("/profile/accessibility");
  };

  const handleAbout = () => {
    router.push("/profile/about");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back Button */}
      <TouchableOpacity
        onPress={() => router.push("/(tabs)/profile")}
        style={[styles.backButton, { backgroundColor: colors.cardBackground }]}
      >
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[
                  styles.avatarImage,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.primary,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <Ionicons name="person" size={60} color={colors.accent} />
              </View>
            )}
          </View>
          <Text
            style={[
              styles.userName,
              { color: colors.text, fontSize: getFontSize(24) },
            ]}
          >
            {userName || "Usuário"}
          </Text>
        </View>

        {/* Config Options */}
        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={[
              styles.menuItem,
              {
                backgroundColor: colors.menuItem,
                borderColor: colors.cardBorder,
                shadowColor: colors.shadow,
              },
            ]}
            onPress={handleAccessibility}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons
                name="accessibility-outline"
                size={24}
                color={colors.text}
              />
              <Text
                style={[
                  styles.menuItemText,
                  { color: colors.text, fontSize: getFontSize(16) },
                ]}
              >
                Acessibilidade
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colors.textTertiary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.menuItem,
              {
                backgroundColor: colors.menuItem,
                borderColor: colors.cardBorder,
                shadowColor: colors.shadow,
              },
            ]}
            onPress={handleAbout}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons
                name="information-circle-outline"
                size={24}
                color={colors.text}
              />
              <Text
                style={[
                  styles.menuItemText,
                  { color: colors.text, fontSize: getFontSize(16) },
                ]}
              >
                Sobre
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
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
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 40,
    paddingTop: 60,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#7B2CBF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e0e0e0",
  },
  userName: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333",
  },
  menuContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
});
