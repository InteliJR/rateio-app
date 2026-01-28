import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Ionicons } from '@expo/vector-icons';
import billService from '../../../services/bill.service';

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
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);

  useEffect(() => {
    loadBillDetails();
  }, [id]);

  const loadBillDetails = async () => {
    try {
      setLoading(true);
      const response = await billService.getSummary(id as string);
      
      // Mapear resposta da API agrupando por item (não por participante)
      const itemMap = new Map<string, { item: any; people: BillPerson[] }>();
      
      response.participants.forEach(participant => {
        participant.items.forEach(item => {
          if (!itemMap.has(item.name)) {
            itemMap.set(item.name, {
              item: item,
              people: []
            });
          }
          itemMap.get(item.name)!.people.push({
            name: participant.name,
            amount: item.shareAmount
          });
        });
      });

      const billItems: BillItem[] = Array.from(itemMap.values()).map(({ item, people }) => ({
        description: item.name,
        amount: item.totalPrice,
        quantity: item.quantity,
        people
      }));

      setBill({
        id: response.bill.id,
        establishmentName: response.bill.establishmentName,
        totalAmount: response.summary.total,
        createdAt: response.bill.createdAt,
        items: billItems,
      });
    } catch (err) {
      console.error('Erro ao carregar conta:', err);
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

  if (!bill) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Conta não encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const items = bill.items || [];

  return (
    <SafeAreaView style={styles.container}>
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
            <Text style={styles.titleText}>{bill.establishmentName}</Text>
            <TouchableOpacity style={styles.editButton}>
              <Text style={styles.editButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Itens */}
          {items.map((item, index) => (
            <View key={`item-${index}`} style={styles.itemCardWrapper}>
              <TouchableOpacity
                style={styles.itemCardMain}
                onPress={() =>
                  setExpandedIndex(expandedIndex === index ? -1 : index)
                }
                activeOpacity={0.7}
              >
                <View style={styles.itemCardLeft}>
                  <Text style={styles.itemCardName}>{item.description}</Text>
                </View>
                <View style={styles.itemCardRight}>
                  <Text style={styles.itemCardQty}>{item.quantity}x</Text>
                  <Text style={styles.itemCardAmount}>
                    {formatCurrency(item.amount)}
                  </Text>
                  <MaterialCommunityIcons
                    name={
                      expandedIndex === index && item.people && item.people.length > 0
                        ? "chevron-down"
                        : "chevron-right"
                    }
                    size={20}
                    color="#666"
                  />
                </View>
              </TouchableOpacity>

              {/* Dropdown com lista de pessoas */}
              {expandedIndex === index &&
                item.people &&
                item.people.length > 0 && (
                  <View style={styles.dropdownWrapper}>
                    {item.people.map((person, idx) => (
                      <View key={`person-${idx}`} style={styles.dropdownItem}>
                        <Text style={styles.dropdownItemText}>{person.name}</Text>
                        <Text style={styles.dropdownItemAmount}>
                          {formatCurrency(person.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
            </View>
          ))}

          {/* Card do Total */}
          <View style={styles.totalCardWrapper}>
            <Text style={styles.totalCardLabel}>Valor Total</Text>
            <Text style={styles.totalCardAmount}>
              {formatCurrency(bill.totalAmount)}
            </Text>
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
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 20,
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
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  itemCardWrapper: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  itemCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  itemCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemCardName: {
    fontSize: 15,
    fontWeight: '400',
    color: '#000',
  },
  itemCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemCardQty: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
  },
  itemCardAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    minWidth: 75,
    textAlign: 'right',
  },
  dropdownWrapper: {
    backgroundColor: '#F8F8F8',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666',
    flex: 1,
  },
  dropdownItemAmount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B2E8F',
    minWidth: 70,
    textAlign: 'right',
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
  reuseButton: {
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
});