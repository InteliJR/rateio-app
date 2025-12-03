import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import billService, { UploadBillResponse } from '../../../services/bill.service';

// Mock data for development if needed, or types
interface BillItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  assignedParticipants: string[]; // List of participant names
}

export default function ScannedBillScreen() {
  const router = useRouter();
  const { id, participants: participantsParam } = useLocalSearchParams();

  const [loading, setLoading] = useState(false);
  const [billName, setBillName] = useState('Conta');
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

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

    // Fetch bill details or use mock if just created
    // For now, we'll simulate some items if none exist, matching the image
    if (id) {
      loadBill(id as string);
    } else {
      // Fallback mock data matching the image
      setItems([
        { id: '1', name: 'Suco de Laranja', quantity: 3, price: 36.00, assignedParticipants: [] },
        { id: '2', name: 'Batata Frita', quantity: 4, price: 85.00, assignedParticipants: [] },
        { id: '3', name: 'Sorvete', quantity: 4, price: 48.00, assignedParticipants: [] },
        { id: '4', name: 'Cerveja', quantity: 2, price: 15.00, assignedParticipants: [] },
      ]);
      setBillName('Conta 1');
    }
  }, [id, participantsParam]);

  const loadBill = async (billId: string) => {
    setLoading(true);
    try {
      const bill = await billService.getBill(billId);
      setBillName(bill.establishmentName || 'Conta');

      if (bill.items && bill.items.length > 0) {
        const mappedItems = bill.items.map((item: { description: string; amount: number }, index: number) => ({
          id: index.toString(), // API might not return ID for items yet
          name: item.description,
          quantity: item.amount || 1, // Assuming amount is quantity? Or price? The interface says 'amount', usually price.
          price: item.amount,
          assignedParticipants: []
        }));
        setItems(mappedItems);
      } else {
        // Use mock data if API returns empty (for testing UI)
        setItems([
          { id: '1', name: 'Suco de Laranja', quantity: 3, price: 36.00, assignedParticipants: [] },
          { id: '2', name: 'Batata Frita', quantity: 4, price: 85.00, assignedParticipants: [] },
          { id: '3', name: 'Sorvete', quantity: 4, price: 48.00, assignedParticipants: [] },
          { id: '4', name: 'Cerveja', quantity: 2, price: 15.00, assignedParticipants: [] },
        ]);
        setBillName('Conta 1');
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

  const deleteItem = (itemId: string) => {
    Alert.alert(
      'Excluir item',
      'Tem certeza que deseja excluir este item?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            setItems(prev => prev.filter(i => i.id !== itemId));
          }
        }
      ]
    );
  };

  const handleAddItem = () => {
    // Logic to add a new manual item
    Alert.alert('Adicionar Item', 'Funcionalidade de adicionar item manual será implementada em breve.');
  };

  const handleSummary = () => {
    // Navigate to summary screen
    // router.push('/(tabs)/(create)/summary');
    Alert.alert('Resumo', 'Navegar para tela de resumo');
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
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
        <Text style={styles.billName}>{billName}</Text>
        <TouchableOpacity style={styles.addItemButton} onPress={handleAddItem}>
          <Text style={styles.addItemButtonText}>+ Item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {items.map((item) => {
          const isExpanded = expandedItemId === item.id;

          return (
            <View key={item.id} style={styles.cardContainer}>
              <TouchableOpacity
                style={[styles.cardHeader, isExpanded && styles.cardHeaderExpanded]}
                onPress={() => toggleExpand(item.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemQuantity}>{item.quantity}x</Text>
                  <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                  <Ionicons
                    name={isExpanded ? "caret-up" : "caret-down"} // Changed to caret to match standard accordion, or could use chevron-forward
                    size={16}
                    color="#666"
                    style={{ marginLeft: 8 }}
                  />
                </View>
              </TouchableOpacity>

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
                    <TouchableOpacity onPress={() => deleteItem(item.id)}>
                      <Ionicons name="trash-outline" size={20} color="#666" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => toggleExpand(item.id)} // Close on "Adicionar" (Confirm)
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
        <TouchableOpacity style={styles.summaryButton} onPress={handleSummary}>
          <Text style={styles.summaryButtonText}>Visualizar resumo</Text>
        </TouchableOpacity>
      </View>
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
  billName: {
    fontSize: 24,
    color: '#000',
    fontWeight: '400',
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
    paddingBottom: 100,
  },
  cardContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  cardHeaderExpanded: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemName: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  itemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  itemQuantity: {
    fontSize: 16,
    color: '#000',
  },
  itemPrice: {
    fontSize: 16,
    color: '#000',
  },
  cardBody: {
    padding: 16,
    backgroundColor: '#fff',
  },
  participantsList: {
    maxHeight: 200, // Limit height if many participants
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
    justifyContent: 'space-between',
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
