import React, { useState, useCallback, useEffect, useMemo } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import billService, {
  UploadBillResponse,
  BillFilters,
} from "../../../services/bill.service";
import { useTheme } from "../../../contexts/ThemeContext";
import { useAuthStore } from "../../../store/authStore";

const DATE_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "week", label: "Última semana" },
  { id: "month", label: "Último mês" },
];

export default function BillsScreen() {
  const router = useRouter();
  const { colors, getFontSize } = useTheme();
  const { user } = useAuthStore();
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState<string>("");

  // Debounce search text for query
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Construir filtros para a query usando useMemo para estabilizar
  const filters: BillFilters = useMemo(() => {
    const result: BillFilters = {};
    if (debouncedSearch) result.search = debouncedSearch;

    if (selectedDateFilter !== "all") {
      const now = new Date();
      const startDate = new Date();

      switch (selectedDateFilter) {
        case "week":
          startDate.setDate(now.getDate() - 7);
          break;
        case "month":
          startDate.setDate(now.getDate() - 30);
          break;
      }

      result.startDate = startDate.toISOString();
    }

    return result;
  }, [debouncedSearch, selectedDateFilter]);

  // Estabilizar queryKey para evitar requisições desnecessárias
  // Inclui o ID do usuário para garantir que dados de outros usuários não sejam retornados do cache
  const queryKey = useMemo(() => {
    return [
      "bills",
      user?.id || "anonymous",
      debouncedSearch,
      selectedDateFilter,
    ];
  }, [user?.id, debouncedSearch, selectedDateFilter]);

  // React Query Infinite Query
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      billService.listBills(pageParam as number, 10, filters),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!user?.id, // Só habilitar quando há usuário logado
  });

  // Flatten data for FlatList
  const allBills = data?.pages.flatMap((page) => page.data) || [];

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
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
        },
      ]}
      onPress={() => router.push(`/(tabs)/bills/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <Text
          style={[
            styles.cardTitle,
            { color: colors.text, fontSize: getFontSize(16) },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.establishmentName || "Sem nome"}
        </Text>
        <Text
          style={[
            styles.cardDate,
            { color: colors.textSecondary, fontSize: getFontSize(14) },
          ]}
        >
          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Pull-to-refresh
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Renderizar filtros
  const renderFilters = () => (
    <View style={[styles.filtersContainer, { backgroundColor: colors.card }]}>
      <View
        style={[styles.filterHeader, { borderBottomColor: colors.divider }]}
      >
        <Text
          style={[
            styles.filterTitle,
            { color: colors.text, fontSize: getFontSize(16) },
          ]}
        >
          Filtrar por data
        </Text>
        <TouchableOpacity onPress={() => setShowFilters(false)}>
          <MaterialCommunityIcons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.filterOptions}>
        {DATE_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterOption,
              selectedDateFilter === filter.id && {
                backgroundColor: colors.backgroundSecondary,
              },
            ]}
            onPress={() => {
              handleFilterChange(filter.id);
              setShowFilters(false);
            }}
          >
            <View
              style={[
                styles.filterCheckbox,
                { borderColor: colors.primary, backgroundColor: colors.cardBackground },
              ]}
            >
              {selectedDateFilter === filter.id && (
                <MaterialCommunityIcons
                  name="check"
                  size={16}
                  color={colors.primary}
                />
              )}
            </View>
            <Text
              style={[
                styles.filterOptionText,
                { color: colors.text, fontSize: getFontSize(14) },
              ]}
            >
              {filter.label}
            </Text>
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
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              styles.emptyText,
              { color: colors.textSecondary, fontSize: getFontSize(16) },
            ]}
          >
            Carregando contas...
          </Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.emptyContainer}>
          <Text
            style={[
              styles.emptyText,
              { color: colors.textSecondary, fontSize: getFontSize(16) },
            ]}
          >
            Erro ao carregar contas.
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 10 }}>
            <Text
              style={{
                color: colors.primary,
                fontWeight: "bold",
                fontSize: getFontSize(14),
              }}
            >
              Tentar novamente
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text
          style={[
            styles.emptyText,
            { color: colors.textSecondary, fontSize: getFontSize(16) },
          ]}
        >
          Nenhuma conta encontrada
        </Text>
      </View>
    );
  };

  // Renderizar footer com loading de paginação
  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text
          style={[
            styles.title,
            { color: colors.text, fontSize: getFontSize(24) },
          ]}
        >
          Historico
        </Text>
      </View>

      <View style={styles.searchFilterRow}>
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={colors.textTertiary}
            style={styles.searchIcon}
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: colors.text, fontSize: getFontSize(14) },
            ]}
            placeholder="Buscar...."
            placeholderTextColor={colors.placeholderText}
            value={searchText}
            onChangeText={handleSearchChange}
          />
        </View>

        <TouchableOpacity
          style={[styles.filterButton, { borderColor: colors.primary }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <MaterialCommunityIcons
            name="filter-outline"
            size={20}
            color={colors.primary}
          />
          <Text
            style={[
              styles.filterButtonText,
              { color: colors.primary, fontSize: getFontSize(12) },
            ]}
          >
            Filtro
          </Text>
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
            tintColor={colors.primary}
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
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  searchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderRadius: 20,
    gap: 6,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    paddingHorizontal: 16,
    flex: 1,
    borderWidth: 1,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  filterOptions: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxHeight: 250,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  filterOptionActive: {
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  filterCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: "500",
  },
  card: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "400",
    flex: 1,
  },
  cardDate: {
    fontSize: 14,
    fontWeight: "400",
    flexShrink: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 16,
    textAlign: "center",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
