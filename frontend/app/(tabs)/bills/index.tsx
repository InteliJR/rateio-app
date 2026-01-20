import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import billService, { UploadBillResponse, BillFilters } from '../../../services/bill.service';

// Interface BillWithStatus removed as it conflicts with UploadBillResponse


const DATE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'week', label: 'Última semana' },
  { id: 'month', label: 'Último mês' },
];

export default function BillsScreen() {
  const router = useRouter();
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState<string>('');
  
  // Debounce search text for query
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Construir filtros para a query
  const filters: BillFilters = {};
  if (debouncedSearch) filters.search = debouncedSearch;
  
  if (selectedDateFilter !== 'all') {
    const now = new Date();
    const startDate = new Date();
    
    switch (selectedDateFilter) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setDate(now.getDate() - 30);
        break;
    }
    
    filters.startDate = startDate.toISOString();
  }

  // React Query Infinite Query
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching
  } = useInfiniteQuery({
    queryKey: ['bills', { ...filters, dateFilter: selectedDateFilter }],
    queryFn: ({ pageParam = 1 }) => billService.listBills(pageParam as number, 10, filters),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  // Atualizar dados ao focar na tela
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Flatten data for FlatList
  const allBills = data?.pages.flatMap(page => page.data) || [];

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
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Renderizar card de conta
  const renderBillCard = ({ item }: { item: UploadBillResponse }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(tabs)/bills/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.establishmentName || 'Sem nome'}</Text>
        <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</Text>
      </View>
    </TouchableOpacity>
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
                <MaterialCommunityIcons name="check" size={16} color="#8B2E8F" />
              )}
            </View>
            <Text style={styles.filterOptionText}>{filter.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // Lista vazia
  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#C91F7A" />
          <Text style={styles.emptyText}>Carregando contas...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Erro ao carregar contas.</Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 10 }}>
             <Text style={{ color: '#C91F7A', fontWeight: 'bold' }}>Tentar novamente</Text>
          </TouchableOpacity>
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
    if (!isFetchingNextPage) return null;
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
        data={allBills}
        keyExtractor={(item) => item.id}
        renderItem={renderBillCard}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={handleRefresh}
            tintColor="#8B2E8F"
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
    borderColor: '#8B2E8F',
    borderRadius: 20,
    gap: 6,
  },
  filterButtonText: {
    color: '#8B2E8F',
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
    borderColor: '#8B2E8F',
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