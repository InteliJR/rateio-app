import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  assignedParticipants: string[];
}

interface ItemCardProps {
  item: BillItem;
  onDelete: (id: string) => void;
  onUpdate?: (item: BillItem) => void;
  isActive?: boolean;
  onPress?: () => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onDelete,
  onUpdate,
  isActive = false,
  onPress,
}) => {
  const { colors, getFontSize } = useTheme();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [price, setPrice] = useState(item.price.toFixed(2));

  // Update local state when props change
  useEffect(() => {
    setName(item.name);
    setQuantity(item.quantity.toString());
    setPrice(item.price.toFixed(2));
  }, [item]);

  const handleBlur = (field: "name" | "quantity" | "price") => {
    if (!onUpdate) return;

    let newItem = { ...item };
    let hasChanges = false;

    if (field === "name") {
      const trimmed = name.trim();
      if (trimmed && trimmed !== item.name) {
        newItem.name = trimmed;
        hasChanges = true;
      }
    } else if (field === "quantity") {
      const qty = parseInt(quantity, 10);
      if (!isNaN(qty) && qty >= 1 && qty !== item.quantity) {
        newItem.quantity = qty;
        hasChanges = true;
      } else {
        // Revert invalid
        setQuantity(item.quantity.toString());
      }
    } else if (field === "price") {
      const normalized = price.replace(",", ".");
      const val = parseFloat(normalized);
      if (!isNaN(val) && val >= 0 && val !== item.price) {
        newItem.price = val;
        hasChanges = true;
      } else {
        // Revert invalid
        setPrice(item.price.toFixed(2));
      }
    }

    if (hasChanges) {
      onUpdate(newItem);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={20} color={colors.iconColor} />
      </TouchableOpacity>

      <View style={styles.contentContainer}>
        {/* Espaço clicável para expandir participants, exceto nos inputs */}
        <TouchableOpacity
          style={styles.expandArea}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {/* Nome */}
          <TextInput
            style={[
              styles.input,
              styles.nameInput,
              { color: colors.text, borderBottomColor: colors.divider },
            ]}
            value={name}
            onChangeText={setName}
            onBlur={() => handleBlur("name")}
            placeholder="Nome do item"
            placeholderTextColor={colors.placeholderText}
          />
        </TouchableOpacity>

        <View style={styles.detailsContainer}>
          {/* Quantidade */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={[
                styles.input,
                styles.quantityInput,
                { color: colors.text, borderBottomColor: colors.divider },
              ]}
              value={quantity}
              onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ""))}
              onBlur={() => handleBlur("quantity")}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text
              style={[
                styles.suffix,
                { fontSize: getFontSize(16), color: colors.textSecondary },
              ]}
            >
              x
            </Text>
          </View>

          {/* Preço */}
          <View style={styles.inputWrapper}>
            <Text
              style={[
                styles.prefix,
                { fontSize: getFontSize(14), color: colors.textSecondary },
              ]}
            >
              R$
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.priceInput,
                { color: colors.text, borderBottomColor: colors.divider },
              ]}
              value={price}
              onChangeText={(text) => setPrice(text.replace(/[^0-9,.]/g, ""))}
              onBlur={() => handleBlur("price")}
              keyboardType="numeric"
            />
          </View>

          {/* Botão de Expandir */}
          <TouchableOpacity
            style={styles.expandButton}
            onPress={onPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isActive ? "caret-down" : "caret-forward"}
              size={20}
              color={colors.iconColor}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  deleteButton: {
    marginRight: 12,
    padding: 4,
  },
  contentContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expandArea: {
    flex: 1,
    marginRight: 8,
  },
  detailsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    fontSize: 16,
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: "transparent", // Looks cleaner, can add color on focus if needed
  },
  nameInput: {
    width: "100%",
  },
  quantityInput: {
    textAlign: "center",
    width: 30,
    borderBottomWidth: 1,
  },
  priceInput: {
    textAlign: "right",
    minWidth: 60,
    borderBottomWidth: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  suffix: {
    fontSize: 16,
    marginLeft: 2,
  },
  prefix: {
    fontSize: 14,
    marginRight: 2,
  },
  expandButton: {
    padding: 4,
    marginLeft: 4,
  },
});
