import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Image,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import billService, { UploadBillResponse } from '../../../services/bill.service';

interface BillDetail extends UploadBillResponse {
  status?: 'pending' | 'completed' | 'cancelled';
}

interface BillItem {
  description: string;
  amount: number;
}

export default function BillDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBillDetails();
  }, [id]);

  const loadBillDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const billData = await billService.getBill(id as string);
      const billWithStatus: BillDetail = {
        ...billData,
        status: Math.random() > 0.5 ? 'pending' : 'completed',
      };
      setBill(billWithStatus);
    } catch (err) {
      console.error('Erro ao carregar conta:', err);
      setError('Erro ao carregar detalhes da conta');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCurrency = (value?: number): string => {
    if (!value) return 'R$ 0,00';
    return `R$ ${value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getStatusConfig = (status?: string) => {
    const configs: Record<string, { color: string; label: string; icon: string }> = {
      pending: { color: '#FFA500', label: 'Pendente', icon: 'clock-outline' },
      completed: { color: '#4CAF50', label: 'Completo', icon: 'check-circle-outline' },
      cancelled: { color: '#F44336', label: 'Cancelado', icon: 'close-circle-outline' },
    };
    return configs[status || 'completed'];
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C91F7A" />
          <Text style={styles.loadingText}>Carregando conta...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !bill) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={64}
            color="#F44336"
          />
          <Text style={styles.errorText}>{error || 'Conta não encontrada'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(bill.status);
  const items = bill.items || [];
  const totalItems = items.length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header com botão voltar */}
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Detalhes da Conta</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Card principal com informações */}
        <View style={styles.mainCard}>
          {/* Imagem da conta */}
          {bill.imageUrl && (
            <Image
              source={{ uri: bill.imageUrl }}
              style={styles.billImage}
              onError={() => console.log('Erro ao carregar imagem')}
            />
          )}

          {/* Informações principais */}
          <View style={styles.infoSection}>
            <View style={styles.establishmentSection}>
              <Text style={styles.establishmentName}>
                {bill.establishmentName || 'Conta sem nome'}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.color }]}>
                <MaterialCommunityIcons
                  name={statusConfig.icon as any}
                  size={16}
                  color="white"
                />
                <Text style={styles.statusText}>{statusConfig.label}</Text>
              </View>
            </View>

            {/* Data */}
            <View style={styles.dateSection}>
              <MaterialCommunityIcons name="calendar-outline" size={16} color="#999" />
              <Text style={styles.dateText}>{formatDate(bill.createdAt)}</Text>
            </View>

            {/* Total */}
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Valor Total</Text>
              <Text style={styles.totalAmount}>
                {formatCurrency(bill.totalAmount)}
              </Text>
            </View>
          </View>
        </View>

        {/* Itens da conta */}
        {items.length > 0 && (
          <View style={styles.itemsSection}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>Itens ({totalItems})</Text>
              <TouchableOpacity>
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={20}
                  color="#C91F7A"
                />
              </TouchableOpacity>
            </View>

            <FlatList
              data={items}
              keyExtractor={(_, index) => `item-${index}`}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <View style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemNumber}>{index + 1}.</Text>
                    <Text style={styles.itemDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>
                  <Text style={styles.itemAmount}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
              )}
              nestedScrollEnabled={false}
            />
          </View>
        )}

        {/* Ações */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons name="share-variant-outline" size={20} color="#C91F7A" />
            <Text style={styles.actionButtonText}>Compartilhar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons name="download-outline" size={20} color="#C91F7A" />
            <Text style={styles.actionButtonText}>Baixar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="#F44336" />
            <Text style={[styles.actionButtonText, { color: '#F44336' }]}>Deletar</Text>
          </TouchableOpacity>
        </View>

        {/* Dividir conta */}
        <TouchableOpacity style={styles.divideButton}>
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
          <Text style={styles.divideButtonText}>Dividir Conta</Text>
        </TouchableOpacity>

        <View style={styles.spacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  mainCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  billImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#F5F5F5',
  },
  infoSection: {
    padding: 16,
  },
  establishmentSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  establishmentName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    minWidth: 100,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dateText: {
    fontSize: 14,
    color: '#666',
  },
  totalSection: {
    gap: 8,
  },
  totalLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  itemsSection: {
    marginHorizontal: 16,
    marginTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  itemInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginRight: 12,
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    minWidth: 20,
  },
  itemDescription: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  actionsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#C91F7A',
  },
  divideButton: {
    marginHorizontal: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C91F7A',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  divideButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#C91F7A',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  spacing: {
    height: 20,
  },
});