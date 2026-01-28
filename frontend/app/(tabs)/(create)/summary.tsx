import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useBillStore } from '../../../store/billStore';

interface ParticipantSummary {
  name: string;
  totalAmount: number;
  items: Array<{
    name: string;
    amount: number;
  }>;
  fees: Array<{
    name: string;
    amount: number;
  }>;
  paysFee: boolean;
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

export default function SummaryScreen() {
  const router = useRouter();
  const { billName, items: itemsParam, participants: participantsParam } = useLocalSearchParams();
  const [summary, setSummary] = useState<BillSummaryData>({
    billId: '',
    establishmentName: '',
    totalAmount: 0,
    itemsTotal: 0,
    feesTotal: 0,
    grandTotal: 0,
    participants: [],
  });
  const [expandedIndex, setExpandedIndex] = useState<number>(-1);
  const [serviceFeePercentage, setServiceFeePercentage] = useState(10); // 10% padrão

  useEffect(() => {
    calculateSummary();
  }, [itemsParam, participantsParam]);

  const calculateSummary = () => {
    try {
      // Se houver dados passados, processar; senão usar mock
      if (itemsParam && participantsParam) {
        const items = JSON.parse(itemsParam as string);
        const participants = JSON.parse(participantsParam as string);
        const feePercentage = serviceFeePercentage; // Taxa fixa de 10%

        // Agrupar valores por participante
        const participantTotals: Record<string, { name: string; itemsTotal: number; items: Array<{ name: string; amount: number }> }> = {};

        participants.forEach((name: string) => {
          participantTotals[name] = {
            name,
            itemsTotal: 0,
            items: [],
          };
        });

        // Somar itens por participante
        // No frontend, `item.price` agora é o VALOR UNITÁRIO.
        // O valor total do item = quantity × price.
        items.forEach((item: any) => {
          if (item.assignedParticipants && item.assignedParticipants.length > 0) {
            const totalItemAmount = (item.price || 0) * (item.quantity || 1);
            const sharePerPerson = totalItemAmount / item.assignedParticipants.length;
            item.assignedParticipants.forEach((personName: string) => {
              if (participantTotals[personName]) {
                participantTotals[personName].itemsTotal += sharePerPerson;
                participantTotals[personName].items.push({
                  name: item.name,
                  amount: sharePerPerson,
                });
              }
            });
          }
        });

        // Calcular taxas e total
        const participantsList = Object.values(participantTotals).map(p => {
          return {
            name: p.name,
            totalAmount: p.itemsTotal, // Será atualizado com a taxa se aplicável
            items: p.items,
            fees: [] as Array<{ name: string; amount: number }>,
            paysFee: true, // Padrão: todos pagam taxa
          };
        });

        const itemsTotal = participantsList.reduce((sum, p) => sum + p.items.reduce((s, i) => s + i.amount, 0), 0);
        const feesTotal = participantsList.reduce((sum, p) => {
          return sum + (p.fees?.reduce((s, f) => s + f.amount, 0) || 0);
        }, 0);

        setSummary({
          billId: '1',
          establishmentName: (billName && typeof billName === 'string' ? billName : 'Conta') as string,
          totalAmount: itemsTotal,
          itemsTotal,
          feesTotal,
          grandTotal: itemsTotal + feesTotal,
          participants: participantsList,
        });
      }
    } catch (error) {
      console.error('Erro ao calcular resumo:', error);
    }
  };

  const formatCurrency = (value?: number): string => {
    if (!value) return 'R$ 0,00';
    return `R$ ${value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const toggleParticipantFee = (index: number) => {
    setSummary(prev => {
      const newParticipants = [...prev.participants];
      newParticipants[index] = {
        ...newParticipants[index],
        paysFee: !newParticipants[index].paysFee,
      };

      // Recalcular totais com base em quem paga taxa
      const totalItemsAmount = newParticipants.reduce((sum, p) => {
        return sum + p.items.reduce((s, i) => s + i.amount, 0);
      }, 0);

      // Dividir taxa apenas entre quem paga
      const peopleWhoPay = newParticipants.filter(p => p.paysFee).length;
      const feePerPerson = peopleWhoPay > 0 ? (totalItemsAmount * serviceFeePercentage) / 100 / peopleWhoPay : 0;

      // Atualizar cada participante com sua taxa
      const updatedParticipants = newParticipants.map(p => {
        const itemsAmount = p.items.reduce((sum, i) => sum + i.amount, 0);
        const feeAmount = p.paysFee ? (itemsAmount * serviceFeePercentage) / 100 : 0;
        return {
          ...p,
          totalAmount: itemsAmount + feeAmount,
          fees: feeAmount > 0 ? [{ name: 'Taxa de Serviço', amount: feeAmount }] : [],
        };
      });

      const newFeesTotal = updatedParticipants.reduce((sum, p) => {
        return sum + (p.fees?.reduce((s, f) => s + f.amount, 0) || 0);
      }, 0);

      return {
        ...prev,
        participants: updatedParticipants,
        feesTotal: newFeesTotal,
        grandTotal: totalItemsAmount + newFeesTotal,
      };
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
              {billName || summary.establishmentName}
            </Text>
          </View>

          {/* Lista de Participantes */}
          {summary.participants.map((participant, index) => (
            <View key={`participant-${index}`} style={styles.participantCardWrapper}>
              <TouchableOpacity
                style={styles.participantCardMain}
                onPress={() =>
                  setExpandedIndex(expandedIndex === index ? -1 : index)
                }
                activeOpacity={0.7}
              >
                <View style={styles.participantCardLeft}>
                  <Text style={styles.participantName}>{participant.name}</Text>
                </View>
                <View style={styles.participantCardRight}>
                  <Text style={styles.participantAmount}>
                    {formatCurrency(participant.totalAmount)}
                  </Text>
                  <MaterialCommunityIcons
                    name={
                      expandedIndex === index
                        ? 'chevron-down'
                        : 'chevron-right'
                    }
                    size={20}
                    color="#666"
                  />
                </View>
              </TouchableOpacity>

              {/* Dropdown com itens, taxas e checkbox */}
              {expandedIndex === index && (
                <View style={styles.dropdownWrapper}>
                  {/* Itens */}
                  {participant.items.map((item, itemIdx) => (
                    <View key={`item-${itemIdx}`} style={styles.dropdownItem}>
                      <Text 
                        style={styles.dropdownItemText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.dropdownItemAmount}>
                        {formatCurrency(item.amount)}
                      </Text>
                    </View>
                  ))}

                  {/* Taxa com Checkbox */}
                  <TouchableOpacity
                    style={[styles.dropdownItem, styles.dropdownFeeItem]}
                    onPress={() => toggleParticipantFee(index)}
                    activeOpacity={0.6}
                  >
                    <View style={styles.feeWithCheckbox}>
                      <View style={[styles.checkbox, participant.paysFee && styles.checkboxActive]}>
                        {participant.paysFee && (
                          <MaterialCommunityIcons name="check" size={12} color="#8B2E8F" />
                        )}
                      </View>
                      <Text style={styles.dropdownFeeText}>Taxa de Serviço</Text>
                    </View>
                    <Text style={styles.dropdownItemAmount}>
                      {formatCurrency(participant.fees[0]?.amount || 0)}
                    </Text>
                  </TouchableOpacity>
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

          {/* Botão Salvar */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Salvar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2,
  },
  backButtonText: {
    fontSize: 28,
    fontWeight: '300',
    color: '#000',
    lineHeight: 28,
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    gap: 4,
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
  addItemButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#8B2E8F',
    borderRadius: 18,
  },
  addItemButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B2E8F',
  },
  participantCardWrapper: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  participantCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  participantCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '400',
    color: '#000',
  },
  participantCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    minWidth: 75,
    textAlign: 'right',
  },
  dropdownWrapper: {
    backgroundColor: '#F8F8F8',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.3,
    borderColor: '#ccc',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxActive: {
    borderColor: '#8B2E8F',
    backgroundColor: '#fff',
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F8F8',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    minHeight: 44,
  },
  dropdownFeeItem: {
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0,
  },
  feeWithCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666',
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  dropdownFeeText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999',
    fontStyle: 'italic',
  },
  dropdownItemAmount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B2E8F',
    minWidth: 70,
    textAlign: 'right',
    flexShrink: 0,
  },
  totalCardWrapper: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 6,
  },
  totalCardLabel: {
    fontSize: 15,
    fontWeight: '400',
    color: '#000',
  },
  totalCardAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  saveButton: {
    marginHorizontal: 0,
    marginTop: 24,
    marginBottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#8B2E8F',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffff00',
  },
});
