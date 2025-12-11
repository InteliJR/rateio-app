import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BillItem } from '../../../components/items/ItemCard';
import { AddItemModal } from '../../../components/modals/AddItemModal';
import billService from '../../../services/bill.service';
import itemsService from '../../../services/items.service';
import participantsService, { Participant } from '../../../services/participants.service';

// Dados mockados como no Figma
const MOCK_ITEMS: BillItem[] = [
  { id: '1', name: 'Suco de Laranja', price: 36.00, quantity: 3, assignedParticipants: [] },
  { id: '2', name: 'Batata Frita', price: 85.00, quantity: 4, assignedParticipants: [] },
  { id: '3', name: 'Sorvete', price: 48.00, quantity: 4, assignedParticipants: [] },
  { id: '4', name: 'Cerveja', price: 15.00, quantity: 2, assignedParticipants: [] },
];

const MOCK_PARTICIPANTS = ['Nome Sobrenome 1', 'Nome Sobrenome 2', 'Nome Sobrenome 3', 'Nome Sobrenome 4', 'Nome Sobrenome 5'];

export default function ScannedBillScreen() {
  const { id, participants: participantsParam } = useLocalSearchParams();
  const router = useRouter();

  const [billName, setBillName] = useState('');
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    loadBillData();
  }, [id]);

  const loadBillData = async () => {
    try {
      setLoading(true);
      
      // TODO: Remover mock quando OCR estiver funcionando
      // MOCK DATA para visualizar o design
      setBillName('Conta 1');
      setItems([
        { id: '1', name: 'Suco de Laranja', price: 36.00, quantity: 3, assignedParticipants: [] },
        { id: '2', name: 'Batata Frita', price: 85.00, quantity: 4, assignedParticipants: [] },
        { id: '3', name: 'Sorvete', price: 48.00, quantity: 4, assignedParticipants: [] },
        { id: '4', name: 'Cerveja', price: 15.00, quantity: 2, assignedParticipants: [] },
      ]);
      setParticipants(['Nome Sobrenome 1', 'Nome Sobrenome 2', 'Nome Sobrenome 3', 'Nome Sobrenome 4', 'Nome Sobrenome 5']);
      
      /* CÓDIGO REAL - Load participants from backend
      const participantsData = await participantsService.getParticipantsByBill(id as string);
      setParticipants(participantsData.map((p: Participant) => p.name));
      */
      
      /* CÓDIGO REAL (comentado temporariamente):
      // Load bill details
      const billData = await billService.getBill(id as string);
      setBillName(billData.establishmentName || '');
      
      // Load items
      const itemsData = await itemsService.getItems(id as string);
      setItems(itemsData);
      
      // Load participants
      const participantsData = await participantsService.getParticipantsByBill(id as string);
      setParticipants(participantsData.map((p: Participant) => p.name));
      */
      
    } catch (error) {
      console.error('Error loading bill data:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados da conta');
    } finally {
      setLoading(false);
    }
  };

  const saveBillName = async () => {
    if (!billName.trim()) return;
    
    try {
      setSavingName(true);
      await billService.updateBill(id as string, { establishmentName: billName.trim() });
    } catch (error) {
      console.error('Error saving bill name:', error);
      Alert.alert('Erro', 'Não foi possível salvar o nome da conta');
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    if (participantsParam) {
      try {
        const parsed = JSON.parse(participantsParam as string);
        setParticipants(parsed);
      } catch (e) {
        setParticipants(MOCK_PARTICIPANTS);
      }
    }
  }, [participantsParam]);

  const toggleParticipant = (itemId: string, participant: string) => {
    setItems(prevItems =>
      prevItems.map(item => {
        if (item.id === itemId) {
          const isAssigned = item.assignedParticipants.includes(participant);
          return {
            ...item,
            assignedParticipants: isAssigned
              ? item.assignedParticipants.filter(p => p !== participant)
              : [...item.assignedParticipants, participant],
          };
        }
        return item;
      })
    );
  };

  const handleAddNewItem = (newItem: Omit<BillItem, 'id' | 'assignedParticipants'>) => {
    const newId = Date.now().toString();
    setItems([...items, { ...newItem, id: newId, assignedParticipants: [] }]);
    setIsModalVisible(false);
  };

  const deleteItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
    if (expandedItemId === itemId) {
      setExpandedItemId('');
    }
  };

  const handleSummary = () => {
    router.push({
      pathname: '/(tabs)/(create)/summary',
      params: {
        billName: billName,
        items: JSON.stringify(items),
        participants: JSON.stringify(participants),
      },
    });
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#81007F" />
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.contentContainer}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.billNameContainer}>
                <TextInput
                  style={styles.billNameInput}
                  value={billName}
                  onChangeText={setBillName}
                  onBlur={saveBillName}
                  placeholder="Nome da conta"
                />
                {savingName && (
                  <ActivityIndicator size="small" color="#81007F" style={styles.savingIndicator} />
                )}
              </View>
              <TouchableOpacity
                style={styles.addItemBtn}
                onPress={() => setIsModalVisible(true)}
              >
                <Text style={styles.addItemBtnText}>+ Item</Text>
              </TouchableOpacity>
            </View>

          {/* Lista de items */}
          {items.map((item, index) => (
            <View key={item.id} style={styles.itemCardWrapper}>
              <TouchableOpacity
                style={styles.itemCardMain}
                onPress={() => setExpandedItemId(expandedItemId === item.id ? '' : item.id)}
                activeOpacity={0.7}
              >
                <View style={styles.itemCardLeft}>
                  <Text style={styles.itemCardName}>{item.name}</Text>
                </View>
                <View style={styles.itemCardRight}>
                  <Text style={styles.itemCardQty}>{item.quantity}x</Text>
                  <Text style={styles.itemCardAmount}>
                    {formatCurrency(item.price)}
                  </Text>
                  <Ionicons
                    name={expandedItemId === item.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#666"
                  />
                </View>
              </TouchableOpacity>

              {/* Dropdown com checkboxes */}
              {expandedItemId === item.id && (
                <View style={styles.dropdownWrapper}>
                  <ScrollView
                    style={styles.checkboxesScroll}
                    scrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                  >
                    <View style={styles.checkboxesList}>
                      {participants.map((participant, idx) => {
                        const isAssigned = item.assignedParticipants.includes(participant);
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={styles.checkboxRow}
                            onPress={() => toggleParticipant(item.id, participant)}
                            activeOpacity={0.6}
                          >
                            <View style={[styles.checkbox, isAssigned && styles.checkboxActive]}>
                              {isAssigned && (
                                <Ionicons name="checkmark" size={10} color="#8B2E8F" />
                              )}
                            </View>
                            <Text style={styles.participantName}>{participant}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Buttons Footer Row */}
                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      style={styles.deleteIconButton}
                      onPress={() => deleteItem(item.id)}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color="#999" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addItemButton}
                      onPress={() => setIsModalVisible(true)}
                    >
                      <Text style={styles.addItemButtonLabel}>Adicionar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}

          {/* Card do Total */}
          <View style={styles.totalCardWrapper}>
            <Text style={styles.totalCardLabel}>Total:</Text>
            <Text style={styles.totalCardAmount}>{formatCurrency(calculateTotal())}</Text>
          </View>

          {/* Botão Visualizar Resumo */}
          <TouchableOpacity style={styles.summaryBtn} onPress={handleSummary}>
            <Text style={styles.summaryBtnText}>Visualizar resumo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      )}

      <AddItemModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onAdd={handleAddNewItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  billNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  billNameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    paddingVertical: 4,
  },
  savingIndicator: {
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  addItemBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#8B2E8F',
    borderRadius: 16,
  },
  addItemBtnText: {
    color: '#8B2E8F',
    fontSize: 12,
    fontWeight: '600',
  },
  itemCardWrapper: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  itemCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
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
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  checkboxesScroll: {
    maxHeight: 160,
  },
  checkboxesList: {
    paddingRight: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
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
  participantName: {
    fontSize: 13,
    fontWeight: '400',
    color: '#555',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    gap: 12,
  },
  deleteIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addItemButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: '#8B2E8F',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addItemButtonLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B2E8F',
  },
  totalCardWrapper: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  summaryBtn: {
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
  summaryBtnText: {
    color: '#ffff00',
    fontSize: 16,
    fontWeight: '600',
  },
});
