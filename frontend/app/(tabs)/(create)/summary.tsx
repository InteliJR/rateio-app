import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useBillStore } from '../../../store/billStore';
import divisionsService from "../../../services/divisions.service";
import billService from "../../../services/bill.service";
import itemsService from "../../../services/items.service";
import participantsService, {
  Participant,
} from "../../../services/participants.service";

interface ParticipantSummary {
  id: string;
  name: string;
  totalAmount: number;
  subtotal: number;
  items: Array<{
    name: string;
    amount: number;
  }>;
  fees: Array<{
    name: string;
    amount: number;
  }>;
  couvert: number;
  paysFee: boolean;
  paysCouvert: boolean;
}

interface BillSummaryData {
  billId: string;
  establishmentName: string;
  totalAmount: number;
  itemsTotal: number;
  feesTotal: number;
  grandTotal: number;
  participants: ParticipantSummary[];
}

// Inicialização vazia - será preenchido com dados reais do backend
const EMPTY_SUMMARY: BillSummaryData = {
  billId: '',
  establishmentName: '',
  totalAmount: 0,
  itemsTotal: 0,
  feesTotal: 0,
  grandTotal: 0,
  participants: [],
};

export default function SummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [summary, setSummary] = useState<BillSummaryData>(EMPTY_SUMMARY);
  const [expandedIndex, setExpandedIndex] = useState<number>(-1);
  const [serviceFeePercentage, setServiceFeePercentage] = useState(10); // 10% padrão
  const [couvertPerPerson, setCouvertPerPerson] = useState(5.00); // R$ 5,00 por pessoa (padrão)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummaryData();
  }, [id]);

  const loadSummaryData = async () => {
    if (!id) {
      console.error("[Summary] No bill ID provided");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log("[Summary] Loading data for bill:", id);

      // 1. Buscar informações da conta
      const billData = await billService.getBill(id as string);
      console.log("[Summary] Bill data:", billData);

      // 2. Buscar itens da conta
      const itemsData = await itemsService.getItems(id as string);
      console.log("[Summary] Items data:", itemsData);

      // 3. Buscar participantes
      const participantsData = await participantsService.getParticipantsByBill(
        id as string,
      );
      console.log("[Summary] Participants data:", participantsData);

      // 4. Buscar divisões (divisions) - aqui está o cálculo real de quanto cada um paga
      const divisionsData = await divisionsService.findAllByBill(id as string);
      console.log("[Summary] Divisions data:", divisionsData);

      // 5. Organizar dados por participante
      const participantSummaries: ParticipantSummary[] = participantsData.map(
        (participant: Participant) => {
          // Encontrar todas as divisões deste participante
          const participantDivisions = divisionsData.filter(
            (div: any) => div.participantId === participant.id,
          );

          // Calcular itens e valores com arredondamento correto
          const items = participantDivisions.map((div: any) => {
            // Encontrar o item correspondente
            const item = itemsData.find((i: any) => i.id === div.billItemId);
            return {
              name: item?.name || "Item desconhecido",
              amount: round2(Number(div.shareAmount)),
            };
          });

          const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));

          // Calcular taxa de serviço (10% do subtotal) com arredondamento
          const serviceFee = round2((subtotal * serviceFeePercentage) / 100);

          // Couvert fixo por pessoa (buscar do backend futuramente)
          const couvert = round2(couvertPerPerson);

          return {
            id: participant.id,
            name: participant.name,
            subtotal,
            items,
            fees:
              serviceFee > 0
                ? [{ name: "Taxa de Serviço", amount: serviceFee }]
                : [],
            couvert,
            totalAmount: round2(subtotal + serviceFee + couvert),
            paysFee: true, // Padrão: todos pagam taxa
            paysCouvert: true, // Padrão: todos pagam couvert
          };
        },
      );

      // 6. Calcular totais com arredondamento correto
      const itemsTotal = round2(
        participantSummaries.reduce((sum, p) => sum + p.subtotal, 0)
      );
      const feesTotal = round2(
        participantSummaries.reduce((sum, p) => {
          return sum + (p.fees?.reduce((s, f) => s + f.amount, 0) || 0);
        }, 0)
      );
      const couvertTotal = round2(
        participantSummaries.reduce((sum, p) => sum + p.couvert, 0)
      );

      const summaryData: BillSummaryData = {
        billId: id as string,
        establishmentName: billData.establishmentName || "Conta",
        totalAmount: itemsTotal,
        itemsTotal,
        feesTotal,
        grandTotal: round2(itemsTotal + feesTotal + couvertTotal),
        participants: participantSummaries,
      };

      setSummary(summaryData);

      console.log("[Summary] Summary calculated:", {
        itemsTotal: itemsTotal.toFixed(2),
        feesTotal: feesTotal.toFixed(2),
        couvertTotal: couvertTotal.toFixed(2),
        grandTotal: summaryData.grandTotal.toFixed(2),
        participantsCount: participantSummaries.length,
      });

      // Validar cálculos
      validateCalculations(summaryData);
    } catch (error: any) {
      console.error("[Summary] Error loading data:", error);
      Alert.alert(
        "Erro",
        error.message || "Não foi possível carregar o resumo da conta",
      );
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value?: number): string => {
    if (!value) return 'R$ 0,00';
    return `R$ ${value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Função auxiliar para arredondar para 2 casas decimais
  const round2 = (value: number): number => {
    return Math.round(value * 100) / 100;
  };

  // Função para validar se os cálculos estão corretos
  const validateCalculations = (summary: BillSummaryData): boolean => {
    let isValid = true;
    const errors: string[] = [];

    // 1. Validar cada participante: subtotal + taxa + couvert = total
    summary.participants.forEach((p, index) => {
      const serviceFee = p.paysFee ? round2((p.subtotal * serviceFeePercentage) / 100) : 0;
      const couvertAmount = p.paysCouvert ? p.couvert : 0;
      const expectedTotal = round2(p.subtotal + serviceFee + couvertAmount);
      const actualTotal = round2(p.totalAmount);

      if (Math.abs(expectedTotal - actualTotal) > 0.01) {
        errors.push(
          `Participante ${index + 1} (${p.name}): ` +
          `esperado ${expectedTotal.toFixed(2)}, atual ${actualTotal.toFixed(2)}`
        );
        isValid = false;
      }
    });

    // 2. Validar soma de subtotais
    const expectedItemsTotal = round2(
      summary.participants.reduce((sum, p) => sum + p.subtotal, 0)
    );
    const actualItemsTotal = round2(summary.itemsTotal);

    if (Math.abs(expectedItemsTotal - actualItemsTotal) > 0.01) {
      errors.push(
        `Subtotal geral: esperado ${expectedItemsTotal.toFixed(2)}, ` +
        `atual ${actualItemsTotal.toFixed(2)}`
      );
      isValid = false;
    }

    // 3. Validar soma de taxas
    const expectedFeesTotal = round2(
      summary.participants.reduce((sum, p) => {
        const fee = p.fees?.reduce((s, f) => s + f.amount, 0) || 0;
        return sum + fee;
      }, 0)
    );
    const actualFeesTotal = round2(summary.feesTotal);

    if (Math.abs(expectedFeesTotal - actualFeesTotal) > 0.01) {
      errors.push(
        `Taxa total: esperado ${expectedFeesTotal.toFixed(2)}, ` +
        `atual ${actualFeesTotal.toFixed(2)}`
      );
      isValid = false;
    }

    // 4. Validar soma de couverts
    const expectedCouvertTotal = round2(
      summary.participants.reduce((sum, p) => {
        return sum + (p.paysCouvert ? p.couvert : 0);
      }, 0)
    );

    // 5. Validar total geral
    const expectedGrandTotal = round2(
      expectedItemsTotal + expectedFeesTotal + expectedCouvertTotal
    );
    const actualGrandTotal = round2(summary.grandTotal);

    if (Math.abs(expectedGrandTotal - actualGrandTotal) > 0.01) {
      errors.push(
        `Total geral: esperado ${expectedGrandTotal.toFixed(2)}, ` +
        `atual ${actualGrandTotal.toFixed(2)}`
      );
      isValid = false;
    }

    // 6. Validar soma de totais individuais = total geral
    const sumOfIndividualTotals = round2(
      summary.participants.reduce((sum, p) => sum + p.totalAmount, 0)
    );

    if (Math.abs(sumOfIndividualTotals - actualGrandTotal) > 0.01) {
      errors.push(
        `Soma dos totais individuais (${sumOfIndividualTotals.toFixed(2)}) ` +
        `não bate com total geral (${actualGrandTotal.toFixed(2)})`
      );
      isValid = false;
    }

    if (!isValid) {
      console.error('[Summary] Validation errors:', errors);
    } else {
      console.log('[Summary] ✓ All calculations validated successfully');
      console.log('[Summary] Validation details:', {
        itemsTotal: actualItemsTotal.toFixed(2),
        feesTotal: actualFeesTotal.toFixed(2),
        couvertTotal: expectedCouvertTotal.toFixed(2),
        grandTotal: actualGrandTotal.toFixed(2),
        sumOfIndividuals: sumOfIndividualTotals.toFixed(2),
      });
    }

    return isValid;
  };

  const toggleParticipantFee = (index: number) => {
    setSummary((prev) => {
      const newParticipants = [...prev.participants];
      newParticipants[index] = {
        ...newParticipants[index],
        paysFee: !newParticipants[index].paysFee,
      };

      // Recalcular totais com base em quem paga taxa (com arredondamento)
      const updatedParticipants = newParticipants.map((p) => {
        const serviceFee = p.paysFee
          ? round2((p.subtotal * serviceFeePercentage) / 100)
          : 0;
        const couvertAmount = p.paysCouvert ? p.couvert : 0;
        return {
          ...p,
          totalAmount: round2(p.subtotal + serviceFee + couvertAmount),
          fees:
            serviceFee > 0
              ? [{ name: "Taxa de Serviço", amount: serviceFee }]
              : [],
        };
      });

      const newFeesTotal = round2(
        updatedParticipants.reduce((sum, p) => {
          return sum + (p.fees?.reduce((s, f) => s + f.amount, 0) || 0);
        }, 0)
      );

      const couvertTotal = round2(
        updatedParticipants.reduce(
          (sum, p) => sum + (p.paysCouvert ? p.couvert : 0),
          0
        )
      );

      const newSummary = {
        ...prev,
        participants: updatedParticipants,
        feesTotal: newFeesTotal,
        grandTotal: round2(prev.itemsTotal + newFeesTotal + couvertTotal),
      };

      // Validar cálculos após atualização
      setTimeout(() => validateCalculations(newSummary), 100);

      return newSummary;
    });
  };

  const toggleParticipantCouvert = (index: number) => {
    setSummary((prev) => {
      const newParticipants = [...prev.participants];
      newParticipants[index] = {
        ...newParticipants[index],
        paysCouvert: !newParticipants[index].paysCouvert,
      };

      // Recalcular totais (com arredondamento)
      const updatedParticipants = newParticipants.map((p) => {
        const serviceFee = p.paysFee
          ? round2((p.subtotal * serviceFeePercentage) / 100)
          : 0;
        const couvertAmount = p.paysCouvert ? p.couvert : 0;
        return {
          ...p,
          totalAmount: round2(p.subtotal + serviceFee + couvertAmount),
        };
      });

      const newFeesTotal = round2(
        updatedParticipants.reduce((sum, p) => {
          return sum + (p.fees?.reduce((s, f) => s + f.amount, 0) || 0);
        }, 0)
      );

      const couvertTotal = round2(
        updatedParticipants.reduce(
          (sum, p) => sum + (p.paysCouvert ? p.couvert : 0),
          0
        )
      );

      const newSummary = {
        ...prev,
        participants: updatedParticipants,
        feesTotal: newFeesTotal,
        grandTotal: round2(prev.itemsTotal + newFeesTotal + couvertTotal),
      };

      // Validar cálculos após atualização
      setTimeout(() => validateCalculations(newSummary), 100);

      return newSummary;
    });
  };

  const handleSave = () => {
    Alert.alert('Sucesso', 'Conta dividida e salva!', [
      {
        text: 'OK',
        onPress: () => router.push('/(tabs)/bills'),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B2E8F" />
          <Text style={styles.loadingText}>Carregando resumo...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.contentContainer}>
            {/* Título com Seta de Voltar */}
            <View style={styles.titleSection}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Text style={styles.backButtonText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.titleText}>
                {summary.establishmentName || "Resumo"}
              </Text>
            </View>

            {/* Lista de Participantes */}
            {summary.participants.map((participant, index) => (
              <View
                key={`participant-${index}`}
                style={styles.participantCardWrapper}
              >
                <TouchableOpacity
                  style={styles.participantCardMain}
                  onPress={() =>
                    setExpandedIndex(expandedIndex === index ? -1 : index)
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.participantCardLeft}>
                    <Text style={styles.participantName}>
                      {participant.name}
                    </Text>
                  </View>
                  <View style={styles.participantCardRight}>
                    <Text style={styles.participantAmount}>
                      {formatCurrency(participant.totalAmount)}
                    </Text>
                    <MaterialCommunityIcons
                      name={
                        expandedIndex === index
                          ? "chevron-down"
                          : "chevron-right"
                      }
                      size={20}
                      color="#666"
                    />
                  </View>
                </TouchableOpacity>

                {/* Dropdown com itens, taxas e totais */}
                {expandedIndex === index && (
                  <View style={styles.dropdownWrapper}>
                    {/* Título Itens */}
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionHeaderText}>Itens</Text>
                    </View>

                    {/* Lista de Itens */}
                    {participant.items.map((item, itemIdx) => (
                      <View key={`item-${itemIdx}`} style={styles.dropdownItem}>
                        <Text style={styles.dropdownItemText}>{item.name}</Text>
                        <Text style={styles.dropdownItemAmount}>
                          {formatCurrency(item.amount)}
                        </Text>
                      </View>
                    ))}

                    {/* Subtotal */}
                    <View style={[styles.dropdownItem, styles.subtotalItem]}>
                      <Text style={styles.subtotalText}>Subtotal</Text>
                      <Text style={styles.subtotalAmount}>
                        {formatCurrency(participant.subtotal)}
                      </Text>
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Seção Taxas e Encargos */}
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionHeaderText}>Taxas e Encargos</Text>
                    </View>

                    {/* Taxa com Checkbox */}
                    <TouchableOpacity
                      style={[styles.dropdownItem, styles.dropdownFeeItem]}
                      onPress={() => toggleParticipantFee(index)}
                      activeOpacity={0.6}
                    >
                      <View style={styles.feeWithCheckbox}>
                        <View
                          style={[
                            styles.checkbox,
                            participant.paysFee && styles.checkboxActive,
                          ]}
                        >
                          {participant.paysFee && (
                            <MaterialCommunityIcons
                              name="check"
                              size={12}
                              color="#8B2E8F"
                            />
                          )}
                        </View>
                        <Text style={styles.dropdownFeeText}>
                          Taxa de Serviço
                        </Text>
                      </View>
                      <Text style={styles.dropdownItemAmount}>
                        {formatCurrency(participant.fees[0]?.amount || 0)}
                      </Text>
                    </TouchableOpacity>

                    {/* Couvert com Checkbox */}
                    <TouchableOpacity
                      style={[styles.dropdownItem, styles.dropdownCouvertItem]}
                      onPress={() => toggleParticipantCouvert(index)}
                      activeOpacity={0.6}
                    >
                      <View style={styles.feeWithCheckbox}>
                        <View
                          style={[
                            styles.checkbox,
                            participant.paysCouvert && styles.checkboxActive,
                          ]}
                        >
                          {participant.paysCouvert && (
                            <MaterialCommunityIcons
                              name="check"
                              size={12}
                              color="#8B2E8F"
                            />
                          )}
                        </View>
                        <Text style={styles.dropdownCouvertText}>Couvert</Text>
                      </View>
                      <Text style={styles.dropdownItemAmount}>
                        {formatCurrency(participant.paysCouvert ? participant.couvert : 0)}
                      </Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Total Final */}
                    <View style={[styles.dropdownItem, styles.totalItem]}>
                      <Text style={styles.totalText}>Total Final</Text>
                      <Text style={styles.totalAmount}>
                        {formatCurrency(participant.totalAmount)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ))}

            {/* Card do Total */}
            <View style={styles.totalCardWrapper}>
              <Text style={styles.totalCardLabel}>Valor Total</Text>
              <Text style={styles.totalCardAmount}>
                {formatCurrency(summary.grandTotal)}
              </Text>
            </View>

            {/* Detalhamento dos Cálculos */}
            {summary.participants.length > 0 && (
              <View style={styles.calculationDetailsCard}>
                <Text style={styles.calculationDetailsTitle}>Detalhamento</Text>
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>Subtotal (Itens)</Text>
                  <Text style={styles.calculationValue}>
                    {formatCurrency(summary.itemsTotal)}
                  </Text>
                </View>
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>Taxa de Serviço</Text>
                  <Text style={styles.calculationValue}>
                    {formatCurrency(summary.feesTotal)}
                  </Text>
                </View>
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>Couvert</Text>
                  <Text style={styles.calculationValue}>
                    {formatCurrency(
                      summary.participants.reduce(
                        (sum, p) => sum + (p.paysCouvert ? p.couvert : 0),
                        0
                      )
                    )}
                  </Text>
                </View>
                <View style={[styles.calculationRow, styles.calculationTotal]}>
                  <Text style={styles.calculationTotalLabel}>Total Geral</Text>
                  <Text style={styles.calculationTotalValue}>
                    {formatCurrency(summary.grandTotal)}
                  </Text>
                </View>
                <View style={styles.validationRow}>
                  <MaterialCommunityIcons 
                    name="check-circle" 
                    size={16} 
                    color="#10b981" 
                  />
                  <Text style={styles.validationText}>
                    {summary.participants.length} participante{summary.participants.length !== 1 ? 's' : ''} • 
                    Soma verificada: {formatCurrency(
                      summary.participants.reduce((sum, p) => sum + p.totalAmount, 0)
                    )}
                  </Text>
                </View>
              </View>
            )}

            {/* Botão Salvar */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 2,
  },
  backButtonText: {
    fontSize: 28,
    fontWeight: "300",
    color: "#000",
    lineHeight: 28,
  },
  titleSection: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    gap: 4,
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
  editButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8B2E8F",
  },
  addItemButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#8B2E8F",
    borderRadius: 18,
  },
  addItemButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8B2E8F",
  },
  participantCardWrapper: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  participantCardMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  participantCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  participantName: {
    fontSize: 15,
    fontWeight: "400",
    color: "#000",
  },
  participantCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  participantAmount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
    minWidth: 75,
    textAlign: "right",
  },
  dropdownWrapper: {
    backgroundColor: "#F8F8F8",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F0F0F0",
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.3,
    borderColor: "#ccc",
    borderRadius: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxActive: {
    borderColor: "#8B2E8F",
    backgroundColor: "#fff",
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F8F8F8",
  },
  dropdownFeeItem: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  dropdownCouvertItem: {
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#FFFBF5',
  },
  subtotalItem: {
    backgroundColor: "#FAFAFA",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  totalItem: {
    backgroundColor: "#FFF9E6",
    paddingVertical: 12,
  },
  feeWithCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: "400",
    color: "#666",
    flex: 1,
  },
  dropdownFeeText: {
    fontSize: 13,
    fontWeight: "400",
    color: "#999",
    fontStyle: "italic",
  },
  dropdownCouvertText: {
    fontSize: 13,
    fontWeight: "400",
    color: "#d97706",
    fontStyle: "italic",
  },
  dropdownItemAmount: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
    minWidth: 70,
    textAlign: "right",
  },
  subtotalText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  subtotalAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    minWidth: 70,
    textAlign: "right",
  },
  totalText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#8B2E8F",
  },
  totalAmount: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#8B2E8F",
    minWidth: 70,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: 4,
  },
  totalCardWrapper: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginTop: 6,
  },
  totalCardLabel: {
    fontSize: 15,
    fontWeight: "400",
    color: "#000",
  },
  totalCardAmount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  calculationDetailsCard: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    marginTop: 12,
    gap: 8,
  },
  calculationDetailsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  calculationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  calculationLabel: {
    fontSize: 13,
    color: "#666",
  },
  calculationValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
  },
  calculationTotal: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: 4,
    paddingTop: 8,
  },
  calculationTotalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  calculationTotalValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8B2E8F",
  },
  validationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  validationText: {
    fontSize: 11,
    color: "#10b981",
    fontWeight: "500",
  },
  saveButton: {
    marginHorizontal: 0,
    marginTop: 24,
    marginBottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#8B2E8F",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffff00",
  },
});
