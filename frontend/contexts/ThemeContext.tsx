import { logger } from '../lib/logger';
import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Definição das cores para cada tema
export const lightColors = {
  background: "#FFFFFF",
  backgroundSecondary: "#F8F8F8",
  backgroundTertiary: "#F0F0F0",
  card: "#FFFFFF",
  cardBackground: "#FFFFFF",
  cardBorder: "#E0E0E0",
  text: "#000000",
  textSecondary: "#666666",
  secondaryText: "#666666",
  textTertiary: "#999999",
  primary: "#8B2E8F",
  primaryLight: "#9B3E9F",
  accent: "#FFFF00",
  success: "#10b981",
  successLight: "#d1fae5",
  successBorder: "#10b981",
  successText: "#065f46",
  error: "#ef4444",
  warning: "#f59e0b",
  warningLight: "#FFF9E6",
  divider: "#E0E0E0",
  shadow: "rgba(0, 0, 0, 0.1)",
  overlay: "rgba(0, 0, 0, 0.5)",
  tabBarInactive: "#666",
  tabBarBackground: "#FFFFFF",
  inputBackground: "#FFFFFF",
  inputBorder: "#E0E0E0",
  placeholderText: "#999999",
  couvert: "#d97706",
  couvertBackground: "#FFFBF5",
  iconColor: "#666666",
  dropdownBackground: "#F8F8F8",
  checkboxActive: "#E8D4E9",
  menuItem: "#F0F0F0",
  selectionChipActiveBackground: "#8B2E8F",
  selectionChipActiveBorder: "#8B2E8F",
  selectionChipActiveText: "#FFFFFF",
  selectionChipInactiveBackground: "#F3EBF4",
  selectionChipInactiveBorder: "#D8BFDA",
  selectionChipInactiveText: "#6F4B72",
};

export const darkColors = {
  background: "#121212",
  backgroundSecondary: "#1E1E1E",
  backgroundTertiary: "#2A2A2A",
  card: "#1E1E1E",
  cardBackground: "#1E1E1E",
  cardBorder: "#3A3A3A",
  text: "#FFFFFF",
  textSecondary: "#B0B0B0",
  secondaryText: "#B0B0B0",
  textTertiary: "#808080",
  primary: "#9B3E9F",
  primaryLight: "#AB4EAF",
  accent: "#FFFF00",
  success: "#10b981",
  successLight: "#1a3a2e",
  successBorder: "#10b981",
  successText: "#86efac",
  error: "#ef4444",
  warning: "#f59e0b",
  warningLight: "#3a2f1f",
  divider: "#3A3A3A",
  shadow: "rgba(0, 0, 0, 0.3)",
  overlay: "rgba(0, 0, 0, 0.7)",
  tabBarInactive: "#808080",
  tabBarBackground: "#1E1E1E",
  inputBackground: "#2A2A2A",
  inputBorder: "#3A3A3A",
  placeholderText: "#666666",
  couvert: "#f59e0b",
  couvertBackground: "#2a2418",
  iconColor: "#B0B0B0",
  dropdownBackground: "#2A2A2A",
  checkboxActive: "#3A2A3A",
  menuItem: "#2A2A2A",
  selectionChipActiveBackground: "#D785DB",
  selectionChipActiveBorder: "#D785DB",
  selectionChipActiveText: "#121212",
  selectionChipInactiveBackground: "#2A2230",
  selectionChipInactiveBorder: "#5B4660",
  selectionChipInactiveText: "#D4C2D6",
};

export type ThemeColors = typeof lightColors;

interface ThemeContextData {
  isDark: boolean;
  colors: ThemeColors;
  fontScale: number;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
  setFontScale: (scale: number) => void;
  getFontSize: (baseSize: number) => number;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isDark, setIsDark] = useState(false);
  const [fontScale, setFontScaleState] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar preferências salvas
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const [savedTheme, savedFontScale] = await Promise.all([
        AsyncStorage.getItem("@theme_preference"),
        AsyncStorage.getItem("@font_scale_preference"),
      ]);

      if (savedTheme !== null) {
        setIsDark(savedTheme === "dark");
        logger.debug("[Theme] Loaded preference:", savedTheme);
      }

      if (savedFontScale !== null) {
        const scale = parseFloat(savedFontScale);
        if (!isNaN(scale) && scale >= 0.8 && scale <= 1.4) {
          setFontScaleState(scale);
          logger.debug("[FontScale] Loaded preference:", scale);
        }
      }
    } catch (error) {
      logger.error("[Theme] Error loading preferences:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveThemePreference = async (isDarkMode: boolean) => {
    try {
      await AsyncStorage.setItem(
        "@theme_preference",
        isDarkMode ? "dark" : "light",
      );
      logger.debug("[Theme] Saved preference:", isDarkMode ? "dark" : "light");
    } catch (error) {
      logger.error("[Theme] Error saving preference:", error);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    saveThemePreference(newTheme);
  };

  const setTheme = (isDarkMode: boolean) => {
    setIsDark(isDarkMode);
    saveThemePreference(isDarkMode);
  };

  const setFontScale = async (scale: number) => {
    // Limitar o scale entre 0.8 e 1.4
    const clampedScale = Math.max(0.8, Math.min(1.4, scale));
    setFontScaleState(clampedScale);

    try {
      await AsyncStorage.setItem(
        "@font_scale_preference",
        clampedScale.toString(),
      );
      logger.debug("[FontScale] Saved preference:", clampedScale);
    } catch (error) {
      logger.error("[FontScale] Error saving preference:", error);
    }
  };

  const getFontSize = (baseSize: number) => {
    return baseSize * fontScale;
  };

  const colors = isDark ? darkColors : lightColors;

  // Não renderizar até carregar a preferência
  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors,
        fontScale,
        toggleTheme,
        setTheme,
        setFontScale,
        getFontSize,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
