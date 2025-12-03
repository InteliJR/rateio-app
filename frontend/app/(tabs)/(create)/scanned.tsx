import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import billService, { UploadBillResponse } from '../../../services/bill.service';
import { ItemCard, BillItem } from '../../../components/items/ItemCard';
import { AddItemModal } from '../../../components/modals/AddItemModal';

export default function ScannedBillScreen() {
  const router = useRouter();
  const { id, participants: participantsParam } = useLocalSearchParams();

  const [loading, setLoading] = useState(false);
  const [billName, setBillName] = useState('Conta');
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Auto-save state
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    // Parse participants from params
    if (participantsParam) {
      try {
        const parsed = JSON.parse(participantsParam as string);
        setParticipants(parsed);
      } catch (e) {
        console.error('Error parsing participants', e);
        setParticipants([]);
      }
    }

    if (id) {
      loadBill(id as string);
    } else {
      // Fallback mock data
      setItems([
        { id: '1', name: 'Suco de Laranja', quantity: 3, price: 36.00, assignedParticipants: [] },
        { id: '2', name: 'Batata Frita', quantity: 4, price: 85.00, assignedParticipants: [] },
        { id: '3', name: 'Sorvete', quantity: 4, price: 48.00, assignedParticipants: [] },
        { id: '4', name: 'Cerveja', quantity: 2, price: 15.00, assignedParticipants: [] },
      ]);
      setBillName('Conta 1');
    }
  }, [id, participantsParam]);

  // Debounced Auto-save
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (id && items.length > 0) {
      setIsSaving(true);
      saveTimeoutRef.current = setTimeout(() => {
        saveToBackend();
      }, 1500); // 1.5s debounce
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [items, billName]);

  const saveToBackend = async () => {
    if (!id) return;

    try {
      // Prepare payload: split items based on quantity
      const payloadItems: { description: string; amount: number }[] = [];

      items.forEach(item => {
        if (item.quantity > 1) {
          const unitPrice = item.price / item.quantity;
          for (let i = 0; i < item.quantity; i++) {
            payloadItems.push({
              description: item.name,
              amount: Number(unitPrice.toFixed(2)) // Ensure 2 decimal places
            });
          }
        } else {
          payloadItems.push({
            description: item.name,
            amount: item.price
          });
        }
      });

      await billService.updateBill(id as string, {
        items: payloadItems,
        establishmentName: billName
      });

      // Artificial delay to show the "Saving" state for a bit longer if it was too fast
      setTimeout(() => setIsSaving(false), 500);
    } catch (error) {
      console.error('Error auto-saving bill', error);
      setIsSaving(false);
      // Optional: Show error toast/alert, but maybe too intrusive for auto-save
    }
  };

  const loadBill = async (billId: string) => {
    setLoading(true);
    try {
      const bill = await billService.getBill(billId);
      setBillName(bill.establishmentName || 'Conta');

      if (bill.items && bill.items.length > 0) {
        const mappedItems = bill.items.map((item: { description: string; amount: number }, index: number) => ({
          id: index.toString(),
          name: item.description,
          quantity: 1, // Backend doesn't store quantity, so we treat each entry as 1 item initially
          price: item.amount,
          assignedParticipants: []
        }));
        setItems(mappedItems);
      } else {
        // Keep mock data if empty? Or just empty.
        // For now, let's assume if it's empty we might want to show nothing or default
        // But the original code had a fallback. Let's keep it empty if API returns empty.
        setItems([]);
      }
    } catch (error) {
      console.error('Error loading bill', error);
      Alert.alert('Erro', 'Não foi possível carregar os itens da conta.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const toggleParticipant = (itemId: string, participant: string) => {
    setItems(prevItems => prevItems.map(item => {
      if (item.id === itemId) {
        const isAssigned = item.assignedParticipants.includes(participant);
        let newAssigned;
        if (isAssigned) {
          newAssigned = item.assignedParticipants.filter(p => p !== participant);
        } else {
          newAssigned = [...item.assignedParticipants, participant];
        }
        return { ...item, assignedParticipants: newAssigned };
      }
      return item;
    }));
  };

  const handleUpdateItem = (updatedItem: BillItem) => {
    setItems(prevItems => prevItems.map(item =>
      item.id === updatedItem.id ? updatedItem : item
    ));
  };

  const deleteItem = (itemId: string) => {
    Alert.alert(
      'Excluir item',
      'Tem certeza que deseja excluir este item?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            // Optimistic update
            const newItems = items.filter(i => i.id !== itemId);
            setItems(newItems);
            // The useEffect will trigger the save
          }
        }
      ]
    );
  };

  const handleAddItem = () => {
    setIsModalVisible(true);
  };

  const handleAddNewItem = async (newItem: Omit<BillItem, 'id' | 'assignedParticipants'>) => {
    // Optimistic add
    const tempId = Date.now().toString();
    setItems(prev => [...prev, { ...newItem, id: tempId, assignedParticipants: [] }]);
    // The useEffect will trigger the save
  };

  const handleSummary = () => {
    Alert.alert('Resumo', 'Navegar para tela de resumo');
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.price, 0);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#81007F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <TextInput
            style={styles.billNameInput}
            value={billName}
            onChangeText={setBillName}
            placeholder="Nome da conta"
          />
          {isSaving && (
            <View style={styles.savingIndicator}>
              <ActivityIndicator size="small" color="#81007F" />
              <Text style={styles.savingText}>Salvando...</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.addItemButton} onPress={handleAddItem}>
          <Text style={styles.addItemButtonText}>+ Item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {items.map((item) => {
          const isExpanded = expandedItemId === item.id;

          return (
            <View key={item.id} style={styles.itemWrapper}>
              <ItemCard
                item={item}
                onDelete={deleteItem}
                onUpdate={handleUpdateItem}
                onPress={() => toggleExpand(item.id)}
              />

              {isExpanded && (
                <View style={styles.cardBody}>
                  <ScrollView style={styles.participantsList} nestedScrollEnabled={true}>
                    {participants.map((participant, index) => {
                      const isSelected = item.assignedParticipants.includes(participant);
                      return (
                        <TouchableOpacity
                          key={index}
                          style={styles.participantRow}
                          onPress={() => toggleParticipant(item.id, participant)}
                        >
                          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="#81007F" />}
                          </View>
                          <Text style={styles.participantName}>{participant}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => toggleExpand(item.id)}
                    >
                      <Text style={styles.addButtonText}>Adicionar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>{formatCurrency(calculateTotal())}</Text>
        </View>
        <TouchableOpacity style={styles.summaryButton} onPress={handleSummary}>
          <Text style={styles.summaryButtonText}>Visualizar resumo</Text>
        </TouchableOpacity>
      </View>

      <AddItemModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onAdd={handleAddNewItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 16,
  },
  billNameInput: {
    fontSize: 24,
    color: '#000',
    fontWeight: '400',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingVertical: 4,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  savingText: {
    fontSize: 12,
    color: '#81007F',
    marginLeft: 4,
  },
  addItemButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#81007F',
  },
  addItemButtonText: {
    color: '#81007F',
    fontWeight: '500',
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 160,
  },
  itemWrapper: {
    marginBottom: 8,
  },
  cardBody: {
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginTop: -12, // Overlap with card
    paddingTop: 24, // Space for overlap
    marginBottom: 16,
  },
  participantsList: {
    maxHeight: 200,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    borderColor: '#81007F',
  },
  participantName: {
    fontSize: 14,
    color: '#666',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  addButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#81007F',
  },
  addButtonText: {
    color: '#81007F',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#81007F',
  },
  summaryButton: {
    backgroundColor: '#81007F',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryButtonText: {
    color: '#FFFF00',
    fontSize: 18,
    fontWeight: '500',
  },
});
