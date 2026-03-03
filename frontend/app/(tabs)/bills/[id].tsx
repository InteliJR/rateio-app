import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Ionicons } from "@expo/vector-icons";
import billService, {
  BillSummaryResponse,
} from "../../../services/bill.service";
import { useTheme } from "../../../contexts/ThemeContext";

interface BillPerson {
  name: string;
  amount: number;
}

interface BillItem {
  description: string;
  amount: number;
  quantity?: number;
  people?: BillPerson[];
}

interface BillDetail {
  id: string;
  establishmentName: string;
  totalAmount: number;
  createdAt: string;
  items?: BillItem[];
}

export default function BillDetail() {
  const { colors, getFontSize } = useTheme();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [data, setData] = useState<BillSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [isLatestBill, setIsLatestBill] = useState(false);
  const [expandedParticipantId, setExpandedParticipantId] = useState<
    string | null
  >(null);

  // Usar useFocusEffect para recarregar dados quando a tela ganha foco
  // Isso garante que os dados sejam atualizados após edição
  useFocusEffect(
    useCallback(() => {
      loadBillDetails();
      checkIfLatestBill();
    }, [id]),
  );

  const loadBillDetails = async () => {
    try {
      setLoading(true);
      const response = await billService.getSummary(id as string);
      setData(response);
    } catch (err) {
      console.error("Erro ao carregar conta:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkIfLatestBill = async () => {
    try {
      // Buscar a lista de contas ordenada por data (mais recente primeiro)
      const response = await billService.listBills(1, 1);

      // Se esta conta é a primeira da lista (mais recente), permitir edição
      if (response.data.length > 0 && response.data[0].id === id) {
        setIsLatestBill(true);
      } else {
        setIsLatestBill(false);
      }
    } catch (err) {
      console.error("Erro ao verificar conta mais recente:", err);
      setIsLatestBill(false);
    }
  };

  const handleEditBill = () => {
    // Navegar para a tela de edição (scanned.tsx) com a conta atual
    // Passamos editMode=true para permitir edição mesmo se a conta estiver COMPLETED
    router.push({
      pathname: "/(tabs)/(create)/scanned",
      params: { id: id as string, editMode: "true" },
    });
  };

  const handleReuseBill = () => {
    Alert.alert(
      "Reutilizar conta",
      "Será criada uma cópia desta conta com os mesmos participantes e configurações. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reutilizar",
          onPress: async () => {
            try {
              setDuplicating(true);

              // Duplicar a conta no backend
              const newBill = await billService.duplicateBill(id as string);

              // Navegar para a tela de edição da nova conta
              router.push({
                pathname: "/(tabs)/(create)/scanned",
                params: { id: newBill.id },
              });
            } catch (err: any) {
              console.error("Erro ao reutilizar conta:", err);
              Alert.alert(
                "Erro",
                err.message ||
                  "Não foi possível reutilizar a conta. Tente novamente.",
              );
            } finally {
              setDuplicating(false);
            }
          },
        },
      ],
    );
  };

  const formatCurrency = (value?: number): string => {
    if (value === undefined || value === null) return "R$ 0,00";
    return `R$ ${value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const toggleParticipant = (participantId: string) => {
    if (expandedParticipantId === participantId) {
      setExpandedParticipantId(null);
    } else {
      setExpandedParticipantId(participantId);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              styles.loadingText,
              { color: colors.text, fontSize: getFontSize(14) },
            ]}
          >
            Carregando conta...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.errorContainer}>
          <Text
            style={[
              styles.errorText,
              { color: colors.text, fontSize: getFontSize(16) },
            ]}
          >
            Conta não encontrada
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["bottom", "left", "right"]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.contentContainer}>
          {/* Título com Seta de Voltar e Botão Editar */}
          <View style={styles.titleSection}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text
              style={[
                styles.titleText,
                { color: colors.text, fontSize: getFontSize(18) },
              ]}
            >
              {data.bill.establishmentName || "Detalhes"}
            </Text>
            {/* Botão Editar - só aparece para a conta mais recente */}
            {isLatestBill ? (
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditBill}
              >
                <Text style={styles.editButtonText}>Editar</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.editButtonPlaceholder} />
            )}
          </View>

          {/* Aviso de Falha (Se houver) */}
          {data.bill.status === "OCR_FAILED" && (
            <View style={[styles.warningCard, { backgroundColor: colors.warningLight ?? "#FFEBEE" }]}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={24}
                color={colors.error ?? "#D32F2F"}
              />
              <View style={styles.warningContent}>
                <Text style={[styles.warningTitle, { color: colors.error ?? "#D32F2F", fontSize: getFontSize(15) }]}>
                  Falha no processamento
                </Text>
                <Text style={[styles.warningText, { color: colors.secondaryText ?? "#B71C1C", fontSize: getFontSize(13) }]}>
                  Não foi possível ler os itens da nota automaticamente. Por
                  favor, verifique os valores ou edite manualmente.
                </Text>
              </View>
            </View>
          )}

          {/* Seção de Itens da Conta */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontSize: getFontSize(18) },
            ]}
          >
            Itens da Conta
          </Text>
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.cardBackground },
            ]}
          >
            {(data.items || []).map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  index < (data.items || []).length - 1 && [
                    styles.borderBottom,
                    { borderColor: colors.divider },
                  ],
                ]}
              >
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: colors.text, fontSize: getFontSize(15) }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemQty, { color: colors.secondaryText, fontSize: getFontSize(13) }]}>
                    {item.quantity}x {formatCurrency(item.unitPrice)}
                  </Text>
                </View>
                <Text style={[styles.itemTotal, { color: colors.text, fontSize: getFontSize(15) }]}>
                  {formatCurrency(item.totalPrice)}
                </Text>
              </View>
            ))}
            <View
              style={[styles.divider, { backgroundColor: colors.divider }]}
            />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.text, fontSize: getFontSize(15) }]}>Subtotal</Text>
              <Text style={[styles.totalValue, { color: colors.primary, fontSize: getFontSize(15) }]}>
                {formatCurrency(data.summary?.subtotal)}
              </Text>
            </View>
          </View>

          {/* Seção de Participantes */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontSize: getFontSize(18) },
            ]}
          >
            Por Pessoa
          </Text>
          {(data.participants || []).map((participant) => (
            <View
              key={participant.id}
              style={[
                styles.participantCardWrapper,
                { backgroundColor: colors.cardBackground },
              ]}
            >
              <TouchableOpacity
                style={styles.participantHeader}
                onPress={() => toggleParticipant(participant.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.participantName,
                    { color: colors.text, fontSize: getFontSize(16) },
                  ]}
                >
                  {participant.name}
                </Text>
                <View style={styles.participantHeaderRight}>
                  <Text
                    style={[
                      styles.participantTotal,
                      { color: colors.primary, fontSize: getFontSize(16) },
                    ]}
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
                    color={colors.iconColor}
                  />
                </View>
              </TouchableOpacity>

              {expandedParticipantId === participant.id && (
                <View
                  style={[
                    styles.participantDetails,
                    { backgroundColor: colors.dropdownBackground },
                  ]}
                >
                  {/* Itens do participante */}
                  {(participant.items || []).map((item) => (
                    <View key={item.id} style={styles.detailRow}>
                    <Text
                        style={[
                          styles.detailText,
                          { color: colors.text, fontSize: getFontSize(14) },
                        ]}
                      >
                        {item.name} (
                        {item.quantity > 1 ? `${item.quantity}x` : "1x"})
                      </Text>
                      <Text
                        style={[
                          styles.detailValue,
                          { color: colors.text, fontSize: getFontSize(14) },
                        ]}
                      >
                        {formatCurrency(item.shareAmount)}
                      </Text>
                    </View>
                  ))}

                  {/* Taxas do participante */}
                  {participant.feeDetails &&
                    participant.feeDetails.length > 0 && (
                      <>
                        <View style={[styles.detailDivider, { backgroundColor: colors.divider }]} />
                        {participant.feeDetails.map((fee) => (
                          <View
                            key={fee.id}
                            style={[
                              styles.detailRow,
                              fee.type === "SERVICE_PERCENTAGE" &&
                                styles.detailRowFee,
                              fee.type === "COVER_CHARGE" &&
                                styles.detailRowCouvert,
                            ]}
                          >
                            <Text
                              style={[
                                styles.detailTextFee,
                                { color: colors.secondaryText, fontSize: getFontSize(13) },
                                fee.type === "COVER_CHARGE" &&
                                  styles.detailTextCouvert,
                              ]}
                            >
                              {fee.type === "SERVICE_PERCENTAGE"
                                ? "Taxa de Serviço"
                                : fee.type === "COVER_CHARGE"
                                  ? "Couvert"
                                  : "Taxa"}
                            </Text>
                            <Text
                              style={[
                                styles.detailValueFee,
                                { color: colors.secondaryText, fontSize: getFontSize(13) },
                                fee.type === "COVER_CHARGE" &&
                                  styles.detailValueCouvert,
                              ]}
                            >
                              {formatCurrency(fee.participantShare)}
                            </Text>
                          </View>
                        ))}
                      </>
                    )}
                </View>
              )}
            </View>
          ))}

          {/* Resumo Final */}
          <View
            style={[
              styles.finalSummaryCard,
              { backgroundColor: colors.cardBackground },
            ]}
          >
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.text, fontSize: getFontSize(15) }]}>Subtotal</Text>
              <Text style={[styles.summaryValue, { color: colors.text, fontSize: getFontSize(15) }]}>
                {formatCurrency(data.summary.subtotal)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.text, fontSize: getFontSize(15) }]}>Taxas / Serviço</Text>
              <Text style={[styles.summaryValue, { color: colors.text, fontSize: getFontSize(15) }]}>
                {formatCurrency(data.summary.totalFees)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.marginTop]}>
              <Text style={[styles.finalTotalLabel, { color: colors.primary, fontSize: getFontSize(17) }]}>Total Geral</Text>
              <Text style={[styles.finalTotalValue, { color: colors.primary, fontSize: getFontSize(17) }]}>
                {formatCurrency(data.summary.total)}
              </Text>
            </View>
          </View>

          {/* Botão Reutilizar Conta */}
          <TouchableOpacity
            style={[
              styles.reuseButton,
              { backgroundColor: colors.primary },
              duplicating && styles.reuseButtonDisabled,
            ]}
            onPress={handleReuseBill}
            disabled={duplicating}
          >
            {duplicating ? (
              <ActivityIndicator size="small" color={colors.accent ?? "#ffff00"} />
            ) : (
              <Text style={[styles.reuseButtonText, { color: colors.accent ?? "#ffff00", fontSize: getFontSize(16) }]}>Reutilizar Conta</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  titleSection: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 0,
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 28,
    fontWeight: "300",
    color: "#000",
    lineHeight: 28,
  },
  titleText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#8B2E8F",
    borderRadius: 18,
  },
  editButtonPlaceholder: {
    width: 70, // Aproximadamente a largura do botão "Editar"
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8B2E8F",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  itemQty: {
    fontSize: 12,
    color: "#888",
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    minWidth: 70,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FAFAFA",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  participantCardWrapper: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  participantHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  participantName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#000",
  },
  participantHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8B2E8F",
  },
  participantDetails: {
    backgroundColor: "#F9F9F9",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: "#333",
  },
  detailValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  detailDivider: {
    height: 1,
    backgroundColor: "#E5E5EA",
    marginVertical: 8,
  },
  detailTextFee: {
    fontSize: 13,
    fontWeight: "400",
    color: "#8B2E8F",
    fontStyle: "italic",
  },
  detailValueFee: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8B2E8F",
  },
  detailRowFee: {
    backgroundColor: "#FAF5FA",
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 2,
  },
  detailRowCouvert: {
    backgroundColor: "#FFFBF5",
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 2,
  },
  detailTextCouvert: {
    color: "#d97706",
  },
  detailValueCouvert: {
    color: "#d97706",
  },
  finalSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  marginTop: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    paddingTop: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#666",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  finalTotalLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
  },
  finalTotalValue: {
    fontSize: 17,
    fontWeight: "700",
    color: "#8B2E8F",
  },
  reuseButton: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: "#8B2E8F",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  reuseButtonDisabled: {
    opacity: 0.7,
  },
  reuseButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffff00",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    textAlign: "center",
  },
  warningCard: {
    backgroundColor: "#FFEBEE",
    borderWidth: 1,
    borderColor: "#FFCDD2",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D32F2F",
    marginBottom: 2,
  },
  warningText: {
    fontSize: 13,
    color: "#B71C1C",
    lineHeight: 18,
  },
});
