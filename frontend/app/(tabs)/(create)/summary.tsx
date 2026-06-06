import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../contexts/ThemeContext";
import {
  buildDivisionsPayload,
  buildRateioSummary,
  serializeFeeParticipantIds,
  validateItemAllocations,
} from "../../../lib/rateio";
import { formatCurrency } from "../../../lib/formatters";
import billService from "../../../services/bill.service";
import { useRateioDraftStore } from "../../../store/rateioDraftStore";

export default function SummaryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const {
    billId,
    billName,
    participants,
    items,
    itemAllocations,
    serviceFeePercentage,
    serviceFeeConfig,
    couvertValue,
    couvertConfig,
    clearDraft,
  } = useRateioDraftStore();

  const validParticipantIds = useMemo(
    () => new Set(participants.map((participant) => participant.id)),
    [participants],
  );

  const issues = useMemo(
    () => validateItemAllocations(items, itemAllocations, participants),
    [items, itemAllocations, participants],
  );

  const summary = useMemo(
    () =>
      buildRateioSummary({
        participants,
        items,
        itemAllocations,
        serviceFeePercentage,
        serviceFeeConfig,
        couvertValue,
        couvertConfig,
      }),
    [
      participants,
      items,
      itemAllocations,
      serviceFeePercentage,
      serviceFeeConfig,
      couvertValue,
      couvertConfig,
    ],
  );

  if (!billId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Nenhum resumo disponível.
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

  const handleFinalize = async () => {
    if (issues.length > 0) {
      Alert.alert("Rateio incompleto", issues[0].message);
      return;
    }

    try {
      setSaving(true);

      const divisions = buildDivisionsPayload({
        participants,
        items,
        itemAllocations,
      });

      const fees: Array<{
        type: "SERVICE_PERCENTAGE" | "COVER_CHARGE";
        value: number;
        description?: string;
      }> = [];
      const servicePayers = serviceFeeConfig.selectedParticipantIds.filter(
        (participantId) => validParticipantIds.has(participantId),
      );
      const couvertPayers = participants
        .map((participant) => participant.id)
        .filter((participantId) => validParticipantIds.has(participantId));

      if (serviceFeePercentage > 0 && servicePayers.length > 0) {
        fees.push({
          type: "SERVICE_PERCENTAGE",
          value: serviceFeePercentage,
          description: serializeFeeParticipantIds(servicePayers),
        });
      }

      if (couvertValue > 0 && couvertPayers.length > 0) {
        fees.push({
          type: "COVER_CHARGE",
          value: couvertValue * couvertPayers.length,
          description: serializeFeeParticipantIds(couvertPayers),
        });
      }

      await billService.finalizeBill(billId, {
        divisions,
        fees,
      });

      await queryClient.invalidateQueries({ queryKey: ["bills"] });
      clearDraft();
      router.replace(`/(tabs)/bills/${billId}`);
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Não foi possível finalizar a conta.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Resumo final
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {billName || "Conta"} • {participants.length} participante
          {participants.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {summary.participants.map((participant) => (
        <View
          key={participant.id}
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.participantHeader}>
            <Text style={[styles.participantName, { color: colors.text }]}>
              {participant.name}
            </Text>
            <Text style={[styles.participantTotal, { color: colors.primary }]}>
              {formatCurrency(participant.total)}
            </Text>
          </View>

          {participant.items.map((item) => (
            <View key={`${participant.id}-${item.itemId}-${item.name}`} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
                {item.name} ({item.quantity}x)
              </Text>
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}

          {participant.fees.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              {participant.fees.map((fee) => (
                <View key={`${participant.id}-${fee.type}`} style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
                    {fee.label}
                  </Text>
                  <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                    {formatCurrency(fee.amount)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      ))}

      <View
        style={[
          styles.totalCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
          },
        ]}
      >
        <View style={styles.row}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
            Subtotal itens
          </Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {formatCurrency(summary.subtotal)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
            Taxa de serviço
          </Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {formatCurrency(summary.serviceFeeTotal)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>
            Couvert artístico
          </Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {formatCurrency(summary.couvertTotal)}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <View style={styles.row}>
          <Text style={[styles.grandTotalLabel, { color: colors.primary }]}>
            Total geral
          </Text>
          <Text style={[styles.grandTotalValue, { color: colors.primary }]}>
            {formatCurrency(summary.grandTotal)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: colors.primary },
          saving && styles.buttonDisabled,
        ]}
        onPress={handleFinalize}
        disabled={saving}
      >
        {saving ? (
          <>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
              Finalizando...
            </Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={18}
              color={colors.accent}
            />
            <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
              Finalizar conta
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
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
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  participantHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  participantName: {
    fontSize: 18,
    fontWeight: "600",
  },
  participantTotal: {
    fontSize: 16,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  totalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: "700",
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
