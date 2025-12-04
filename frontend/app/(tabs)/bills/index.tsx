import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import billService, { UploadBillResponse } from '../../../services/bill.service';

interface BillWithStatus extends UploadBillResponse {
  status?: 'pending' | 'completed' | 'cancelled';
}

// Dados mockados para demonstração
const MOCK_BILLS: BillWithStatus[] = [
  {
    id: '1',
    establishmentName: 'Conta 1',
    totalAmount: 287.50,
    createdAt: '2025-09-12T18:30:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '2',
    establishmentName: 'Conta 2',
    totalAmount: 156.00,
    createdAt: '2025-09-18T20:15:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '3',
    establishmentName: 'Conta 3',
    totalAmount: 425.80,
    createdAt: '2025-09-20T19:45:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '4',
    establishmentName: 'Conta 4',
    totalAmount: 89.50,
    createdAt: '2025-09-27T10:30:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '5',
    establishmentName: 'Conta 5',
    totalAmount: 234.90,
    createdAt: '2025-09-28T22:00:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '6',
    establishmentName: 'Conta 6',
    totalAmount: 312.40,
    createdAt: '2025-09-30T19:20:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '7',
    establishmentName: 'Conta 7',
    totalAmount: 165.30,
    createdAt: '2025-10-10T18:10:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '8',
    establishmentName: 'Conta 8',
    totalAmount: 95.00,
    createdAt: '2025-10-15T15:45:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '1',
    establishmentName: 'Conta 1',
    totalAmount: 287.50,
    createdAt: '2025-09-12T18:30:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '2',
    establishmentName: 'Conta 2',
    totalAmount: 156.00,
    createdAt: '2025-09-18T20:15:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '3',
    establishmentName: 'Conta 3',
    totalAmount: 425.80,
    createdAt: '2025-09-20T19:45:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '4',
    establishmentName: 'Conta 4',
    totalAmount: 89.50,
    createdAt: '2025-09-27T10:30:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '5',
    establishmentName: 'Conta 5',
    totalAmount: 234.90,
    createdAt: '2025-09-28T22:00:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '6',
    establishmentName: 'Conta 6',
    totalAmount: 312.40,
    createdAt: '2025-09-30T19:20:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '7',
    establishmentName: 'Conta 7',
    totalAmount: 165.30,
    createdAt: '2025-10-10T18:10:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '8',
    establishmentName: 'Conta 8',
    totalAmount: 95.00,
    createdAt: '2025-10-15T15:45:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '1',
    establishmentName: 'Conta 1',
    totalAmount: 287.50,
    createdAt: '2025-09-12T18:30:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '2',
    establishmentName: 'Conta 2',
    totalAmount: 156.00,
    createdAt: '2025-09-18T20:15:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '3',
    establishmentName: 'Conta 3',
    totalAmount: 425.80,
    createdAt: '2025-09-20T19:45:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '4',
    establishmentName: 'Conta 4',
    totalAmount: 89.50,
    createdAt: '2025-09-27T10:30:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '5',
    establishmentName: 'Conta 5',
    totalAmount: 234.90,
    createdAt: '2025-09-28T22:00:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '6',
    establishmentName: 'Conta 6',
    totalAmount: 312.40,
    createdAt: '2025-09-30T19:20:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
  {
    id: '7',
    establishmentName: 'Conta 7',
    totalAmount: 165.30,
    createdAt: '2025-10-10T18:10:00Z',
    imageUrl: '',
    status: 'pending',
    items: [],
  },
  {
    id: '8',
    establishmentName: 'Conta 8',
    totalAmount: 95.00,
    createdAt: '2025-10-15T15:45:00Z',
    imageUrl: '',
    status: 'completed',
    items: [],
  },
];

const DATE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'week', label: 'Última semana' },
  { id: 'month', label: 'Último mês' },
];

export default function BillsScreen() {
  const router = useRouter();
  const [allBills, setAllBills] = useState<BillWithStatus[]>([]);
  const [displayedBills, setDisplayedBills] = useState<BillWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const itemsPerPage = 10;

  // Aplicar filtro de data
  const applyDateFilter = useCallback((filterId: string, bills: BillWithStatus[], search: string = '') => {
    let filtered = bills;

    // Aplicar filtro de data
    if (filterId !== 'all') {
      const now = new Date();
      filtered = bills.filter(bill => {
        const billDate = new Date(bill.createdAt);
        const daysDiff = Math.floor((now.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));

        switch (filterId) {
          case 'week':
            return daysDiff <= 7;
          case 'month':
            return daysDiff <= 30;
          default:
            return true;
        }
      });
    }

    // Aplicar filtro de busca
    if (search.trim()) {
      filtered = filtered.filter(bill =>
        bill.establishmentName?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Reseta paginação ao filtrar
    setCurrentPage(1);
    // Aplica paginação
    const paginatedBills = filtered.slice(0, itemsPerPage);
    setDisplayedBills(paginatedBills);
  }, [itemsPerPage]);

  // Carrega contas do servidor
  const loadBills = useCallback(async () => {
    try {
      setLoading(true);
      const bills = await billService.listBills();
      setAllBills(bills);
      applyDateFilter('all', bills, searchText);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      // Fallback para dados mockados em caso de erro
      setAllBills(MOCK_BILLS);
      applyDateFilter('all', MOCK_BILLS, searchText);
    } finally {
      setLoading(false);
    }
  }, [applyDateFilter, searchText]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  // Aplicar filtros quando os filtros mudarem
  useEffect(() => {
    applyDateFilter(selectedDateFilter, allBills, searchText);
  }, [selectedDateFilter, searchText, allBills, applyDateFilter]);

  // Formatar data
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  // Mudar filtro
  const handleFilterChange = useCallback((filterId: string) => {
    setSelectedDateFilter(filterId);
  }, []);

  // Mudar busca
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  // Carregar mais bills (scroll infinito)
  const handleLoadMore = useCallback(() => {
    if (loadingMore || displayedBills.length === allBills.length) return;

    setLoadingMore(true);
    // Simula delay de carregamento
    setTimeout(() => {
      const nextPage = currentPage + 1;
      const startIdx = (nextPage - 1) * itemsPerPage;
      const endIdx = startIdx + itemsPerPage;
      
      let filtered = allBills;

      // Aplicar filtro de data
      if (selectedDateFilter !== 'all') {
        const now = new Date();
        filtered = allBills.filter(bill => {
          const billDate = new Date(bill.createdAt);
          const daysDiff = Math.floor((now.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));

          switch (selectedDateFilter) {
            case 'week':
              return daysDiff <= 7;
            case 'month':
              return daysDiff <= 30;
            default:
              return true;
          }
        });
      }

      // Aplicar filtro de busca
      if (searchText.trim()) {
        filtered = filtered.filter(bill =>
          bill.establishmentName?.toLowerCase().includes(searchText.toLowerCase())
        );
      }

      const newBills = filtered.slice(startIdx, endIdx);
      setDisplayedBills(prev => [...prev, ...newBills]);
      setCurrentPage(nextPage);
      setLoadingMore(false);
    }, 300);
  }, [currentPage, displayedBills.length, allBills.length, loadingMore, selectedDateFilter, searchText, itemsPerPage]);

  // Renderizar card de conta
  const renderBillCard = ({ item }: { item: BillWithStatus }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(tabs)/bills/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.establishmentName}</Text>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCurrentPage(1);
    try {
      await loadBills();
    } finally {
      setRefreshing(false);
    }
  }, [loadBills]);

  // Renderizar filtros
  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <View style={styles.filterHeader}>
        <Text style={styles.filterTitle}>Filtrar por data</Text>
        <TouchableOpacity onPress={() => setShowFilters(false)}>
          <MaterialCommunityIcons name="close" size={24} color="#000" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.filterOptions}>
        {DATE_FILTERS.map(filter => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterOption,
              selectedDateFilter === filter.id && styles.filterOptionActive,
            ]}
            onPress={() => {
              handleFilterChange(filter.id);
              setShowFilters(false);
            }}
          >
            <View style={styles.filterCheckbox}>
              {selectedDateFilter === filter.id && (
                <MaterialCommunityIcons name="check" size={16} color="#C91F7A" />
              )}
            </View>
            <Text style={styles.filterOptionText}>{filter.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // Renderizar cabeçalho (será implementado em outra task)
  const renderHeader = () => null;

  // Lista vazia
  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#C91F7A" />
          <Text style={styles.emptyText}>Carregando contas...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Nenhuma conta encontrada</Text>
      </View>
    );
  };

  // Renderizar footer com loading de paginação
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#A01D66" />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contas</Text>
      </View>

      <View style={styles.searchFilterRow}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color="#999"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar...."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={handleSearchChange}
          />
        </View>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <MaterialCommunityIcons name="filter-outline" size={20} color="#C91F7A" />
          <Text style={styles.filterButtonText}>Filtro</Text>
        </TouchableOpacity>
      </View>

      {showFilters && renderFilters()}

      <FlatList
        data={displayedBills}
        keyExtractor={(item) => item.id}
        renderItem={renderBillCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#C91F7A"
          />
        }
        scrollEventThrottle={16}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
  },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#A01D66',
    borderRadius: 20,
    gap: 6,
  },
  filterButtonText: {
    color: '#A01D66',
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 24,
    paddingHorizontal: 16,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    padding: 0,
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#D0D0D0',
    paddingBottom: 16,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  filterOptions: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxHeight: 250,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  filterOptionActive: {
    backgroundColor: '#F5F5F5',
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  filterCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#C91F7A',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  card: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#333333',
  },
  cardDate: {
    fontSize: 14,
    color: '#999999',
    fontWeight: '400',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});