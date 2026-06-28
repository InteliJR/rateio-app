import React, { useEffect, useState } from "react";
import {
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../contexts/ThemeContext";
import {
  formatEditableNumber,
  parsePtBrNumber,
  sanitizePtBrNumberInput,
} from "../../lib/formatters";

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  assignedParticipants?: string[];
}

interface ItemCardProps {
  item: BillItem;
  onDelete: (id: string) => void;
  onUpdate?: (item: BillItem) => void;
  isActive?: boolean;
  onPress?: () => void;
}

export const ItemCard = React.memo(function ItemCard({
  item,
  onDelete,
  onUpdate,
  isActive = false,
  onPress,
}: ItemCardProps) {
  const { colors, getFontSize } = useTheme();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [price, setPrice] = useState(formatEditableNumber(item.price));
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setName(item.name);
    setQuantity(item.quantity.toString());
    setPrice(formatEditableNumber(item.price));
  }, [item.id, item.name, item.quantity, item.price]);

  const handleBlur = (field: "name" | "quantity" | "price") => {
    if (!onUpdate) return;

    let nextItem = { ...item };
    let hasChanges = false;

    if (field === "name") {
      const trimmed = name.trim();
      if (trimmed && trimmed !== item.name) {
        nextItem.name = trimmed;
        hasChanges = true;
      } else {
        setName(item.name);
      }

      setIsEditingName(false);
    }

    if (field === "quantity") {
      const parsedQuantity = parseInt(quantity, 10);
      if (!Number.isNaN(parsedQuantity) && parsedQuantity >= 1) {
        if (parsedQuantity !== item.quantity) {
          nextItem.quantity = parsedQuantity;
          hasChanges = true;
        }
      } else {
        setQuantity(item.quantity.toString());
      }
    }

    if (field === "price") {
      const parsedPrice = parsePtBrNumber(price);
      if (!Number.isNaN(parsedPrice) && parsedPrice >= 0) {
        if (parsedPrice !== item.price) {
          nextItem.price = parsedPrice;
          hasChanges = true;
        }
        setPrice(formatEditableNumber(parsedPrice));
      } else {
        setPrice(formatEditableNumber(item.price));
      }
    }

    if (hasChanges) {
      onUpdate(nextItem);
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
        <View style={styles.nameArea}>
          {isEditingName ? (
            <TextInput
              style={[
                styles.input,
                styles.nameInput,
                { color: colors.text, borderBottomColor: colors.divider },
              ]}
              value={name}
              onChangeText={setName}
              onBlur={() => handleBlur("name")}
              autoFocus
              selectTextOnFocus
              placeholder="Nome do item"
              placeholderTextColor={colors.placeholderText}
            />
          ) : (
            <TouchableOpacity
              style={styles.nameButton}
              onPress={() => setIsEditingName(true)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.nameText,
                  { color: colors.text, fontSize: getFontSize(16) },
                ]}
              >
                {name}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.detailsContainer}>
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
              onChangeText={(text) => setPrice(sanitizePtBrNumberInput(text))}
              onBlur={() => handleBlur("price")}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.placeholderText}
            />
          </View>

          {onPress && (
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
          )}
        </View>
      </View>
    </View>
  );
}, areItemCardPropsEqual);

function areItemCardPropsEqual(
  previous: ItemCardProps,
  next: ItemCardProps,
) {
  return (
    previous.item.id === next.item.id &&
    previous.item.name === next.item.name &&
    previous.item.quantity === next.item.quantity &&
    previous.item.price === next.item.price &&
    previous.isActive === next.isActive &&
    previous.onDelete === next.onDelete &&
    previous.onUpdate === next.onUpdate &&
    previous.onPress === next.onPress
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  deleteButton: {
    marginRight: 12,
    padding: 4,
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  nameArea: {
    flex: 1,
  },
  nameButton: {
    minHeight: 24,
    justifyContent: "center",
  },
  nameText: {
    fontWeight: "500",
    lineHeight: 22,
  },
  detailsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
  },
  input: {
    fontSize: 16,
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  nameInput: {
    width: "100%",
  },
  quantityInput: {
    textAlign: "center",
    width: 30,
  },
  priceInput: {
    textAlign: "right",
    minWidth: 60,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  suffix: {
    marginLeft: 2,
  },
  prefix: {
    marginRight: 2,
  },
  expandButton: {
    padding: 4,
    marginLeft: 4,
  },
});
