import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useBillStore } from '../../../store/billStore';
import billService, { UploadBillResponse } from '../../../services/bill.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function BillsScreen() {
  const router = useRouter();
  const { bills, setBills } = useBillStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBills = async () => {
    try {
      const data = await billService.listBills();
      setBills(data);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBills();
  }, []);

  const renderItem = ({ item }: { item: UploadBillResponse }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(bills)/${item.id}/items`)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.establishmentName}>
          {item.establishmentName || 'Conta sem nome'}
        </Text>
        <Text style={styles.date}>
          {format(new Date(item.createdAt), "d 'de' MMM", { locale: ptBR })}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.participants}>
          {item._count?.participants || 0} participantes
        </Text>
        {item.totalAmount && (
          <Text style={styles.amount}>
            R$ {Number(item.totalAmount).toFixed(2).replace('.', ',')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading && bills.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#81007F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Minhas Contas</Text>

      <FlatList
        data={bills}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#81007F']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhuma conta encontrada</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/(tabs)/(create)/new')}
            >
              <Text style={styles.createButtonText}>Criar nova conta</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  establishmentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participants: {
    fontSize: 14,
    color: '#666',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#81007F',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#81007F',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createButtonText: {
    color: '#FFFF00',
    fontWeight: '600',
  },
});