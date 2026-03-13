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
  prefix?: string;
  suffix?: string;
  allowDecimal?: boolean;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  label,
  value,
  onChange,
  error,
  min,
  max,
  style,
  prefix,
  suffix,
  allowDecimal = false,
  ...props
}) => {
  const { colors, getFontSize } = useTheme();
  const handleChangeText = (text: string) => {
    if (text === "") {
      onChange(text);
      return;
    }

    let numericValue: string;

    if (allowDecimal) {
      // Permite números e um ponto decimal
      numericValue = text.replace(/[^0-9.]/g, "");
      // Garante apenas um ponto decimal
      const parts = numericValue.split(".");
      if (parts.length > 2) {
        numericValue = parts[0] + "." + parts.slice(1).join("");
      }
      // Limita casas decimais a 2
      if (parts.length === 2 && parts[1].length > 2) {
        numericValue = parts[0] + "." + parts[1].slice(0, 2);
      }
    } else {
      numericValue = text.replace(/[^0-9]/g, "");
    }

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
      <Text
        style={[
          styles.label,
          { color: colors.text, fontSize: getFontSize(14) },
        ]}
      >
        {label}
      </Text>
      <View style={styles.inputWrapper}>
        {prefix && (
          <Text style={[styles.prefix, { color: colors.textSecondary }]}>
            {prefix}
          </Text>
        )}
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBackground,
              borderBottomColor: colors.primary,
              color: colors.text,
            },
            prefix && styles.inputWithPrefix,
            suffix && styles.inputWithSuffix,
            error ? [styles.inputError, { borderColor: colors.error }] : null,
            style,
          ]}
          placeholderTextColor={colors.placeholderText}
          value={value}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          keyboardType={allowDecimal ? "decimal-pad" : "numeric"}
          {...props}
        />
        {suffix && (
          <Text style={[styles.suffix, { color: colors.textSecondary }]}>
            {suffix}
          </Text>
        )}
      </View>
      {error && (
        <Text
          style={[
            styles.errorText,
            { color: colors.error, fontSize: getFontSize(12) },
          ]}
        >
          {error}
        </Text>
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
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#81007F",
  },
  inputWithPrefix: {
    paddingLeft: 8,
  },
  inputWithSuffix: {
    paddingRight: 8,
  },
  inputError: {
    borderColor: "#ff4d4d",
  },
  prefix: {
    fontSize: 16,
    color: "#666",
    marginRight: 4,
  },
  suffix: {
    fontSize: 16,
    color: "#666",
    marginLeft: 4,
  },
  errorText: {
    color: "#ff4d4d",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 8,
  },
});
