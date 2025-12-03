import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  assignedParticipants: string[];
}

interface ItemCardProps {
  item: BillItem;
  onDelete: (id: string) => void;
  onUpdate?: (item: BillItem) => void;
  onPress?: () => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onDelete,
  onUpdate,
  onPress
}) => {
  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={20} color="#666" />
      </TouchableOpacity>

      <View style={styles.contentContainer}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>

        <View style={styles.detailsContainer}>
          <Text style={styles.quantity}>{item.quantity}x</Text>
          <Text style={styles.price}>{formatCurrency(item.price)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 12,
  },
  deleteButton: {
    marginRight: 16,
    padding: 4,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  detailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  quantity: {
    fontSize: 16,
    color: '#000',
  },
  price: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
});
