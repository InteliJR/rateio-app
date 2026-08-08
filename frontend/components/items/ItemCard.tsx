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
  round2,
  sanitizePtBrNumberInput,
} from "../../lib/formatters";
import {
  MAX_ITEM_QUANTITY,
  MAX_MONEY_VALUE,
  MEASUREMENT_UNIT_OPTIONS,
  MeasurementUnit,
  getMeasurementUnitLabel,
} from "../../lib/measurementUnits";

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  measurementUnit: MeasurementUnit;
  price: number;
  totalPrice: number;
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
  const [quantity, setQuantity] = useState(
    formatEditableNumber(item.quantity, 3),
  );
  const [price, setPrice] = useState(formatEditableNumber(item.price));
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setName(item.name);
    setQuantity(formatEditableNumber(item.quantity, 3));
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
      const parsedQuantity = parsePtBrNumber(quantity);
      if (parsedQuantity >= 0.001 && parsedQuantity <= MAX_ITEM_QUANTITY) {
        if (parsedQuantity !== item.quantity) {
          nextItem.quantity = parsedQuantity;
          hasChanges = true;
        }
        setQuantity(formatEditableNumber(parsedQuantity, 3));
      } else {
        setQuantity(formatEditableNumber(item.quantity, 3));
      }
    }

    if (field === "price") {
      const parsedPrice = parsePtBrNumber(price);
      if (parsedPrice > 0 && parsedPrice <= MAX_MONEY_VALUE) {
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
      nextItem.totalPrice = round2(nextItem.quantity * nextItem.price);
      onUpdate(nextItem);
    }
  };

  const handleUnitChange = (measurementUnit: MeasurementUnit) => {
    if (!onUpdate || measurementUnit === item.measurementUnit) return;
    onUpdate({ ...item, measurementUnit });
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
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
              onChangeText={(text) =>
                setQuantity(sanitizePtBrNumberInput(text, 3))
              }
              onBlur={() => handleBlur("quantity")}
              keyboardType="decimal-pad"
              maxLength={12}
            />
            <Text
              style={[
                styles.suffix,
                { fontSize: getFontSize(16), color: colors.textSecondary },
              ]}
            >
              {getMeasurementUnitLabel(item.measurementUnit)}
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

        {onUpdate && (
          <View style={styles.unitOptions}>
            {MEASUREMENT_UNIT_OPTIONS.map((option) => {
              const isSelected = option.value === item.measurementUnit;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.unitOption,
                    {
                      borderColor: isSelected
                        ? colors.primary
                        : colors.cardBorder,
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.inputBackground,
                    },
                  ]}
                  onPress={() => handleUnitChange(option.value)}
                >
                  <Text
                    style={{
                      color: isSelected ? colors.accent : colors.textSecondary,
                      fontSize: getFontSize(12),
                      fontWeight: "600",
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}, areItemCardPropsEqual);

function areItemCardPropsEqual(previous: ItemCardProps, next: ItemCardProps) {
  return (
    previous.item.id === next.item.id &&
    previous.item.name === next.item.name &&
    previous.item.quantity === next.item.quantity &&
    previous.item.measurementUnit === next.item.measurementUnit &&
    previous.item.price === next.item.price &&
    previous.item.totalPrice === next.item.totalPrice &&
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
    minWidth: 48,
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
  unitOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  unitOption: {
    minWidth: 38,
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
});
