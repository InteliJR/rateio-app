import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../contexts/ThemeContext";
import { parseFeeParticipantIds } from "../../../lib/rateio";
import { formatCurrency } from "../../../lib/formatters";
import {
  formatItemQuantity,
  MeasurementUnit,
  normalizeMeasurementUnit,
} from "../../../lib/measurementUnits";
import billService from "../../../services/bill.service";

interface DetailParticipant {
  id: string;
  name: string;
  subtotal: number;
  fees: Array<{
    id: string;
    type: string;
    label: string;
    amount: number;
  }>;
  items: Array<{
    id: string;
    name: string;
    shareAmount: number;
  }>;
  total: number;
}

interface DetailData {
  bill: any;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    measurementUnit: MeasurementUnit;
    unitPrice: number;
    totalPrice: number;
  }>;
  participants: DetailParticipant[];
  summary: {
    subtotal: number;
    serviceFeeTotal: number;
    couvertTotal: number;
    feesTotal: number;
    total: number;
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function BillDetailScreen() {
  const { colors, getFontSize } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isLatestBill, setIsLatestBill] = useState(false);
  const [expandedParticipantId, setExpandedParticipantId] = useState<
    string | null
  >(null);
  const [detail, setDetail] = useState<DetailData | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const [bill, latestBills] = await Promise.all([
        billService.getBill(id),
        billService.listBills(1, 1),
      ]);

      setIsLatestBill(latestBills.data[0]?.id === id);
      setDetail(buildDetailData(bill));
    } catch (error) {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const handleEditBill = () => {
    router.push({
      pathname: "/(tabs)/(create)/scanned",
      params: { id, editMode: "true" },
    });
  };

  const handleReuseBill = () => {
    Alert.alert(
      "Reutilizar conta",
      "Uma nova conta será criada com os mesmos itens e participantes.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reutilizar",
          onPress: async () => {
            try {
              setDuplicating(true);
              const duplicatedBill = await billService.duplicateBill(id);
              router.push({
                pathname: "/(tabs)/(create)/scanned",
                params: { id: duplicatedBill.id },
              });
            } catch (error: any) {
              Alert.alert(
                "Erro",
                error.message || "Não foi possível reutilizar a conta.",
              );
            } finally {
              setDuplicating(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteBill = () => {
    Alert.alert(
      "Excluir conta",
      "Esta conta será removida permanentemente do histórico. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              await billService.deleteBill(id);
              await queryClient.invalidateQueries({ queryKey: ["bills"] });
              router.replace("/(tabs)/bills");
            } catch (error: any) {
              Alert.alert(
                "Erro",
                error.message || "Não foi possivel excluir a conta.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.emptyText, { color: colors.text }]}>
          Conta não encontrada.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>
              {detail.bill.establishmentName || "Conta"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {new Date(detail.bill.createdAt).toLocaleDateString("pt-BR")}
            </Text>
          </View>
          {isLatestBill ? (
            <TouchableOpacity
              style={[styles.editButton, { borderColor: colors.primary }]}
              onPress={handleEditBill}
            >
              <Text style={[styles.editButtonText, { color: colors.primary }]}>
                Editar
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editPlaceholder} />
          )}
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Itens da conta
          </Text>
          {detail.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>
                  {item.name}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {formatItemQuantity(item.quantity, item.measurementUnit)} •{" "}
                  {formatCurrency(item.unitPrice)}
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: colors.text }]}>
                {formatCurrency(item.totalPrice)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Por pessoa
        </Text>
        {detail.participants.map((participant) => (
          <View
            key={participant.id}
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.participantHeader}
              onPress={() =>
                setExpandedParticipantId((current) =>
                  current === participant.id ? null : participant.id,
                )
              }
            >
              <Text style={[styles.participantName, { color: colors.text }]}>
                {participant.name}
              </Text>
              <View style={styles.participantHeaderRight}>
                <Text
                  style={[styles.participantTotal, { color: colors.primary }]}
                >
                  {formatCurrency(participant.total)}
                </Text>
                <MaterialCommunityIcons
                  name={
                    expandedParticipantId === participant.id
                      ? "chevron-up"
                      : "chevron-down"
                  }
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {expandedParticipantId === participant.id && (
              <View style={styles.dropdown}>
                {participant.items.map((item) => (
                  <View key={`${participant.id}-${item.id}`} style={styles.row}>
                    <Text
                      style={[styles.rowLabel, { color: colors.textSecondary }]}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[styles.rowValue, { color: colors.textSecondary }]}
                    >
                      {formatCurrency(item.shareAmount)}
                    </Text>
                  </View>
                ))}

                {participant.fees.length > 0 && (
                  <>
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: colors.divider },
                      ]}
                    />
                    {participant.fees.map((fee) => (
                      <View key={fee.id} style={styles.row}>
                        <Text
                          style={[
                            styles.rowLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {fee.label}
                        </Text>
                        <Text
                          style={[
                            styles.rowValue,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {formatCurrency(fee.amount)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}
          </View>
        ))}

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
              Subtotal
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {formatCurrency(detail.summary.subtotal)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
              Taxa de serviço
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {formatCurrency(detail.summary.serviceFeeTotal)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
              Couvert artístico
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {formatCurrency(detail.summary.couvertTotal)}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <View style={styles.row}>
            <Text style={[styles.totalLabel, { color: colors.primary }]}>
              Total geral
            </Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>
              {formatCurrency(detail.summary.total)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary },
            duplicating && styles.buttonDisabled,
          ]}
          onPress={handleReuseBill}
          disabled={duplicating}
        >
          {duplicating ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
              Reutilizar conta
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.deleteButton,
            { borderColor: colors.error },
            deleting && styles.buttonDisabled,
          ]}
          onPress={handleDeleteBill}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={[styles.deleteButtonText, { color: colors.error }]}>
              Excluir conta
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function buildDetailData(bill: any): DetailData {
  const participantsMap = (bill.participants || []).reduce(
    (acc: Record<string, DetailParticipant>, participant: any) => {
      const items = (participant.divisions || []).map((division: any) => ({
        id: division.billItemId,
        name:
          bill.items.find((item: any) => item.id === division.billItemId)
            ?.name || "Item",
        shareAmount: Number(division.shareAmount),
      }));

      const subtotal = round2(
        items.reduce((sum: number, item: any) => sum + item.shareAmount, 0),
      );

      acc[participant.id] = {
        id: participant.id,
        name: participant.name,
        subtotal,
        fees: [],
        items,
        total: subtotal,
      };

      return acc;
    },
    {} as Record<string, DetailParticipant>,
  );

  let serviceFeeTotal = 0;
  let couvertTotal = 0;
  const participantIds = Object.keys(participantsMap);

  for (const fee of bill.fees || []) {
    const totalFee =
      fee.type === "SERVICE_PERCENTAGE" ? 0 : round2(Number(fee.value));

    if (fee.type === "SERVICE_PERCENTAGE") {
      const selectedParticipantIds = parseFeeParticipantIds(
        fee.description,
      ).filter((participantId) => participantsMap[participantId]?.subtotal > 0);
      const servicePayers =
        selectedParticipantIds.length > 0
          ? selectedParticipantIds
          : participantIds.filter(
              (participantId) => participantsMap[participantId].subtotal > 0,
            );
      const serviceBase = round2(
        servicePayers.reduce(
          (sum, participantId) => sum + participantsMap[participantId].subtotal,
          0,
        ),
      );
      const serviceTotal = round2((serviceBase * Number(fee.value)) / 100);

      if (serviceTotal <= 0) continue;

      serviceFeeTotal = round2(serviceFeeTotal + serviceTotal);
      let allocated = 0;

      servicePayers.forEach((participantId, index) => {
        const participant = participantsMap[participantId];
        const amount =
          index === servicePayers.length - 1
            ? round2(serviceTotal - allocated)
            : round2(participant.subtotal * (Number(fee.value) / 100));

        allocated = round2(allocated + amount);
        participant.fees.push({
          id: fee.id,
          type: fee.type,
          label: "Taxa de serviço",
          amount,
        });
        participant.total = round2(participant.total + amount);
      });

      continue;
    }

    if (totalFee <= 0) continue;

    if (fee.type === "COVER_CHARGE") {
      couvertTotal = round2(couvertTotal + totalFee);
    } else {
      serviceFeeTotal = round2(serviceFeeTotal + totalFee);
    }

    const selectedParticipantIds = parseFeeParticipantIds(
      fee.description,
    ).filter((participantId) => participantsMap[participantId]);
    const feePayers =
      selectedParticipantIds.length > 0
        ? selectedParticipantIds
        : participantIds;
    const baseShare = round2(totalFee / feePayers.length);

    feePayers.forEach((participantId, index) => {
      const participant = participantsMap[participantId];
      if (!participant) return;

      const amount =
        index === feePayers.length - 1
          ? round2(totalFee - baseShare * (feePayers.length - 1))
          : baseShare;

      participant.fees.push({
        id: fee.id,
        type: fee.type,
        label: fee.type === "COVER_CHARGE" ? "Couvert artístico" : "Taxa",
        amount,
      });
      participant.total = round2(participant.total + amount);
    });
  }

  const items = (bill.items || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity),
    measurementUnit: normalizeMeasurementUnit(item.measurementUnit),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
  }));

  const subtotal = round2(
    items.reduce((sum: number, item: any) => sum + item.totalPrice, 0),
  );
  const feesTotal = round2(serviceFeeTotal + couvertTotal);

  return {
    bill,
    items,
    participants: Object.values(participantsMap),
    summary: {
      subtotal,
      serviceFeeTotal,
      couvertTotal,
      feesTotal,
      total: round2(subtotal + feesTotal),
    },
  };
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
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  editButton: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  editPlaceholder: {
    width: 68,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 12,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  participantHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  participantHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantName: {
    fontSize: 17,
    fontWeight: "600",
  },
  participantTotal: {
    fontSize: 15,
    fontWeight: "700",
  },
  dropdown: {
    gap: 8,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
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
  deleteButton: {
    minHeight: 54,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
