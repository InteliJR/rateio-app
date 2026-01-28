import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Ionicons } from '@expo/vector-icons';
import billService, { BillSummaryResponse } from '../../../services/bill.service';

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
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [data, setData] = useState<BillSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);

  useEffect(() => {
    loadBillDetails();
  }, [id]);

  const loadBillDetails = async () => {
    try {
      setLoading(true);
      const response = await billService.getSummary(id as string);
      setData(response);
    } catch (err) {
      console.error('Erro ao carregar conta:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value?: number): string => {
    if (value === undefined || value === null) return 'R$ 0,00';
    return `R$ ${value.toLocaleString('pt-BR', {
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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B2E8F" />
          <Text style={styles.loadingText}>Carregando conta...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Conta não encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
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
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={22} color="#000" />
            </TouchableOpacity>
            <Text style={styles.titleText}>{data.bill.establishmentName || 'Detalhes'}</Text>
            <TouchableOpacity style={styles.editButton}>
              <Text style={styles.editButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>

          {/* Aviso de Falha (Se houver) */}
          {data.bill.status === 'OCR_FAILED' && (
            <View style={styles.warningCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#D32F2F" />
              <View style={styles.warningContent}>
                <Text style={styles.warningTitle}>Falha no processamento</Text>
                <Text style={styles.warningText}>
                  Não foi possível ler os itens da nota automaticamente. Por favor, verifique os valores ou edite manualmente.
                </Text>
              </View>
            </View>
          )}

          {/* Seção de Itens da Conta */}
          <Text style={styles.sectionTitle}>Itens da Conta</Text>
          <View style={styles.sectionCard}>
            {(data.items || []).map((item, index) => (
              <View key={item.id} style={[
                styles.itemRow,
                index < (data.items || []).length - 1 && styles.borderBottom
              ]}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemQty}>{item.quantity}x {formatCurrency(item.unitPrice)}</Text>
                </View>
                <Text style={styles.itemTotal}>{formatCurrency(item.totalPrice)}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.summary?.subtotal)}</Text>
            </View>
          </View>

          {/* Seção de Participantes */}
          <Text style={styles.sectionTitle}>Por Pessoa</Text>
          {(data.participants || []).map((participant) => (
            <View key={participant.id} style={styles.participantCardWrapper}>
              <TouchableOpacity
                style={styles.participantHeader}
                onPress={() => toggleParticipant(participant.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.participantName}>{participant.name}</Text>
                <View style={styles.participantHeaderRight}>
                  <Text style={styles.participantTotal}>
                    {formatCurrency(participant.total)}
                  </Text>
                  <MaterialCommunityIcons
                    name={expandedParticipantId === participant.id ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#666"
                  />
                </View>
              </TouchableOpacity>

              {expandedParticipantId === participant.id && (
                <View style={styles.participantDetails}>
                  {/* Itens do participante */}
                  {(participant.items || []).map((item) => (
                    <View key={item.id} style={styles.detailRow}>
                      <Text style={styles.detailText}>{item.name} ({item.quantity > 1 ? `${item.quantity}x` : '1x'})</Text>
                      <Text style={styles.detailValue}>{formatCurrency(item.shareAmount)}</Text>
                    </View>
                  ))}

                  {/* Taxas do participante */}
                  {participant.feeDetails && participant.feeDetails.length > 0 && (
                    <>
                      <View style={styles.detailDivider} />
                      {participant.feeDetails.map((fee) => (
                        <View key={fee.id} style={styles.detailRow}>
                          <Text style={styles.detailTextFee}>
                            {fee.type === 'SERVICE_PERCENTAGE' ? 'Serviço' :
                              fee.type === 'COVER_CHARGE' ? 'Couvert' : 'Taxa'}
                          </Text>
                          <Text style={styles.detailValueFee}>{formatCurrency(fee.participantShare)}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          ))}

          {/* Resumo Final */}
          <View style={styles.finalSummaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.summary.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxas / Serviço</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.summary.totalFees)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.marginTop]}>
              <Text style={styles.finalTotalLabel}>Total Geral</Text>
              <Text style={styles.finalTotalValue}>{formatCurrency(data.summary.total)}</Text>
            </View>
          </View>

          {/* Botão Reutilizar Conta */}
          <TouchableOpacity style={styles.reuseButton}>
            <Text style={styles.reuseButtonText}>Reutilizar Conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7', // iOS background gray
  },
  scrollContent: {
    paddingBottom: 40,
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: -16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF', // Header should merge with nav bar visual if possible, or stay white
    gap: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  titleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#8B2E8F',
    borderRadius: 18,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B2E8F',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 4,
    marginBottom: -4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  borderBottom: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    color: '#000',
    marginBottom: 2,
  },
  itemQty: {
    fontSize: 13,
    color: '#8E8E93',
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  participantCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  participantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  participantHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B2E8F',
  },
  participantDetails: {
    backgroundColor: '#F9F9F9',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#333',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 8,
  },
  detailTextFee: {
    fontSize: 13,
    color: '#666',
  },
  detailValueFee: {
    fontSize: 13,
    color: '#666',
  },
  finalSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  marginTop: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#666',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  finalTotalLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  finalTotalValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#8B2E8F',
  },
  reuseButton: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: '#8B2E8F',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reuseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffff00',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  warningCard: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D32F2F',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 13,
    color: '#B71C1C',
    lineHeight: 18,
  },
});
