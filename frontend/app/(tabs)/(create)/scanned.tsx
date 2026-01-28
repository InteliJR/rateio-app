import React, { useState, useEffect, useRef } from 'react';
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

export default function ScannedBillScreen() {
  const { id, participants: participantsParam } = useLocalSearchParams();
  const router = useRouter();

  const [billName, setBillName] = useState('');
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [billStatus, setBillStatus] = useState<'PENDING_OCR' | 'OCR_FAILED' | 'REVIEWING' | 'DIVIDING' | 'COMPLETED' | null>(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // Estados de edição inline
  const [editingItemNameId, setEditingItemNameId] = useState<string | null>(null);
  const [editingItemPriceId, setEditingItemPriceId] = useState<string | null>(null);
  const [editingItemQtyId, setEditingItemQtyId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveTimeoutsRef = useRef<{ [key: string]: any }>({});

  useEffect(() => {
    loadBillData();
    
    // Limpar timeouts ao desmontar
    return () => {
      Object.values(saveTimeoutsRef.current).forEach(timeout => clearTimeout(timeout));
      saveTimeoutsRef.current = {};
    };
  }, [id]);

  // Polling para verificar quando OCR terminar
  useEffect(() => {
    if (billStatus === 'PENDING_OCR' && id) {
      setProcessingOcr(true);
      let attempts = 0;
      const maxAttempts = 20; // Máximo de ~2 minutos (20 * 6 segundos)
      
      const pollInterval = setInterval(async () => {
        attempts++;
        
        // Limite de tentativas para evitar polling infinito
        if (attempts > maxAttempts) {
          clearInterval(pollInterval);
          setProcessingOcr(false);
          Alert.alert(
            'Tempo limite excedido',
            'O processamento está demorando mais que o esperado. Você pode adicionar os itens manualmente.',
            [{ text: 'OK' }]
          );
          return;
        }
        
        try {
          const billData = await billService.getBill(id as string);
          setBillStatus(billData.status);
          
          if (billData.status !== 'PENDING_OCR') {
            // OCR terminou, carregar itens
            clearInterval(pollInterval);
            setProcessingOcr(false);
            
            if (billData.status === 'REVIEWING' || billData.status === 'DIVIDING') {
              // Carregar itens agora que estão disponíveis
              const itemsData = await itemsService.getItems(id as string);
              setItems(itemsData);
              
              // Atualizar nome se disponível
              if (billData.establishmentName) {
                setBillName(billData.establishmentName);
              }
            } else if (billData.status === 'OCR_FAILED') {
              Alert.alert(
                'OCR Falhou',
                'Não foi possível reconhecer os itens da conta. Você pode adicionar os itens manualmente.',
                [{ text: 'OK' }]
              );
            }
          }
        } catch (error: any) {
          console.error('Error polling bill status:', error);
          
          // Se for erro 429 (Too Many Requests), aumentar intervalo
          if (error.response?.status === 429 || error.message?.includes('Too Many Requests')) {
            console.warn('Rate limit atingido no polling, aguardando mais tempo...');
          }
          // Continuar tentando mesmo com erro até o limite
        }
      }, 6000); // Verificar a cada 6 segundos (10 req/min = 1 req a cada 6s)

      return () => clearInterval(pollInterval);
    }
  }, [billStatus, id]);

  // Inicializar nomes, preços e quantidades dos itens quando items mudarem
  useEffect(() => {
    const names: Record<string, string> = {};
    const prices: Record<string, string> = {};
    const quantities: Record<string, string> = {};
    items.forEach(item => {
      names[item.id] = item.name;
      // `item.price` no frontend agora é o VALOR UNITÁRIO
      prices[item.id] = item.price.toFixed(2).replace('.', ',');
      quantities[item.id] = item.quantity.toString();
    });
    setItemNames(names);
    setItemPrices(prices);
    setItemQuantities(quantities);
  }, [items]);

  const loadBillData = async () => {
    try {
      setLoading(true);
      
      // Limpar cache para garantir dados atualizados
      itemsService.clearCache(id as string);
      
      // Load bill details
      const billData = await billService.getBill(id as string);
      setBillStatus(billData.status);
      setBillName(billData.establishmentName || '');
      
      // Se o OCR ainda está processando, não tentar carregar itens ainda
      if (billData.status === 'PENDING_OCR') {
        setProcessingOcr(true);
        setItems([]);
      } else {
        // Load items - garantir que os IDs sejam os UUIDs reais do backend
        const itemsData = await itemsService.getItems(id as string);
        setItems(itemsData);
        setProcessingOcr(false);
      }
      
      // Load participants (sempre tentar carregar)
      try {
        const participantsData = await participantsService.getParticipantsByBill(id as string);
        setParticipants(participantsData.map((p: Participant) => p.name));
      } catch (error) {
        // Se não houver participantes ainda, não é erro crítico
        console.log('No participants found yet');
        setParticipants([]);
      }
      
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
        console.error('Error parsing participants:', e);
        setParticipants([]);
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

  const handleAddNewItem = async (newItem: Omit<BillItem, 'id' | 'assignedParticipants'>) => {
    try {
      const createdItem = await itemsService.createItem(id as string, newItem);
      setItems([...items, createdItem]);
      setIsModalVisible(false);
      // Feedback de sucesso silencioso - item aparece na lista
    } catch (error: any) {
      console.error('Error adding item:', error);
      Alert.alert('Erro', error.message || 'Não foi possível adicionar o item');
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      await itemsService.deleteItem(id as string, itemId);
      setItems(items.filter(item => item.id !== itemId));
      if (expandedItemId === itemId) {
        setExpandedItemId('');
      }
    } catch (error: any) {
      console.error('Error deleting item:', error);
      Alert.alert('Erro', error.message || 'Não foi possível remover o item');
    }
  };

  // === FUNÇÕES DE EDIÇÃO DE NOME ===
  const handleItemNameChange = (itemId: string, newName: string) => {
    setItemNames(prev => ({
      ...prev,
      [itemId]: newName,
    }));
  };

  const handleItemNameBlur = async (itemId: string) => {
    // Limpar timeout se existir
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    const trimmedName = itemNames[itemId]?.trim();
    
    // Validar que nome não está vazio - mostrar alerta e manter em modo edição
    if (!trimmedName) {
      Alert.alert('Atenção', 'O nome do item não pode ficar vazio');
      // Manter o foco no campo para o usuário digitar
      return;
    }

    // Se não mudou, apenas sair do modo de edição
    const originalItem = items.find(item => item.id === itemId);
    if (originalItem && trimmedName === originalItem.name) {
      setEditingItemNameId(null);
      return;
    }

    // Salvar no backend com debounce
    const timeoutId = setTimeout(async () => {
      try {
        setSavingItemId(itemId);
        await itemsService.updateItemName(id as string, itemId, trimmedName);
        
        // Atualizar estado local
        setItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, name: trimmedName } : item
          )
        );
      } catch (error: any) {
        console.error('Error updating item name:', error);
        
        // Extrair mensagem de erro mais amigável
        let errorMessage = 'Não foi possível atualizar o nome do item';
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        // Tratar erro 429 (Too Many Requests)
        if (error.response?.status === 429 || error.message?.includes('Too Many Requests')) {
          errorMessage = 'Muitas requisições. Aguarde um momento e tente novamente.';
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Só mostrar alert se não for erro 404
        if (error.response?.status !== 404) {
          Alert.alert('Erro', errorMessage);
        }
        
        // Reverter para o valor original em caso de erro
        const originalItem = items.find(item => item.id === itemId);
        if (originalItem) {
          setItemNames(prev => ({
            ...prev,
            [itemId]: originalItem.name,
          }));
        }
      } finally {
        setSavingItemId(null);
        setEditingItemNameId(null);
      }
    }, 500); // Debounce de 500ms

    saveTimeoutsRef.current[itemId] = timeoutId;
  };

  // === FUNÇÕES DE EDIÇÃO DE PREÇO ===
  const handleItemPriceChange = (itemId: string, newPrice: string) => {
    // Permitir apenas números, vírgula e ponto
    const cleaned = newPrice.replace(/[^0-9,.]/g, '').replace(',', '.');
    setItemPrices(prev => ({
      ...prev,
      [itemId]: cleaned.replace('.', ','),
    }));
  };

  const handleItemPriceBlur = async (itemId: string) => {
    // Limpar timeout se existir
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    const priceStr = itemPrices[itemId]?.replace(',', '.') || '0';
    const newUnitPrice = parseFloat(priceStr);
    const originalItem = items.find(item => item.id === itemId);
    
    if (!originalItem) return;

    // Validar valor unitário > 0
    if (isNaN(newUnitPrice) || newUnitPrice <= 0) {
      setItemPrices(prev => ({
        ...prev,
        [itemId]: originalItem.price.toFixed(2).replace('.', ','),
      }));
      setEditingItemPriceId(null);
      return;
    }

    // Se não mudou, apenas sair do modo de edição
    if (Math.abs(newUnitPrice - originalItem.price) < 0.01) {
      setEditingItemPriceId(null);
      return;
    }

    // Salvar no backend com debounce
    const timeoutId = setTimeout(async () => {
      try {
        setSavingItemId(itemId);
        // Atualizar PREÇO UNITÁRIO no backend
        await itemsService.updateItemPrice(id as string, itemId, newUnitPrice);
        
        // Atualizar estado local: manter convenção `price` = unitário
        setItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, price: newUnitPrice } : item
          )
        );
      } catch (error: any) {
        console.error('Error updating item price:', error);
        
        let errorMessage = 'Não foi possível atualizar o valor do item';
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        if (error.response?.status === 429 || error.message?.includes('Too Many Requests')) {
          errorMessage = 'Muitas requisições. Aguarde um momento e tente novamente.';
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (error.response?.status !== 404) {
          Alert.alert('Erro', errorMessage);
        }
        
        // Reverter para o valor original em caso de erro
        setItemPrices(prev => ({
          ...prev,
          [itemId]: originalItem.price.toFixed(2).replace('.', ','),
        }));
      } finally {
        setSavingItemId(null);
        setEditingItemPriceId(null);
      }
    }, 500);

    saveTimeoutsRef.current[itemId] = timeoutId;
  };

  // === FUNÇÕES DE EDIÇÃO DE QUANTIDADE ===
  const handleItemQuantityChange = (itemId: string, newQty: string) => {
    // Permitir campo vazio durante a edição, apenas remover caracteres não numéricos
    const cleaned = newQty.replace(/[^0-9]/g, '');
    setItemQuantities(prev => ({
      ...prev,
      [itemId]: cleaned,
    }));
  };

  const handleItemQuantityBlur = async (itemId: string) => {
    // Limpar timeout se existir
    if (saveTimeoutsRef.current[itemId]) {
      clearTimeout(saveTimeoutsRef.current[itemId]);
      delete saveTimeoutsRef.current[itemId];
    }

    const qtyStr = itemQuantities[itemId] || '0';
    const newQuantity = parseInt(qtyStr, 10);
    const originalItem = items.find(item => item.id === itemId);
    
    if (!originalItem) return;

    if (isNaN(newQuantity) || newQuantity < 1) {
      setItemQuantities(prev => ({
        ...prev,
        [itemId]: originalItem.quantity.toString(),
      }));
      setEditingItemQtyId(null);
      return;
    }

    if (newQuantity === originalItem.quantity) {
      setEditingItemQtyId(null);
      return;
    }

    // Salvar nova QUANTIDADE no backend
    const timeoutId = setTimeout(async () => {
      try {
        setSavingItemId(itemId);
        await itemsService.updateItemQuantity(id as string, itemId, newQuantity);
        
        setItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
          )
        );
      } catch (error: any) {
        console.error('Error updating item quantity:', error);
        
        let errorMessage = 'Não foi possível atualizar a quantidade do item';
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        if (error.response?.status === 429 || error.message?.includes('Too Many Requests')) {
          errorMessage = 'Muitas requisições. Aguarde um momento e tente novamente.';
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (error.response?.status !== 404) {
          Alert.alert('Erro', errorMessage);
        }
        
        setItemQuantities(prev => ({
          ...prev,
          [itemId]: originalItem.quantity.toString(),
        }));
      } finally {
        setSavingItemId(null);
        setEditingItemQtyId(null);
      }
    }, 500);

    saveTimeoutsRef.current[itemId] = timeoutId;
  };

  const handleSummary = () => {
    router.push({
      pathname: '/(tabs)/(create)/summary',
      params: {
        billId: id as string,
        billName: billName,
        items: JSON.stringify(items),
        participants: JSON.stringify(participants),
      },
    });
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  /**
   * IMPORTANTE:
   * - Agora no frontend, o campo `price` do BillItem representa o VALOR UNITÁRIO.
   * - O total da conta deve ser a soma de (quantidade × valor unitário) para cada item.
   */
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
                <View style={styles.billNameInputWrapper}>
                  <TextInput
                    style={[
                      styles.billNameInput,
                      !savingName && billName && styles.billNameInputEditable
                    ]}
                    value={billName}
                    onChangeText={setBillName}
                    onBlur={saveBillName}
                    onFocus={() => {}}
                    placeholder="Nome da conta"
                    placeholderTextColor="#999"
                  />
                  {!savingName && billName && (
                    <Ionicons 
                      name="create-outline" 
                      size={16} 
                      color="#8B2E8F" 
                      style={styles.billNameEditIcon}
                    />
                  )}
                </View>
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

            {/* Mensagem de processamento OCR */}
            {processingOcr && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#81007F" />
                <Text style={styles.processingText}>
                  Processando imagem e reconhecendo itens...
                </Text>
                <Text style={styles.processingSubtext}>
                  Isso pode levar alguns segundos
                </Text>
              </View>
            )}

            {/* Mensagem quando OCR falhou */}
            {billStatus === 'OCR_FAILED' && items.length === 0 && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={48} color="#FF6B6B" />
                <Text style={styles.errorTitle}>Não foi possível reconhecer os itens</Text>
                <Text style={styles.errorText}>
                  Você pode adicionar os itens manualmente usando o botão "+ Item"
                </Text>
              </View>
            )}

            {/* Lista de items */}
            {!processingOcr && items.map((item, index) => (
              <View key={item.id} style={styles.itemCardWrapper}>
                <View style={styles.itemCardMain}>
                  <View style={styles.itemCardLeft}>
                    <View style={[styles.inputWrapper, styles.nameInputWrapper]}>
                      {editingItemNameId === item.id ? (
                        <TextInput
                          style={[
                            styles.itemCardName,
                            styles.itemCardNameFocused
                          ]}
                          value={itemNames[item.id] !== undefined ? itemNames[item.id] : item.name}
                          onChangeText={(text) => handleItemNameChange(item.id, text)}
                          onBlur={() => handleItemNameBlur(item.id)}
                          placeholder="Nome do item"
                          placeholderTextColor="#999"
                          editable={true}
                          underlineColorAndroid="transparent"
                          selectionColor="#8B2E8F"
                          multiline={false}
                          numberOfLines={1}
                        />
                      ) : (
                        <TouchableOpacity
                          style={styles.itemCardNameContainer}
                          onPress={() => setEditingItemNameId(item.id)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={styles.itemCardNameText}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {itemNames[item.id] !== undefined ? itemNames[item.id] : item.name}
                          </Text>
                          <Ionicons 
                            name="create-outline" 
                            size={14} 
                            color="#8B2E8F" 
                            style={styles.editIconInContainer}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                    {savingItemId === item.id && (
                      <ActivityIndicator size="small" color="#81007F" style={styles.savingItemIndicator} />
                    )}
                  </View>
                  <View style={styles.itemCardRight}>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={[
                          styles.itemCardQty,
                          editingItemQtyId === item.id && styles.itemCardQtyFocused,
                          editingItemQtyId !== item.id && styles.itemCardQtyEditable
                        ]}
                        value={itemQuantities[item.id] !== undefined ? itemQuantities[item.id] : item.quantity.toString()}
                        onChangeText={(text) => handleItemQuantityChange(item.id, text)}
                        onBlur={() => handleItemQuantityBlur(item.id)}
                        onFocus={() => setEditingItemQtyId(item.id)}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor="#999"
                        underlineColorAndroid="transparent"
                        selectionColor="#8B2E8F"
                      />
                    </View>
                    <Text style={styles.qtySuffix}>x</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={[
                          styles.itemCardAmount,
                          editingItemPriceId === item.id && styles.itemCardAmountFocused,
                          editingItemPriceId !== item.id && styles.itemCardAmountEditable
                        ]}
                        value={itemPrices[item.id] || item.price.toFixed(2).replace('.', ',')}
                        onChangeText={(text) => handleItemPriceChange(item.id, text)}
                        onBlur={() => handleItemPriceBlur(item.id)}
                        onFocus={() => setEditingItemPriceId(item.id)}
                        keyboardType="numeric"
                        placeholder="0,00"
                        placeholderTextColor="#999"
                        underlineColorAndroid="transparent"
                        selectionColor="#8B2E8F"
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => setExpandedItemId(expandedItemId === item.id ? '' : item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={expandedItemId === item.id ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#666"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

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
                    </View>
                  </View>
                )}
              </View>
            ))}

            {/* Card do Total - só mostrar se não estiver processando e houver itens */}
            {!processingOcr && items.length > 0 && (
              <View style={styles.totalCardWrapper}>
                <Text style={styles.totalCardLabel}>Total:</Text>
                <Text style={styles.totalCardAmount}>{formatCurrency(calculateTotal())}</Text>
              </View>
            )}

            {/* Botão Visualizar Resumo - só mostrar se não estiver processando e houver itens */}
            {!processingOcr && items.length > 0 && (
              <TouchableOpacity style={styles.summaryBtn} onPress={handleSummary}>
                <Text style={styles.summaryBtnText}>Visualizar resumo</Text>
              </TouchableOpacity>
            )}
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
    flexGrow: 1,
    paddingBottom: 32,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  billNameContainer: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    marginRight: 12,
  },
  billNameInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  billNameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    paddingVertical: 4,
    paddingRight: 26,
    minHeight: 26,
  },
  billNameInputEditable: {
    borderBottomWidth: 1,
    borderBottomColor: '#E8D5EA',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    paddingBottom: 2,
  },
  billNameEditIcon: {
    position: 'absolute',
    right: 2,
    top: 4,
    opacity: 0.6,
  },
  savingIndicator: {
    marginLeft: 8,
  },
  addItemBtn: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#81007F',
  },
  addItemBtnText: {
    color: '#81007F',
    fontWeight: '600',
    fontSize: 14,
  },
  itemCardWrapper: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
  },
  itemCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 18,
    backgroundColor: '#fff',
  },
  itemCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  itemCardLeft: {
    flex: 1,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  nameInputWrapper: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    alignSelf: 'stretch',
    flexShrink: 1,
    marginLeft: 0,
  },
  itemCardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
    padding: 0,
    paddingLeft: 0,
    paddingRight: 20,
    marginLeft: 0,
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    borderColor: 'transparent',
    minHeight: 20,
    minWidth: 0,
    textAlign: 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  itemCardNameEditable: {
    borderBottomColor: '#E8D5EA',
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    paddingBottom: 2,
  },
  itemCardNameFocused: {
    borderBottomColor: '#8B2E8F',
    borderBottomWidth: 2,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    paddingRight: 20,
    paddingLeft: 0,
    paddingBottom: 1,
  },
  itemCardNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D5EA',
    borderStyle: 'dashed',
    paddingBottom: 2,
  },
  itemCardNameText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
    minWidth: 0,
    textAlign: 'left',
  },
  editIcon: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -7,
    opacity: 0.5,
    width: 16,
    height: 16,
  },
  editIconInContainer: {
    marginLeft: 12,
    opacity: 0.5,
    flexShrink: 0,
  },
  savingItemIndicator: {
    marginLeft: 4,
  },
  itemCardQty: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
    padding: 0,
    margin: 0,
    width: 30,
    textAlign: 'center',
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    borderColor: 'transparent',
  },
  itemCardQtyEditable: {
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemCardQtyFocused: {
    borderBottomColor: '#8B2E8F',
    borderBottomWidth: 2,
    borderStyle: 'solid',
    backgroundColor: '#FFF',
  },
  qtySuffix: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
  },
  itemCardAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    textAlign: 'right',
    padding: 0,
    margin: 0,
    minWidth: 60,
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    borderColor: 'transparent',
  },
  itemCardAmountEditable: {
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  itemCardAmountFocused: {
    borderBottomColor: '#8B2E8F',
    borderBottomWidth: 2,
    borderStyle: 'solid',
    backgroundColor: '#FFF',
  },
  dropdownWrapper: {
    backgroundColor: '#F8F8F8',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkboxesScroll: {
    maxHeight: 140,
  },
  checkboxesList: {
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#999',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: '#8B2E8F',
    backgroundColor: '#F1E4F2',
  },
  participantName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  deleteIconButton: {
    padding: 6,
  },
  addItemButton: {
    backgroundColor: '#F1E4F2',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addItemButtonLabel: {
    color: '#81007F',
    fontSize: 13,
    fontWeight: '600',
  },
  totalCardWrapper: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  totalCardLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: '#333',
    marginBottom: 4,
  },
  totalCardAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  summaryBtn: {
    backgroundColor: '#81007F',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
  },
  summaryBtnText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
  processingContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  processingText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  processingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5F5',
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
