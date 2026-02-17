import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BillItem } from "../items/ItemCard";
import { useTheme } from "../../contexts/ThemeContext";

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
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState({ name: "", quantity: "", value: "" });
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setQuantity("");
    setValue("");
    setErrors({ name: "", quantity: "", value: "" });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const formatCurrency = (text: string) => {
    // Remove non-numeric characters
    let numeric = text.replace(/[^0-9]/g, "");
    if (!numeric) return "";

    // Convert to decimal
    const amount = parseInt(numeric) / 100;

    // Format to BRL
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const handleValueChange = (text: string) => {
    // If deleting everything, clear it
    if (!text) {
      setValue("");
      return;
    }

    // If user is typing, we just take the numbers and reformat
    const numeric = text.replace(/[^0-9]/g, "");
    const formatted = formatCurrency(numeric);
    setValue(formatted);
    if (errors.value) setErrors((prev) => ({ ...prev, value: "" }));
  };

  const parseCurrency = (text: string): number => {
    const numeric = text.replace(/[^0-9]/g, "");
    return parseInt(numeric) / 100;
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

    // No frontend, `price` representa o VALOR UNITÁRIO
    onAdd({
      name: name.trim(),
      quantity: qty,
      price: unitPrice,
    });

    handleClose();
  };

  const renderForm = () => (
    <View style={styles.formContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Novo Item</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Nome</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
          errors.name ? styles.inputError : null,
          focusedField === "name" && [
            styles.inputFocused,
            { borderColor: colors.primary },
          ],
        ]}
        placeholder="Ex: Coca-cola"
        placeholderTextColor={colors.placeholderText}
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
        }}
        onFocus={() => setFocusedField("name")}
        onBlur={() => setFocusedField(null)}
        editable={true}
        underlineColorAndroid="transparent"
        selectionColor={colors.primary}
        importantForAutofill="no"
      />
      {errors.name ? (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {errors.name}
        </Text>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>Quantidade</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
          errors.quantity ? styles.inputError : null,
          focusedField === "quantity" && [
            styles.inputFocused,
            { borderColor: colors.primary },
          ],
        ]}
        placeholder="Ex: 2"
        placeholderTextColor={colors.placeholderText}
        value={quantity}
        onChangeText={(text) => {
          setQuantity(text.replace(/[^0-9]/g, ""));
          if (errors.quantity) setErrors((prev) => ({ ...prev, quantity: "" }));
        }}
        onFocus={() => setFocusedField("quantity")}
        onBlur={() => setFocusedField(null)}
        keyboardType="numeric"
        editable={true}
        underlineColorAndroid="transparent"
        selectionColor={colors.primary}
        importantForAutofill="no"
      />
      {errors.quantity ? (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {errors.quantity}
        </Text>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>Preço Unitário</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
          errors.value ? styles.inputError : null,
          focusedField === "value" && [
            styles.inputFocused,
            { borderColor: colors.primary },
          ],
        ]}
        placeholder="R$ 0,00"
        placeholderTextColor={colors.placeholderText}
        value={value}
        onChangeText={handleValueChange}
        onFocus={() => setFocusedField("value")}
        onBlur={() => setFocusedField(null)}
        keyboardType="numeric"
        editable={true}
        underlineColorAndroid="transparent"
        selectionColor={colors.primary}
        importantForAutofill="no"
      />
      {errors.value ? (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {errors.value}
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: colors.primary }]}
        onPress={handleAdd}
      >
        <Text style={[styles.addButtonText, { color: colors.accent }]}>
          Adicionar
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[
            styles.modalContent,
            { backgroundColor: colors.cardBackground },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.divider }]} />
          {renderForm()}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  overlayTouchable: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#ccc",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 24,
  },
  formContainer: {
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
  },
  label: {
    fontSize: 14,
    color: "#666",
    marginBottom: -8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#000",
    outlineStyle: "none",
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  inputFocused: {
    borderColor: "#8B2E8F",
    borderWidth: 1,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    outlineStyle: "none",
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  inputError: {
    borderColor: "#ff4444",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
    marginTop: -8,
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
