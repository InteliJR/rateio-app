import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AddItemModal } from "../../../components/modals/AddItemModal";
import { ItemCard, BillItem } from "../../../components/items/ItemCard";
import { useTheme } from "../../../contexts/ThemeContext";
import { buildDefaultAllocation, parseFeeParticipantIds } from "../../../lib/rateio";
import billService from "../../../services/bill.service";
import feesService, { Fee, FeeType } from "../../../services/fees.service";
import itemsService from "../../../services/items.service";
import participantsService, {
  Participant,
} from "../../../services/participants.service";
import { useRateioDraftStore } from "../../../store/rateioDraftStore";

type BillStatus =
  | "PENDING_OCR"
  | "OCR_FAILED"
  | "REVIEWING"
  | "DIVIDING"
  | "COMPLETED";

export default function ScannedBillScreen() {
  const { colors, getFontSize } = useTheme();
  const router = useRouter();
  const { id, editMode } = useLocalSearchParams<{ id: string; editMode?: string }>();
  const initializeDraft = useRateioDraftStore((state) => state.initializeDraft);
  const draftAllocations = useRateioDraftStore((state) => state.itemAllocations);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [billStatus, setBillStatus] = useState<BillStatus | null>(null);

  const [billName, setBillName] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [serviceFeeInput, setServiceFeeInput] = useState("0,00%");
  const [couvertInput, setCouvertInput] = useState("R$ 0,00");

  const parseCurrency = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, "");
    return parseInt(numeric || "0", 10) / 100;
  };

  const parsePercentage = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, "");
    return parseInt(numeric || "0", 10) / 100;
  };

  const formatPercentageInput = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, "");
    if (!numeric) return "";

    const amount = parseInt(numeric, 10) / 100;
    return `${amount.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%`;
  };

  const formatCurrencyInput = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, "");
    if (!numeric) return "";

    const amount = parseInt(numeric, 10) / 100;
    return amount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const [addItemVisible, setAddItemVisible] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");

  const serviceFee = useMemo(
    () => fees.find((fee) => fee.type === FeeType.SERVICE_PERCENTAGE),
    [fees],
  );
  const couvertFee = useMemo(
    () => fees.find((fee) => fee.type === FeeType.COVER_CHARGE),
    [fees],
  );

  const loadBillData = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const bill = await billService.getBill(id);
      setBillStatus(bill.status as BillStatus);
      setBillName(bill.establishmentName || "");

      if (bill.status === "PENDING_OCR") {
        setProcessing(true);
        setItems([]);
        setParticipants([]);
        setFees([]);
        return;
      }

      setProcessing(false);

      const [loadedItems, loadedParticipants, loadedFees] = await Promise.all([
        itemsService.getItems(id),
        participantsService.getParticipantsByBill(id),
        feesService.findAllByBill(id).catch(() => []),
      ]);

      const normalizedFees = Array.isArray(loadedFees)
        ? loadedFees
        : (loadedFees as any)?.fees || [];

      setItems(loadedItems);
      setParticipants(loadedParticipants);
      setFees(normalizedFees);

      const loadedServiceFee = normalizedFees.find(
        (fee: Fee) => fee.type === FeeType.SERVICE_PERCENTAGE,
      );
      const loadedCouvert = normalizedFees.find(
        (fee: Fee) => fee.type === FeeType.COVER_CHARGE,
      );

      setServiceFeeInput(
        loadedServiceFee
          ? formatPercentageInput(
              String(Math.round(Number(loadedServiceFee.value) * 100)),
            )
          : "0,00%",
      );
      setCouvertInput(
        loadedCouvert
          ? formatCurrencyInput(String(Math.round(Number(loadedCouvert.value) * 100)))
          : "R$ 0,00",
      );
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Nao foi possivel carregar os dados da conta.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBillData();
  }, [loadBillData]);

  useEffect(() => {
    if (!id || billStatus !== "PENDING_OCR") return;

    const interval = setInterval(async () => {
      try {
        const bill = await billService.getBill(id);
        if (bill.status !== "PENDING_OCR") {
          clearInterval(interval);
          await loadBillData();
        }
      } catch {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [billStatus, id, loadBillData]);

  const syncFee = async (
    existingFee: Fee | undefined,
    type: FeeType,
    value: number,
  ) => {
    if (!id) return;

    if (value <= 0) {
      if (existingFee) {
        await feesService.remove(existingFee.id);
      }
      return;
    }

    if (existingFee) {
      await feesService.update(existingFee.id, { value });
      return;
    }

    await feesService.create({
      billId: id,
      type,
      value,
    });
  };

  const mapAllocationsToPersistedItems = (
    sourceItems: BillItem[],
    targetItems: BillItem[],
  ) => {
    const sourceParticipants = participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
    }));
    const sourceKeys = sourceItems.reduce<Record<string, string[]>>((acc, item) => {
      const key = `${item.name.trim().toLowerCase()}::${item.quantity}::${item.price.toFixed(2)}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item.id);
      return acc;
    }, {});

    const mapped: Record<string, ReturnType<typeof buildDefaultAllocation>> = {};

    targetItems.forEach((item) => {
      const key = `${item.name.trim().toLowerCase()}::${item.quantity}::${item.price.toFixed(2)}`;
      const sourceItemId = sourceKeys[key]?.shift();

      if (sourceItemId && draftAllocations[sourceItemId]) {
        mapped[item.id] = draftAllocations[sourceItemId];
        return;
      }

      mapped[item.id] = buildDefaultAllocation(item, sourceParticipants);
    });

    return mapped;
  };

  const handleContinue = async () => {
    if (!id) return;

    if (participants.length === 0) {
      Alert.alert("Atencao", "Adicione pelo menos um participante.");
      return;
    }

    if (items.length === 0) {
      Alert.alert("Atencao", "A conta precisa ter pelo menos um item.");
      return;
    }

    try {
      setSaving(true);

      const shouldReopenForEditing =
        editMode === "true" || billStatus === "COMPLETED";

      const updatedBill = await billService.updateBill(id, {
        establishmentName: billName.trim() || undefined,
        status: shouldReopenForEditing ? "REVIEWING" : undefined,
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: Number((item.price * item.quantity).toFixed(2)),
        })),
      });

      const persistedItems: BillItem[] = Array.isArray(updatedBill.items)
        ? updatedBill.items.map((item: any) => ({
            id: item.id,
            name: item.name,
            quantity: Number(item.quantity) || 1,
            price: Number(item.unitPrice) || 0,
            assignedParticipants: [],
          }))
        : await itemsService.getItems(id);

      const serviceFeeValue = parsePercentage(serviceFeeInput);
      const couvertValue = parseCurrency(couvertInput);

      await syncFee(serviceFee, FeeType.SERVICE_PERCENTAGE, serviceFeeValue);
      await syncFee(couvertFee, FeeType.COVER_CHARGE, couvertValue);

      const refreshedFees = await feesService.findAllByBill(id).catch(() => []);
      const normalizedFees = Array.isArray(refreshedFees)
        ? refreshedFees
        : (refreshedFees as any)?.fees || [];

      const refreshedService = normalizedFees.find(
        (fee: Fee) => fee.type === FeeType.SERVICE_PERCENTAGE,
      );
      const refreshedCouvert = normalizedFees.find(
        (fee: Fee) => fee.type === FeeType.COVER_CHARGE,
      );

      initializeDraft({
        billId: id,
        billName: billName.trim(),
        participants: participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
        })),
        items: persistedItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        serviceFeePercentage: refreshedService ? Number(refreshedService.value) : 0,
        couvertValue: refreshedCouvert ? Number(refreshedCouvert.value) : 0,
        serviceFeeSelectedParticipantIds: parseFeeParticipantIds(
          refreshedService?.description,
        ),
        couvertSelectedParticipantIds: parseFeeParticipantIds(
          refreshedCouvert?.description,
        ),
        itemAllocations: mapAllocationsToPersistedItems(items, persistedItems),
      });

      router.push({
        pathname: "/(tabs)/(create)/split" as any,
        params: { id },
      });
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Nao foi possivel salvar as informacoes da conta.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!id) return;
    const trimmedName = newParticipantName.trim();
    if (!trimmedName) return;

    try {
      const participant = await participantsService.createParticipant(id, trimmedName);
      setParticipants((prev) => [...prev, participant]);
      setNewParticipantName("");
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Nao foi possivel adicionar participante.");
    }
  };

  const handleUpdateParticipant = async (participantId: string, name: string) => {
    try {
      const updated = await participantsService.updateParticipant(participantId, name);
      setParticipants((prev) =>
        prev.map((participant) =>
          participant.id === participantId ? updated : participant,
        ),
      );
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Nao foi possivel atualizar participante.");
    }
  };

  const handleDeleteParticipant = async (participantId: string) => {
    if (participants.length <= 1) {
      Alert.alert("Atencao", "A conta precisa ter pelo menos um participante.");
      return;
    }

    try {
      await participantsService.deleteParticipant(participantId);
      setParticipants((prev) =>
        prev.filter((participant) => participant.id !== participantId),
      );
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Nao foi possivel remover participante.");
    }
  };

  const handleAddItem = async (item: Omit<BillItem, "id" | "assignedParticipants">) => {
    if (!id) return;

    try {
      const created = await itemsService.createItem(id, item);
      setItems((prev) => [...prev, created]);
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Nao foi possivel adicionar item.");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!id) return;

    try {
      await itemsService.deleteItem(id, itemId);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Nao foi possivel remover item.");
    }
  };

  const handleUpdateItem = async (updatedItem: BillItem) => {
    if (!id) return;

    const currentItem = items.find((item) => item.id === updatedItem.id);
    if (!currentItem) return;

    try {
      if (currentItem.name !== updatedItem.name) {
        await itemsService.updateItemName(id, updatedItem.id, updatedItem.name);
      }

      if (currentItem.quantity !== updatedItem.quantity) {
        await itemsService.updateItemQuantity(id, updatedItem.id, updatedItem.quantity);
      }

      if (currentItem.price !== updatedItem.price) {
        await itemsService.updateItemPrice(id, updatedItem.id, updatedItem.price);
      }

      setItems((prev) =>
        prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
      );
    } catch (error: any) {
      Alert.alert("Erro", error.message || "Nao foi possivel atualizar item.");
      await loadBillData();
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (processing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.processingTitle, { color: colors.text }]}>
          Processando nota fiscal...
        </Text>
        <Text style={[styles.processingText, { color: colors.textSecondary }]}>
          Assim que os itens forem reconhecidos, a revisao da conta sera aberta.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              Informacoes da conta
            </Text>
            {editMode === "true" && (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Edite dados basicos, participantes e itens antes do rateio.
              </Text>
            )}
          </View>

          {billStatus === "OCR_FAILED" && (
            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: colors.warningLight,
                  borderColor: colors.warning,
                },
              ]}
            >
              <Ionicons name="warning-outline" size={20} color={colors.warning} />
              <Text style={[styles.warningText, { color: colors.text }]}>
                O OCR nao conseguiu identificar todos os itens. Revise a conta e ajuste o que for necessario.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Dados basicos
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  color: colors.text,
                },
              ]}
              placeholder="Titulo da conta"
              placeholderTextColor={colors.placeholderText}
              value={billName}
              onChangeText={setBillName}
            />

            <View style={styles.feeRow}>
              <View style={styles.feeColumn}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Taxa de servico (%)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  keyboardType="numeric"
                  value={serviceFeeInput}
                  onChangeText={(text) =>
                    setServiceFeeInput(formatPercentageInput(text) || "0,00%")
                  }
                />
              </View>

              <View style={styles.feeColumn}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Couvert artistico
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                  keyboardType="numeric"
                  value={couvertInput}
                  onChangeText={(text) =>
                    setCouvertInput(formatCurrencyInput(text) || "R$ 0,00")
                  }
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Participantes
              </Text>
            </View>

            <View style={styles.addRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.flexInput,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text,
                  },
                ]}
                placeholder="Adicionar participante"
                placeholderTextColor={colors.placeholderText}
                value={newParticipantName}
                onChangeText={setNewParticipantName}
              />
              <TouchableOpacity
                style={[styles.smallButton, { backgroundColor: colors.primary }]}
                onPress={handleAddParticipant}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {participants.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                colors={colors}
                onSave={handleUpdateParticipant}
                onDelete={handleDeleteParticipant}
              />
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Itens retornados
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

            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onDelete={handleDeleteItem}
                onUpdate={handleUpdateItem}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              (saving || items.length === 0 || participants.length === 0) &&
                styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={saving || items.length === 0 || participants.length === 0}
          >
            {saving ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
                Continuar para o rateio
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AddItemModal
        visible={addItemVisible}
        onClose={() => setAddItemVisible(false)}
        onAdd={handleAddItem}
      />
    </KeyboardAvoidingView>
  );
}

function ParticipantRow({
  participant,
  colors,
  onSave,
  onDelete,
}: {
  participant: Participant;
  colors: ReturnType<typeof useTheme>["colors"];
  onSave: (participantId: string, name: string) => Promise<void>;
  onDelete: (participantId: string) => Promise<void>;
}) {
  const [value, setValue] = useState(participant.name);

  useEffect(() => {
    setValue(participant.name);
  }, [participant.name]);

  return (
    <View
      style={[
        styles.participantRow,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      <TextInput
        style={[styles.participantInput, { color: colors.text }]}
        value={value}
        onChangeText={setValue}
        onBlur={() => {
          if (value.trim() && value.trim() !== participant.name) {
            void onSave(participant.id, value.trim());
          }
        }}
      />
      <TouchableOpacity onPress={() => void onDelete(participant.id)}>
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
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
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  processingText: {
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 20,
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
  },
  warningCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  feeRow: {
    flexDirection: "row",
    gap: 12,
  },
  feeColumn: {
    flex: 1,
  },
  addRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  flexInput: {
    flex: 1,
  },
  smallButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
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
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  participantInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
