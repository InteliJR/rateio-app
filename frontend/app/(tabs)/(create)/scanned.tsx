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
import divisionsService from '../../../services/divisions.service';

export default function ScannedBillScreen() {
  const { id, participants: participantsParam } = useLocalSearchParams();
  const router = useRouter();

  const [billName, setBillName] = useState('');
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [savingDivisions, setSavingDivisions] = useState<string | null>(null);
  const [billStatus, setBillStatus] = useState<string>('');

  useEffect(() => {
    loadBillData();
  }, [id]);

  // Polling quando status for PENDING_OCR
  useEffect(() => {
    if (!id || billStatus !== 'PENDING_OCR') return;

    console.log('[Scanned] Starting polling for OCR completion...');
    
    const pollInterval = setInterval(async () => {
      try {
        const billData = await billService.getBill(id as string);
        console.log('[Scanned] Polling - Status:', billData.status);
        
        if (billData.status !== 'PENDING_OCR') {
          // OCR terminou ou falhou, limpar cache e recarregar dados
          console.log('[Scanned] OCR completed, clearing cache and reloading data...');
          itemsService.clearCache(id as string);
          clearInterval(pollInterval);
          loadBillData();
        }
      } catch (error) {
        console.error('[Scanned] Error polling:', error);
      }
    }, 3000); // Poll a cada 3 segundos
    
    return () => {
      console.log('[Scanned] Stopping polling');
      clearInterval(pollInterval);
    };
  }, [id, billStatus]);

  const loadBillData = async () => {
    try {
      setLoading(true);
      console.log('[Scanned] Loading bill data for ID:', id);
      
      // 1. Carregar informações da conta
      const billData = await billService.getBill(id as string);
      console.log('[Scanned] Bill data:', billData);
      
      setBillStatus(billData.status || '');
      setIsCompleted(billData.status === 'COMPLETED');
      setBillName(billData.establishmentName || '');
      
      if (billData.status === 'COMPLETED') {
        console.log('[Scanned] Bill is completed - read-only mode');
      }
      
      // 2. Carregar itens da conta
      const itemsData = await itemsService.getItems(id as string);
      console.log('[Scanned] Items loaded:', itemsData.length);
      console.log('[Scanned] Items data:', JSON.stringify(itemsData, null, 2));
      
      // 3. Carregar participantes
      let participantsData = await participantsService.getParticipantsByBill(id as string);
      console.log('[Scanned] Participants loaded:', participantsData.length);
      
      // Se não houver participantes, criar 2 participantes padrão automaticamente
      if (participantsData.length === 0) {
        console.log('[Scanned] No participants found, creating default participants');
        try {
          // Criar 2 participantes padrão
          const defaultParticipants = await Promise.all([
            participantsService.createParticipant(id as string, 'Pessoa 1'),
            participantsService.createParticipant(id as string, 'Pessoa 2'),
          ]);
          participantsData = defaultParticipants;
          console.log('[Scanned] Default participants created:', participantsData.length);
        } catch (error: any) {
          console.error('[Scanned] Error creating default participants:', error);
          Alert.alert(
            'Erro',
            'Não foi possível criar participantes. Por favor, adicione participantes manualmente.',
            [
              {
                text: 'Adicionar Participantes',
                onPress: () => {
                  router.replace({
                    pathname: '/(tabs)/(create)/participants',
                    params: { 
                      id: id as string,
                      participantCount: '2'
                    },
                  });
                },
              },
              {
                text: 'Cancelar',
                style: 'cancel',
                onPress: () => router.back(),
              },
            ]
          );
          setLoading(false);
          return;
        }
      }
      
      setParticipants(participantsData);
      
      // 4. Carregar divisões existentes (assignments)
      let divisionsData: any[] = [];
      try {
        const divisionsResponse = await divisionsService.findAllByBill(id as string);
        console.log('[Scanned] Divisions response:', JSON.stringify(divisionsResponse, null, 2));
        
        // Backend retorna: { billId, items: [{ billItem, divisions: [], totalDivided }], totalDivisions }
        if (divisionsResponse && typeof divisionsResponse === 'object') {
          if ('items' in divisionsResponse && Array.isArray((divisionsResponse as any).items)) {
            // Extrair todas as divisões de todos os itens
            const allDivisions: any[] = [];
            (divisionsResponse as any).items.forEach((itemGroup: any) => {
              if (itemGroup && itemGroup.divisions && Array.isArray(itemGroup.divisions)) {
                allDivisions.push(...itemGroup.divisions);
              }
            });
            divisionsData = allDivisions;
          } else if (Array.isArray(divisionsResponse)) {
            // Se for array direto (fallback)
            divisionsData = divisionsResponse;
          }
        }
        console.log('[Scanned] Divisions loaded:', divisionsData.length);
      } catch (error: any) {
        console.warn('[Scanned] Error loading divisions (may not exist yet):', error.message);
        divisionsData = [];
      }
      
      // 5. Mapear divisões para assignedParticipants nos itens
      const itemsWithAssignments = itemsData.map(item => {
        // Encontrar todas as divisões deste item
        const itemDivisions = divisionsData.filter(
          (div: any) => div.billItemId === item.id
        );
        
        // Mapear participantIds para nomes de participantes
        const assignedParticipantNames = itemDivisions
          .map((div: any) => {
            const participant = participantsData.find((p: Participant) => p.id === div.participantId);
            return participant?.name || '';
          })
          .filter(Boolean);
        
        return {
          ...item,
          assignedParticipants: assignedParticipantNames,
        };
      });
      
      setItems(itemsWithAssignments);
      console.log('[Scanned] Items with assignments:', itemsWithAssignments);
      
    } catch (error: any) {
      console.error('[Scanned] Error loading bill data:', error);
      Alert.alert(
        'Erro',
        error.message || 'Não foi possível carregar os dados da conta'
      );
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

  // Removido useEffect de participantsParam - agora carregamos do backend

  const toggleParticipant = async (itemId: string, participantName: string) => {
    if (isCompleted) {
      Alert.alert(
        'Conta Finalizada',
        'Esta conta já foi finalizada e não pode ser editada.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Encontrar o participante pelo nome
    const participant = participants.find(p => p.name === participantName);
    if (!participant) {
      console.error('[Scanned] Participant not found:', participantName);
      return;
    }

    // Encontrar o item
    const item = items.find(i => i.id === itemId);
    if (!item) {
      console.error('[Scanned] Item not found:', itemId);
      return;
    }

    const isAssigned = item.assignedParticipants.includes(participantName);

    // Atualizar estado local imediatamente (otimista)
    setItems(prevItems =>
      prevItems.map(i => {
        if (i.id === itemId) {
          return {
            ...i,
            assignedParticipants: isAssigned
              ? i.assignedParticipants.filter(p => p !== participantName)
              : [...i.assignedParticipants, participantName],
          };
        }
        return i;
      })
    );

    // Salvar no backend
    try {
      setSavingDivisions(itemId);
      
      // Buscar divisões atuais deste item
      const allDivisions = await divisionsService.findAllByBill(id as string);
      const currentItemDivisions = allDivisions.filter(
        (div: any) => div.billItemId === itemId
      );

      if (isAssigned) {
        // Remover participante: recalcular todas as divisões do item
        const newAssignedCount = item.assignedParticipants.length - 1;
        
        if (newAssignedCount === 0) {
          // Se não há mais participantes, remover todas as divisões
          for (const div of currentItemDivisions) {
            await divisionsService.remove(div.id);
          }
          console.log('[Scanned] All divisions removed (no participants left)');
        } else {
          // Recalcular divisões para os participantes restantes
          const shareAmount = divisionsService.calculateShareAmount(
            item.price,
            newAssignedCount
          );

          // Remover todas as divisões existentes deste item
          for (const div of currentItemDivisions) {
            await divisionsService.remove(div.id);
          }

          // Criar novas divisões com valores recalculados para os participantes restantes
          const remainingAssignments = item.assignedParticipants
            .filter(name => name !== participantName)
            .map(name => {
              const p = participants.find(pp => pp.name === name);
              return p!;
            });

          const divisions = remainingAssignments.map(p => ({
            participantId: p.id,
            shareAmount: shareAmount,
          }));

          await divisionsService.createBatch(itemId, divisions);
          console.log('[Scanned] Divisions recalculated after removal for item:', itemId, 'Share amount:', shareAmount);
        }
      } else {
        // Adicionar participante: recalcular todas as divisões do item
        const newAssignedCount = item.assignedParticipants.length + 1;
        const shareAmount = divisionsService.calculateShareAmount(
          item.price,
          newAssignedCount
        );

        // Remover todas as divisões existentes deste item
        for (const div of currentItemDivisions) {
          await divisionsService.remove(div.id);
        }

        // Criar novas divisões com valores recalculados para todos os participantes
        const newAssignments = [
          ...item.assignedParticipants.map(name => {
            const p = participants.find(pp => pp.name === name);
            return p!;
          }),
          participant,
        ];

        const divisions = newAssignments.map(p => ({
          participantId: p.id,
          shareAmount: shareAmount,
        }));

        await divisionsService.createBatch(itemId, divisions);
        console.log('[Scanned] Divisions recalculated for item:', itemId, 'Share amount:', shareAmount);
      }
    } catch (error: any) {
      console.error('[Scanned] Error saving division:', error);
      Alert.alert(
        'Erro',
        error.message || 'Não foi possível salvar a divisão. Tente novamente.'
      );
      
      // Reverter mudança local em caso de erro
      setItems(prevItems =>
        prevItems.map(i => {
          if (i.id === itemId) {
            return {
              ...i,
              assignedParticipants: isAssigned
                ? [...i.assignedParticipants, participantName]
                : i.assignedParticipants.filter(p => p !== participantName),
            };
          }
          return i;
        })
      );
    } finally {
      setSavingDivisions(null);
    }
  };

  const handleAddNewItem = async (newItem: Omit<BillItem, 'id' | 'assignedParticipants'>) => {
    try {
      // Criar item no backend
      const createdItems = await itemsService.createItem(id as string, newItem);
      
      // Atualizar estado local com os itens retornados do backend
      setItems(createdItems);
      setIsModalVisible(false);
    } catch (error: any) {
      console.error('[Scanned] Error adding item:', error);
      Alert.alert(
        'Erro',
        error.message || 'Não foi possível adicionar o item. Tente novamente.'
      );
    }
  };

  const deleteItem = async (itemId: string) => {
    if (isCompleted) {
      Alert.alert(
        'Conta Finalizada',
        'Esta conta já foi finalizada e não pode ser editada.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      // Deletar item no backend (isso também remove as divisões relacionadas)
      const updatedItems = await itemsService.deleteItem(id as string, itemId);
      setItems(updatedItems);
      
      if (expandedItemId === itemId) {
        setExpandedItemId('');
      }
    } catch (error: any) {
      console.error('[Scanned] Error deleting item:', error);
      Alert.alert(
        'Erro',
        error.message || 'Não foi possível deletar o item. Tente novamente.'
      );
    }
  };

  const handleSummary = () => {
    router.push({
      pathname: "/(tabs)/(create)/summary",
      params: {
        id: id as string, // Pass bill ID for backend data fetching
      },
    });
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const calculateTotal = () => {
    // item.price já é o totalPrice (preço total do item), não precisa multiplicar por quantity
    const total = items.reduce((sum, item) => {
      const itemPrice = Number(item.price) || 0;
      console.log(`[Scanned] Item: ${item.name}, Price: ${itemPrice}`);
      return sum + itemPrice;
    }, 0);
    console.log('[Scanned] Calculated total:', total);
    return total;
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
            {/* Banner de Conta Finalizada */}
            {isCompleted && (
              <View style={styles.completedBanner}>
                <MaterialCommunityIcons name="check-circle" size={20} color="#10b981" />
                <Text style={styles.completedBannerText}>
                  Conta finalizada - Somente leitura
                </Text>
              </View>
            )}

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.billNameContainer}>
                <TextInput
                  style={styles.billNameInput}
                  value={billName}
                  onChangeText={setBillName}
                  onBlur={saveBillName}
                  placeholder="Nome da conta"
                  editable={!isCompleted}
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
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="receipt" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                Nenhum item encontrado
              </Text>
              <Text style={styles.emptySubtext}>
                {billStatus === 'PENDING_OCR' 
                  ? 'Aguardando processamento da imagem...'
                  : billStatus === 'OCR_FAILED'
                  ? 'Falha ao processar imagem. Tente fazer upload novamente.'
                  : 'Adicione itens manualmente ou aguarde o processamento OCR.'}
              </Text>
            </View>
          ) : (
            items.map((item, index) => (
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
                      {participants.length === 0 ? (
                        <View style={styles.emptyParticipantsContainer}>
                          <Text style={styles.emptyParticipantsText}>
                            Nenhum participante encontrado
                          </Text>
                          <Text style={styles.emptyParticipantsSubtext}>
                            Adicione participantes na tela anterior
                          </Text>
                        </View>
                      ) : (
                        participants.map((participant, idx) => {
                          const isAssigned = item.assignedParticipants.includes(participant.name);
                          const isSaving = savingDivisions === item.id;
                          return (
                            <TouchableOpacity
                              key={participant.id || idx}
                              style={styles.checkboxRow}
                              onPress={() => toggleParticipant(item.id, participant.name)}
                              activeOpacity={0.6}
                              disabled={isSaving || isCompleted}
                            >
                              <View style={[styles.checkbox, isAssigned && styles.checkboxActive]}>
                                {isAssigned && (
                                  <Ionicons name="checkmark" size={10} color="#8B2E8F" />
                                )}
                              </View>
                              <Text style={styles.participantName}>{participant.name}</Text>
                              {isSaving && (
                                <ActivityIndicator size="small" color="#8B2E8F" style={{ marginLeft: 8 }} />
                              )}
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  </ScrollView>

                  {/* Buttons Footer Row */}
                  <View style={styles.footerRow}>
                    {!isCompleted && (
                      <>
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
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>
            ))
          )}

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
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  completedBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065f46',
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
  emptyParticipantsContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyParticipantsText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  emptyParticipantsSubtext: {
    fontSize: 12,
    color: '#999',
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
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
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
