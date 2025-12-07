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
import itemsService from '../../../services/items.service';
import { ItemCard, BillItem } from '../../../components/items/ItemCard';
import { AddItemModal } from '../../../components/modals/AddItemModal';

export default function ScannedBillScreen() {
  const router = useRouter();
  const { id, participants: participantsParam } = useLocalSearchParams();

  // State management
  const [loading, setLoading] = useState(false);
  const [billName, setBillName] = useState('Conta');
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Parse participants
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
      loadBillData();
    }
  }, [id, participantsParam]);

  const loadBillData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Load bill details for name
      const bill = await billService.getBill(id as string);
      setBillName(bill.establishmentName || 'Conta');

      // Load items via service
      const fetchedItems = await itemsService.getItems(id as string);
      setItems(fetchedItems);
    } catch (error) {
      console.error('Error loading bill', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  const saveBillName = async (name: string) => {
    if (!id) return;
    setIsSaving(true);
    try {
      await billService.updateBill(id as string, { establishmentName: name });
    } catch (error) {
      console.error('Error saving name', error);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  // Debounce bill name save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (id && billName) {
        saveBillName(billName);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [billName]);

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
    // Note: participant assignment might need persistent storage logic too, 
    // but the task focused on CRUD Items. Assuming local state for now or needs updateItem.
    // For now, let's keep it local as per original code, or adding it to service?
    // The original code didn't save participant assignment to backend in the `updateBill` payload shown!
  };

  const handleUpdateItem = async (updatedItem: BillItem) => {
    if (!id) return;

    // Optimistic update
    setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    setIsSaving(true);

    try {
      await itemsService.updateItem(id as string, updatedItem.id, updatedItem);
    } catch (error) {
      Alert.alert('Erro', 'Falha ao atualizar item');
      // Revert? itemsService.getItems(id)
    } finally {
      setIsSaving(false);
    }
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
            if (!id) return;
            // Optimistic
            setItems(prev => prev.filter(i => i.id !== itemId));
            setIsSaving(true);
            try {
              await itemsService.deleteItem(id as string, itemId);
            } catch (error) {
              Alert.alert('Erro', 'Falha ao excluir item');
              loadBillData(); // Revert
            } finally {
              setIsSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleAddItem = () => {
    setIsModalVisible(true);
  };

  const handleAddNewItem = async (newItem: Omit<BillItem, 'id' | 'assignedParticipants'>) => {
    console.log('[Scanned] handleAddNewItem called with:', newItem);
    if (!id) {
      console.error('[Scanned] ID is missing in handleAddNewItem');
      return;
    }
    setIsSaving(true);
    try {
      console.log('[Scanned] Calling itemsService.createItem with id:', id);
      const updatedList = await itemsService.createItem(id as string, newItem);
      console.log('[Scanned] itemsService returned, updating state. New count:', updatedList.length);
      setItems(updatedList);
    } catch (error) {
      console.error('[Scanned] Error in handleAddNewItem:', error);
      Alert.alert('Erro', 'Falha ao criar item');
    } finally {
      setIsSaving(false);
    }
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
