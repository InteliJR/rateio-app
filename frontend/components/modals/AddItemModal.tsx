import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BillItem } from "../items/ItemCard";
import { useTheme } from "../../contexts/ThemeContext";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: Omit<BillItem, "id" | "assignedParticipants">) => void;
}

export const AddItemModal: React.FC<AddItemModalProps> = ({
  visible,
  onClose,
  onAdd,
}) => {
  const { colors, getFontSize } = useTheme();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState({ name: "", quantity: "", value: "" });
  const nameInputRef = useRef<TextInput>(null);

  // Reset form quando modal fecha
  useEffect(() => {
    if (!visible) {
      setName("");
      setQuantity("");
      setValue("");
      setErrors({ name: "", quantity: "", value: "" });
    }
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const formatCurrency = (text: string) => {
    let numeric = text.replace(/[^0-9]/g, "");
    if (!numeric) return "";
    const amount = parseInt(numeric) / 100;
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const handleValueChange = (text: string) => {
    if (!text) {
      setValue("");
      return;
    }
    const numeric = text.replace(/[^0-9]/g, "");
    const formatted = formatCurrency(numeric);
    setValue(formatted);
    if (errors.value) setErrors((prev) => ({ ...prev, value: "" }));
  };

  const parseCurrency = (text: string): number => {
    const numeric = text.replace(/[^0-9]/g, "");
    return parseInt(numeric || "0") / 100;
  };

  const validate = () => {
    const newErrors = { name: "", quantity: "", value: "" };
    let isValid = true;

    if (!name.trim()) {
      newErrors.name = "Nome é obrigatório";
      isValid = false;
    }

    if (!quantity.trim()) {
      newErrors.quantity = "Quantidade é obrigatória";
      isValid = false;
    } else if (parseInt(quantity) <= 0) {
      newErrors.quantity = "Quantidade deve ser maior que 0";
      isValid = false;
    }

    if (!value.trim()) {
      newErrors.value = "Valor é obrigatório";
      isValid = false;
    } else if (parseCurrency(value) <= 0) {
      newErrors.value = "Valor deve ser maior que 0";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleAdd = () => {
    if (!validate()) return;

    const unitPrice = parseCurrency(value);
    const qty = parseInt(quantity);

    onAdd({
      name: name.trim(),
      quantity: qty,
      price: unitPrice,
    });

    Keyboard.dismiss();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        {/* Backdrop escuro */}
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={handleClose}
        />

        {/* Conteúdo do modal */}
        <View style={styles.modalContainer}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.divider }]} />

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.title,
                  { color: colors.text, fontSize: getFontSize(18) },
                ]}
              >
                Novo Item
              </Text>
              <View style={{ width: 32 }} />
            </View>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text
                  style={[
                    styles.label,
                    { color: colors.text, fontSize: getFontSize(14) },
                  ]}
                >
                  Nome
                </Text>
                <TextInput
                  ref={nameInputRef}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      borderColor: errors.name ? colors.error : colors.inputBorder,
                    },
                    errors.name && styles.inputError,
                  ]}
                  placeholder="Ex: Coca-cola"
                  placeholderTextColor={colors.placeholderText}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (errors.name)
                      setErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  returnKeyType="next"
                />
                {errors.name ? (
                  <Text
                    style={[
                      styles.errorText,
                      { color: colors.error, fontSize: getFontSize(12) },
                    ]}
                  >
                    {errors.name}
                  </Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text
                  style={[
                    styles.label,
                    { color: colors.text, fontSize: getFontSize(14) },
                  ]}
                >
                  Quantidade
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      borderColor: errors.quantity
                        ? colors.error
                        : colors.inputBorder,
                    },
                    errors.quantity && styles.inputError,
                  ]}
                  placeholder="Ex: 2"
                  placeholderTextColor={colors.placeholderText}
                  value={quantity}
                  onChangeText={(text) => {
                    setQuantity(text.replace(/[^0-9]/g, ""));
                    if (errors.quantity)
                      setErrors((prev) => ({ ...prev, quantity: "" }));
                  }}
                  keyboardType="numeric"
                  returnKeyType="next"
                />
                {errors.quantity ? (
                  <Text
                    style={[
                      styles.errorText,
                      { color: colors.error, fontSize: getFontSize(12) },
                    ]}
                  >
                    {errors.quantity}
                  </Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text
                  style={[
                    styles.label,
                    { color: colors.text, fontSize: getFontSize(14) },
                  ]}
                >
                  Preço Unitário
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      borderColor: errors.value ? colors.error : colors.inputBorder,
                    },
                    errors.value && styles.inputError,
                  ]}
                  placeholder="R$ 0,00"
                  placeholderTextColor={colors.placeholderText}
                  value={value}
                  onChangeText={handleValueChange}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={handleAdd}
                />
                {errors.value ? (
                  <Text
                    style={[
                      styles.errorText,
                      { color: colors.error, fontSize: getFontSize(12) },
                    ]}
                  >
                    {errors.value}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={handleAdd}
              >
                <Text
                  style={[
                    styles.addButtonText,
                    { color: colors.accent, fontSize: getFontSize(16) },
                  ]}
                >
                  Adicionar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#ddd",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#000",
  },
  inputError: {
    borderColor: "#ff4444",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
  },
  addButton: {
    backgroundColor: "#81007F",
    padding: 16,
    borderRadius: 28,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: {
    color: "#FFFF00",
    fontSize: 16,
    fontWeight: "bold",
  },
});
