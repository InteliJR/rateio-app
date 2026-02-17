import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  StyleProp,
  TextStyle,
} from "react-native";
import { useTheme } from "../../contexts/ThemeContext";

interface NumericInputProps extends Omit<
  TextInputProps,
  "onChange" | "onChangeText" | "style"
> {
  label: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  min?: number;
  max?: number;
  style?: StyleProp<TextStyle>;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  label,
  value,
  onChange,
  error,
  min,
  max,
  style,
  ...props
}) => {
  const { colors } = useTheme();
  const handleChangeText = (text: string) => {
    if (text === "") {
      onChange(text);
      return;
    }

    const numericValue = text.replace(/[^0-9]/g, "");

    if (max !== undefined && Number(numericValue) > max) {
      return;
    }

    onChange(numericValue);
  };

  const handleBlur = (e: any) => {
    if (value !== "" && min !== undefined && Number(value) < min) {
      onChange(min.toString());
    }
    if (props.onBlur) {
      props.onBlur(e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBackground,
            borderBottomColor: colors.primary,
            color: colors.text,
          },
          error ? [styles.inputError, { borderColor: colors.error }] : null,
          style,
        ]}
        placeholderTextColor={colors.placeholderText}
        value={value}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        keyboardType="numeric"
        {...props}
      />
      {error && (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#81007F",
  },
  inputError: {
    borderColor: "#ff4d4d",
  },
  errorText: {
    color: "#ff4d4d",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 8,
  },
});
