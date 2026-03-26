import React, { useMemo } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../contexts/ThemeContext";
import {
  buildDefaultAllocation,
  getAssignedQuantity,
  validateItemAllocations,
} from "../../../lib/rateio";
import { useRateioDraftStore } from "../../../store/rateioDraftStore";

export default function SplitScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    billId,
    participants,
    items,
    serviceFeePercentage,
    couvertValue,
    itemAllocations,
    serviceFeeConfig,
    couvertConfig,
    setItemAllocation,
    setFeeSelection,
  } = useRateioDraftStore();

  const issues = useMemo(
    () => validateItemAllocations(items, itemAllocations),
    [items, itemAllocations],
  );

  if (!billId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Nenhum rascunho de rateio disponivel.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => router.replace("/(tabs)/bills")}
        >
          <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
            Voltar ao historico
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleParticipantForItem = (itemId: string, participantId: string) => {
    const item = items.find((currentItem) => currentItem.id === itemId);
    const allocation =
      itemAllocations[itemId] ??
      buildDefaultAllocation(
        item!,
        participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
        })),
      );

    const isSelected = allocation.selectedParticipantIds.includes(participantId);
    const nextSelectedParticipantIds = isSelected
      ? allocation.selectedParticipantIds.filter((id) => id !== participantId)
      : [...allocation.selectedParticipantIds, participantId];

    setItemAllocation(itemId, {
      selectedParticipantIds: nextSelectedParticipantIds,
      quantities: {
        ...allocation.quantities,
        [participantId]: item && item.quantity > 1 && !isSelected
          ? allocation.quantities[participantId] ?? 0
          : isSelected
            ? 0
            : allocation.quantities[participantId] ?? 0,
      },
    });
  };

  const changeQuantity = (
    itemId: string,
    participantId: string,
    delta: number,
  ) => {
    const item = items.find((currentItem) => currentItem.id === itemId);
    if (!item || item.quantity <= 1) return;

    const allocation =
      itemAllocations[itemId] ??
      buildDefaultAllocation(
        item,
        participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
        })),
      );
    const currentQuantity = allocation.quantities[participantId] ?? 0;
    const currentAssigned = getAssignedQuantity(item, allocation);
    const nextQuantity = Math.max(0, currentQuantity + delta);
    const nextAssigned = currentAssigned - currentQuantity + nextQuantity;

    if (nextAssigned > item.quantity) {
      return;
    }

    const nextSelectedParticipantIds = allocation.selectedParticipantIds.includes(
      participantId,
    )
      ? allocation.selectedParticipantIds
      : [...allocation.selectedParticipantIds, participantId];

    setItemAllocation(itemId, {
      selectedParticipantIds: nextSelectedParticipantIds,
      quantities: {
        ...allocation.quantities,
        [participantId]: nextQuantity,
      },
    });
  };

  const toggleFeeParticipant = (
    feeType: "service" | "couvert",
    participantId: string,
  ) => {
    const selectedParticipantIds =
      feeType === "service"
        ? serviceFeeConfig.selectedParticipantIds
        : couvertConfig.selectedParticipantIds;

    const nextSelected = selectedParticipantIds.includes(participantId)
      ? selectedParticipantIds.filter((id) => id !== participantId)
      : [...selectedParticipantIds, participantId];

    setFeeSelection(feeType, nextSelected);
  };

  const handleContinue = () => {
    if (issues.length > 0) {
      Alert.alert("Rateio incompleto", issues[0].message);
      return;
    }

    router.push({
      pathname: "/(tabs)/(create)/summary",
      params: { id: billId },
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Rateio dos itens</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Todos comecam selecionados. Desmarque quem nao vai pagar.
        </Text>
      </View>

      {items.map((item) => {
        const allocation =
          itemAllocations[item.id] ??
          buildDefaultAllocation(
            item,
            participants.map((participant) => ({
              id: participant.id,
              name: participant.name,
            })),
          );
        const assignedQuantity = getAssignedQuantity(item, allocation);
        const remainingQuantity = Math.max(item.quantity - assignedQuantity, 0);

        return (
          <View
            key={item.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View style={styles.itemHeader}>
              <View style={styles.itemHeaderText}>
                <Text style={[styles.itemName, { color: colors.text }]}>
                  {item.name}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {item.quantity}x • R$ {item.price.toFixed(2).replace(".", ",")}
                </Text>
              </View>
              <View>
                <Text style={[styles.itemTotal, { color: colors.text }]}>
                  R$ {(item.quantity * item.price).toFixed(2).replace(".", ",")}
                </Text>
              </View>
            </View>

            {item.quantity > 1 && (
              <Text
                style={[
                  styles.helperText,
                  { color: remainingQuantity === 0 ? colors.success : colors.textSecondary },
                ]}
              >
                Atribuidas {assignedQuantity} de {item.quantity}. Restam {remainingQuantity}.
              </Text>
            )}

            <View style={styles.participantsList}>
              {participants.map((participant) => {
                const isSelected = allocation.selectedParticipantIds.includes(
                  participant.id,
                );
                const quantity = allocation.quantities[participant.id] ?? 0;

                return (
                  <View key={participant.id} style={styles.participantRow}>
                    <TouchableOpacity
                      style={styles.checkboxLabel}
                      onPress={() =>
                        toggleParticipantForItem(item.id, participant.id)
                      }
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: isSelected ? "#111111" : "#B7B7B7",
                            backgroundColor: isSelected ? "#111111" : "#E0E0E0",
                          },
                        ]}
                      >
                        {isSelected && (
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.participantName,
                          { color: isSelected ? colors.text : colors.textTertiary },
                        ]}
                      >
                        {participant.name}
                      </Text>
                    </TouchableOpacity>

                    {item.quantity > 1 && (
                      <View style={styles.quantityControl}>
                        <TouchableOpacity
                          style={[
                            styles.quantityButton,
                            { borderColor: colors.cardBorder },
                          ]}
                          onPress={() => changeQuantity(item.id, participant.id, -1)}
                        >
                          <Ionicons name="remove" size={16} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.quantityText, { color: colors.text }]}>
                          {quantity}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.quantityButton,
                            { borderColor: colors.cardBorder },
                          ]}
                          onPress={() => changeQuantity(item.id, participant.id, 1)}
                        >
                          <Ionicons name="add" size={16} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      {(serviceFeePercentage > 0 || couvertValue > 0) && (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Taxas adicionais
          </Text>

          {serviceFeePercentage > 0 && (
            <FeeSelector
              title={`Taxa de servico (${serviceFeePercentage}%)`}
              participants={participants}
              selectedParticipantIds={serviceFeeConfig.selectedParticipantIds}
              onToggle={(participantId) =>
                toggleFeeParticipant("service", participantId)
              }
              colors={colors}
            />
          )}

          {couvertValue > 0 && (
            <FeeSelector
              title={`Couvert artistico (R$ ${couvertValue
                .toFixed(2)
                .replace(".", ",")})`}
              participants={participants}
              selectedParticipantIds={couvertConfig.selectedParticipantIds}
              onToggle={(participantId) =>
                toggleFeeParticipant("couvert", participantId)
              }
              colors={colors}
            />
          )}
        </View>
      )}

      {issues.length > 0 && (
        <View style={[styles.errorCard, { backgroundColor: colors.warningLight }]}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {issues[0].message}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary },
          issues.length > 0 && styles.buttonDisabled,
        ]}
        onPress={handleContinue}
      >
        <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
          Revisar resumo final
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function FeeSelector({
  title,
  participants,
  selectedParticipantIds,
  onToggle,
  colors,
}: {
  title: string;
  participants: { id: string; name: string }[];
  selectedParticipantIds: string[];
  onToggle: (participantId: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.feeBlock}>
      <Text style={[styles.feeTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.feeChips}>
        {participants.map((participant) => {
          const isSelected = selectedParticipantIds.includes(participant.id);
          return (
            <TouchableOpacity
              key={participant.id}
              style={[
                styles.feeChip,
                {
                  backgroundColor: isSelected ? "#111111" : "#E0E0E0",
                  borderColor: isSelected ? "#111111" : "#C9C9C9",
                },
              ]}
              onPress={() => onToggle(participant.id)}
            >
              <Text
                style={[
                  styles.feeChipText,
                  { color: isSelected ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {participant.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 36,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  itemHeaderText: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "600",
  },
  itemMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 13,
  },
  participantsList: {
    gap: 10,
  },
  participantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  checkboxLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  participantName: {
    fontSize: 15,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: {
    minWidth: 18,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  feeBlock: {
    gap: 10,
  },
  feeTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  feeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  feeChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  errorCard: {
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
