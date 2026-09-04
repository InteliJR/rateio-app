import React, { useCallback, useMemo, useState } from "react";
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
import { AddItemModal } from "../../../components/modals/AddItemModal";
import { BillItem, ItemCard } from "../../../components/items/ItemCard";
import { useTheme } from "../../../contexts/ThemeContext";
import {
  buildDefaultAllocation,
  getAssignedQuantity,
  getSharedQuantity,
  validateItemAllocations,
} from "../../../lib/rateio";
import { formatCurrency } from "../../../lib/formatters";
import {
  formatItemQuantity,
  getItemTotalPrice,
  isMeasuredItem,
} from "../../../lib/measurementUnits";
import itemsService from "../../../services/items.service";
import { useRateioDraftStore } from "../../../store/rateioDraftStore";

export default function SplitScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    billId,
    billName,
    participants,
    items,
    serviceFeePercentage,
    serviceFeeConfig,
    couvertValue,
    itemAllocations,
    setBillMeta,
    setItemAllocation,
    setFeeSelection,
  } = useRateioDraftStore();
  const [addItemVisible, setAddItemVisible] = useState(false);

  const validParticipantIds = useMemo(
    () => new Set(participants.map((participant) => participant.id)),
    [participants],
  );

  const issues = useMemo(
    () => validateItemAllocations(items, itemAllocations, participants),
    [items, itemAllocations, participants],
  );
  const serviceFeePayerCount = useMemo(
    () =>
      serviceFeeConfig.selectedParticipantIds.filter((participantId) =>
        validParticipantIds.has(participantId),
      ).length,
    [serviceFeeConfig.selectedParticipantIds, validParticipantIds],
  );

  const serviceFeeDescription =
    serviceFeePayerCount === 0
      ? "Selecione quem vai pagar a taxa sobre o próprio subtotal."
      : serviceFeePayerCount === 1
        ? "A taxa de serviço será paga pela pessoa selecionada."
        : `A taxa de serviço será dividida entre as ${serviceFeePayerCount} pessoas selecionadas.`;

  const syncDraftItems = useCallback(
    (nextItems: BillItem[]) => {
      setBillMeta({
        billName,
        participants,
        items: nextItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          measurementUnit: item.measurementUnit,
          price: item.price,
          totalPrice: item.totalPrice,
        })),
        serviceFeePercentage,
        couvertValue,
      });
    },
    [billName, participants, serviceFeePercentage, couvertValue, setBillMeta],
  );

  const reloadItemsFromBackend = useCallback(async () => {
    if (!billId) return;

    const refreshedItems = await itemsService.getItems(billId);
    syncDraftItems(refreshedItems);
  }, [billId, syncDraftItems]);

  const getAllocationForItem = (itemId: string) => {
    const item = items.find((currentItem) => currentItem.id === itemId);
    if (!item) return undefined;

    return (
      itemAllocations[itemId] ??
      buildDefaultAllocation(
        item,
        participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
        })),
      )
    );
  };

  const changeParticipantQuantity = (
    itemId: string,
    participantId: string,
    delta: number,
  ) => {
    const item = items.find((currentItem) => currentItem.id === itemId);
    const allocation = getAllocationForItem(itemId);
    if (!item || !allocation) return;

    const currentQuantity = allocation.quantities[participantId] ?? 0;
    const nextQuantity = Math.max(
      0,
      Math.min(item.quantity, currentQuantity + delta),
    );
    const nextSelectedParticipantIds =
      nextQuantity > 0
        ? allocation.selectedParticipantIds.includes(participantId)
          ? allocation.selectedParticipantIds
          : [...allocation.selectedParticipantIds, participantId]
        : allocation.selectedParticipantIds.filter(
            (id) => id !== participantId,
          );

    setItemAllocation(itemId, {
      selectedParticipantIds: nextSelectedParticipantIds,
      quantities: {
        ...allocation.quantities,
        [participantId]: nextQuantity,
      },
    });
  };

  const toggleParticipantForItem = (itemId: string, participantId: string) => {
    const item = items.find((currentItem) => currentItem.id === itemId);
    const allocation = getAllocationForItem(itemId);
    if (!item || !allocation) return;

    const currentQuantity = allocation.quantities[participantId] ?? 0;
    const measured = isMeasuredItem(item);
    const isParticipantIncluded =
      allocation.selectedParticipantIds.includes(participantId);
    const isSelected = measured ? isParticipantIncluded : currentQuantity > 0;
    const nextSelectedParticipantIds = isSelected
      ? allocation.selectedParticipantIds.filter((id) => id !== participantId)
      : isParticipantIncluded
        ? allocation.selectedParticipantIds
        : [...allocation.selectedParticipantIds, participantId];

    setItemAllocation(itemId, {
      selectedParticipantIds: nextSelectedParticipantIds,
      quantities: {
        ...allocation.quantities,
        [participantId]:
          measured || item.quantity === 1
            ? Number(!isSelected)
            : isSelected
              ? 0
              : item.quantity,
      },
    });
  };

  const toggleAllParticipantsForItem = (itemId: string) => {
    const item = items.find((currentItem) => currentItem.id === itemId);
    const allocation = getAllocationForItem(itemId);
    if (!item || !allocation || participants.length === 0) return;

    const measured = isMeasuredItem(item);
    const areAllSelected = participants.every((participant) =>
      measured
        ? allocation.selectedParticipantIds.includes(participant.id)
        : (allocation.quantities[participant.id] ?? 0) > 0,
    );

    const quantities = participants.reduce<Record<string, number>>(
      (nextQuantities, participant) => {
        const currentQuantity = allocation.quantities[participant.id] ?? 0;
        nextQuantities[participant.id] = areAllSelected
          ? 0
          : measured
            ? 1
            : currentQuantity > 0
              ? currentQuantity
              : item.quantity;
        return nextQuantities;
      },
      { ...allocation.quantities },
    );

    setItemAllocation(itemId, {
      selectedParticipantIds: areAllSelected
        ? []
        : participants.map((participant) => participant.id),
      quantities,
    });
  };

  const toggleServiceFeeParticipant = (participantId: string) => {
    const selectedParticipantIds = serviceFeeConfig.selectedParticipantIds;
    const nextSelected = selectedParticipantIds.includes(participantId)
      ? selectedParticipantIds.filter((id) => id !== participantId)
      : [...selectedParticipantIds, participantId];

    setFeeSelection("service", nextSelected);
  };

  const handleAddItem = useCallback(
    async (item: Omit<BillItem, "id" | "assignedParticipants">) => {
      if (!billId) return;

      try {
        const created = await itemsService.createItem(billId, item);
        syncDraftItems([
          ...items.map((currentItem) => ({
            ...currentItem,
            assignedParticipants: [],
          })),
          created,
        ]);
      } catch (error: any) {
        Alert.alert(
          "Erro",
          error.message || "Não foi possível adicionar item.",
        );
      }
    },
    [billId, items, syncDraftItems],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!billId) return;

      try {
        await itemsService.deleteItem(billId, itemId);
        syncDraftItems(
          items
            .filter((item) => item.id !== itemId)
            .map((item) => ({ ...item, assignedParticipants: [] })),
        );
      } catch (error: any) {
        Alert.alert("Erro", error.message || "Não foi possível remover item.");
      }
    },
    [billId, items, syncDraftItems],
  );

  const handleUpdateItem = useCallback(
    async (updatedItem: BillItem) => {
      if (!billId) return;

      const currentItem = items.find((item) => item.id === updatedItem.id);
      if (!currentItem) return;

      const previousItems = items.map((item) => ({
        ...item,
        assignedParticipants: [],
      }));
      const optimisticItems = items.map((item) =>
        item.id === updatedItem.id
          ? { ...updatedItem, assignedParticipants: [] }
          : { ...item, assignedParticipants: [] },
      );

      syncDraftItems(optimisticItems);

      try {
        if (currentItem.name !== updatedItem.name) {
          await itemsService.updateItemName(
            billId,
            updatedItem.id,
            updatedItem.name,
          );
        }

        if (currentItem.quantity !== updatedItem.quantity) {
          await itemsService.updateItemQuantity(
            billId,
            updatedItem.id,
            updatedItem.quantity,
          );
        }

        if (currentItem.measurementUnit !== updatedItem.measurementUnit) {
          await itemsService.updateItemMeasurementUnit(
            billId,
            updatedItem.id,
            updatedItem.measurementUnit,
          );
        }

        if (currentItem.price !== updatedItem.price) {
          await itemsService.updateItemPrice(
            billId,
            updatedItem.id,
            updatedItem.price,
          );
        }
      } catch (error: any) {
        syncDraftItems(previousItems);
        Alert.alert(
          "Erro",
          error.message || "Não foi possível atualizar item.",
        );
        await reloadItemsFromBackend();
      }
    },
    [billId, items, reloadItemsFromBackend, syncDraftItems],
  );

  const handleContinue = () => {
    if (!billId) {
      return;
    }

    if (items.length === 0) {
      Alert.alert("Atenção", "Adicione pelo menos um item para continuar.");
      return;
    }

    if (issues.length > 0) {
      Alert.alert("Rateio incompleto", issues[0].message);
      return;
    }

    router.push({
      pathname: "/(tabs)/(create)/summary",
      params: { id: billId },
    });
  };

  if (!billId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Nenhum rascunho de rateio disponível.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => router.replace("/(tabs)/bills")}
        >
          <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
            Voltar ao histórico
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        <Text style={[styles.backLinkText, { color: colors.textSecondary }]}>
          Voltar
        </Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Itens da conta
          </Text>
          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: colors.primary }]}
            onPress={() => setAddItemVisible(true)}
          >
            <Text style={[styles.outlineButtonText, { color: colors.primary }]}>
              Adicionar item
            </Text>
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text
              style={[styles.emptyCardText, { color: colors.textSecondary }]}
            >
              Adicione os itens da conta antes de fazer o rateio.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onDelete={handleDeleteItem}
              onUpdate={handleUpdateItem}
            />
          ))
        )}
      </View>

      <View
        style={[styles.sectionDivider, { backgroundColor: colors.primary }]}
      />

      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Rateio dos itens
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Selecione quem vai pagar cada item.
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Informe quantas unidades cada pessoa pagou.
        </Text>
      </View>

      {items.map((item) => {
        const allocation = getAllocationForItem(item.id);
        if (!allocation) return null;

        const measured = isMeasuredItem(item);
        const itemTotal = getItemTotalPrice(item);
        const assignedQuantity = getAssignedQuantity(
          item,
          allocation,
          validParticipantIds,
        );
        const sharedQuantity = getSharedQuantity(
          item,
          allocation,
          validParticipantIds,
        );
        const areAllParticipantsSelected =
          participants.length > 0 &&
          participants.every((participant) =>
            measured
              ? allocation.selectedParticipantIds.includes(participant.id)
              : (allocation.quantities[participant.id] ?? 0) > 0,
          );

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
                <Text
                  style={[styles.itemName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  style={[styles.itemMeta, { color: colors.textSecondary }]}
                >
                  {formatItemQuantity(item.quantity, item.measurementUnit)} •{" "}
                  {formatCurrency(item.price)} por{" "}
                  {formatItemQuantity(1, item.measurementUnit)}
                </Text>
              </View>
              <Text style={[styles.itemTotal, { color: colors.text }]}>
                {formatCurrency(itemTotal)}
              </Text>
            </View>

            <View style={styles.helperBlock}>
              {measured ? (
                <Text
                  style={[styles.helperText, { color: colors.textSecondary }]}
                >
                  O valor total será dividido igualmente entre as pessoas
                  selecionadas.
                </Text>
              ) : assignedQuantity < item.quantity ? (
                <Text
                  style={[styles.helperText, { color: colors.textSecondary }]}
                >
                  Restam {item.quantity - assignedQuantity} unidade
                  {item.quantity - assignedQuantity !== 1 ? "s" : ""} para
                  cobrir.
                </Text>
              ) : null}
            </View>

            <View style={styles.selectionHeader}>
              <Text style={[styles.selectionTitle, { color: colors.text }]}>
                Pessoas
              </Text>
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={() => toggleAllParticipantsForItem(item.id)}
                accessibilityRole="button"
                accessibilityLabel={
                  areAllParticipantsSelected
                    ? `Desmarcar todas as pessoas de ${item.name}`
                    : `Selecionar todas as pessoas para ${item.name}`
                }
              >
                <Ionicons
                  name={
                    areAllParticipantsSelected
                      ? "checkbox-outline"
                      : "square-outline"
                  }
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.selectAllText, { color: colors.primary }]}>
                  {areAllParticipantsSelected
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.participantsList}>
              {participants.map((participant) => {
                const quantityValue =
                  allocation.quantities[participant.id] ?? 0;
                const isSelected = measured
                  ? allocation.selectedParticipantIds.includes(participant.id)
                  : quantityValue > 0;

                return (
                  <View key={participant.id} style={styles.participantBlock}>
                    <View style={styles.participantRow}>
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
                              backgroundColor: isSelected
                                ? "#111111"
                                : "#E0E0E0",
                            },
                          ]}
                        >
                          {isSelected && (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color="#FFFFFF"
                            />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.participantName,
                            {
                              color: isSelected
                                ? colors.text
                                : colors.textTertiary,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {participant.name}
                        </Text>
                      </TouchableOpacity>

                      {!measured && item.quantity > 1 && (
                        <View style={styles.quantityControl}>
                          <TouchableOpacity
                            style={[
                              styles.quantityButton,
                              {
                                borderColor: colors.cardBorder,
                                opacity: quantityValue === 0 ? 0.5 : 1,
                              },
                            ]}
                            onPress={() =>
                              changeParticipantQuantity(
                                item.id,
                                participant.id,
                                -1,
                              )
                            }
                            disabled={quantityValue === 0}
                          >
                            <Ionicons
                              name="remove"
                              size={16}
                              color={colors.text}
                            />
                          </TouchableOpacity>
                          <Text
                            style={[
                              styles.quantityText,
                              { color: colors.text },
                            ]}
                          >
                            {quantityValue}
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.quantityButton,
                              {
                                borderColor: colors.cardBorder,
                                opacity:
                                  quantityValue >= item.quantity ? 0.5 : 1,
                              },
                            ]}
                            onPress={() =>
                              changeParticipantQuantity(
                                item.id,
                                participant.id,
                                1,
                              )
                            }
                            disabled={quantityValue >= item.quantity}
                          >
                            <Ionicons
                              name="add"
                              size={16}
                              color={colors.text}
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
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
              title={`Taxa de serviço (${serviceFeePercentage}%)`}
              description={serviceFeeDescription}
              participants={participants}
              selectedParticipantIds={serviceFeeConfig.selectedParticipantIds}
              onToggle={toggleServiceFeeParticipant}
              colors={colors}
            />
          )}

          {couvertValue > 0 && (
            <View style={styles.feeBlock}>
              <Text style={[styles.feeTitle, { color: colors.text }]}>
                {`Couvert artístico (${formatCurrency(couvertValue)})`}
              </Text>
              <Text
                style={[styles.feeInfoText, { color: colors.textSecondary }]}
              >
                O couvert é obrigatório e pago por todos os participantes da
                conta.
              </Text>
            </View>
          )}
        </View>
      )}

      {(items.length === 0 || issues.length > 0) && (
        <View
          style={[styles.errorCard, { backgroundColor: colors.warningLight }]}
        >
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {items.length === 0
              ? "Adicione pelo menos um item antes de seguir para o resumo."
              : issues[0].message}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary },
          (items.length === 0 || issues.length > 0) && styles.buttonDisabled,
        ]}
        onPress={handleContinue}
      >
        <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
          Revisar resumo final
        </Text>
      </TouchableOpacity>

      <AddItemModal
        visible={addItemVisible}
        onClose={() => setAddItemVisible(false)}
        onAdd={handleAddItem}
      />
    </ScrollView>
  );
}

function FeeSelector({
  title,
  description,
  participants,
  selectedParticipantIds,
  onToggle,
  colors,
}: {
  title: string;
  description?: string;
  participants: { id: string; name: string }[];
  selectedParticipantIds: string[];
  onToggle: (participantId: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.feeBlock}>
      <Text style={[styles.feeTitle, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.feeInfoText, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      <View style={styles.feeChips}>
        {participants.map((participant) => {
          const isSelected = selectedParticipantIds.includes(participant.id);

          return (
            <TouchableOpacity
              key={participant.id}
              style={[
                styles.feeChip,
                {
                  backgroundColor: isSelected
                    ? colors.selectionChipActiveBackground
                    : colors.selectionChipInactiveBackground,
                  borderColor: isSelected
                    ? colors.selectionChipActiveBorder
                    : colors.selectionChipInactiveBorder,
                },
              ]}
              onPress={() => onToggle(participant.id)}
            >
              <Text
                style={[
                  styles.feeChipText,
                  {
                    color: isSelected
                      ? colors.selectionChipActiveText
                      : colors.selectionChipInactiveText,
                  },
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
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: "500",
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  outlineButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  outlineButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  emptyCardText: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionDivider: {
    height: 3,
    borderRadius: 999,
    opacity: 0.75,
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
  helperBlock: {
    gap: 2,
  },
  helperText: {
    fontSize: 13,
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  selectionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  participantsList: {
    gap: 10,
  },
  participantBlock: {
    gap: 4,
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
    flex: 1,
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
  feeBlock: {
    gap: 10,
  },
  feeTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  feeInfoText: {
    fontSize: 14,
    lineHeight: 20,
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
