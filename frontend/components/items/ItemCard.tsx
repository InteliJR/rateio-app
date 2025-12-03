import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Keyboard } from 'react-native';
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
  const [editingField, setEditingField] = useState<'name' | 'quantity' | 'price' | null>(null);
  const [tempValue, setTempValue] = useState('');

  // Refs for inputs to focus automatically
  const nameInputRef = useRef<TextInput>(null);
  const quantityInputRef = useRef<TextInput>(null);
  const priceInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (editingField === 'name' && nameInputRef.current) {
      nameInputRef.current.focus();
    } else if (editingField === 'quantity' && quantityInputRef.current) {
      quantityInputRef.current.focus();
    } else if (editingField === 'price' && priceInputRef.current) {
      priceInputRef.current.focus();
    }
  }, [editingField]);

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const handleStartEditing = (field: 'name' | 'quantity' | 'price') => {
    setEditingField(field);
    if (field === 'name') {
      setTempValue(item.name);
    } else if (field === 'quantity') {
      setTempValue(item.quantity.toString());
    } else if (field === 'price') {
      setTempValue(item.price.toFixed(2));
    }
  };

  const handleFinishEditing = () => {
    if (!editingField || !onUpdate) {
      setEditingField(null);
      return;
    }

    let newItem = { ...item };
    let hasChanges = false;

    if (editingField === 'name') {
      const trimmed = tempValue.trim();
      if (trimmed && trimmed !== item.name) {
        newItem.name = trimmed;
        hasChanges = true;
      }
    } else if (editingField === 'quantity') {
      const qty = parseInt(tempValue, 10);
      if (!isNaN(qty) && qty >= 1 && qty !== item.quantity) {
        newItem.quantity = qty;
        hasChanges = true;
      }
    } else if (editingField === 'price') {
      // Replace comma with dot for parsing
      const normalized = tempValue.replace(',', '.');
      const price = parseFloat(normalized);
      if (!isNaN(price) && price >= 0 && price !== item.price) {
        newItem.price = price;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      onUpdate(newItem);
    }

    setEditingField(null);
  };

  const handleCancelEditing = () => {
    setEditingField(null);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={editingField ? undefined : onPress}
      activeOpacity={editingField ? 1 : 0.7}
    >
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => onDelete(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={20} color="#666" />
      </TouchableOpacity>

      <View style={styles.contentContainer}>
        {editingField === 'name' ? (
          <TextInput
            ref={nameInputRef}
            style={[styles.input, styles.nameInput]}
            value={tempValue}
            onChangeText={setTempValue}
            onBlur={handleFinishEditing}
            onSubmitEditing={handleFinishEditing}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity onPress={() => handleStartEditing('name')} style={styles.nameContainer}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.detailsContainer}>
          {editingField === 'quantity' ? (
            <View style={styles.editWrapper}>
              <TextInput
                ref={quantityInputRef}
                style={[styles.input, styles.quantityInput]}
                value={tempValue}
                onChangeText={setTempValue}
                onBlur={handleFinishEditing}
                onSubmitEditing={handleFinishEditing}
                keyboardType="number-pad"
                returnKeyType="done"
              />
              <Text style={styles.suffix}>x</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => handleStartEditing('quantity')}>
              <Text style={styles.quantity}>{item.quantity}x</Text>
            </TouchableOpacity>
          )}

          {editingField === 'price' ? (
            <View style={styles.editWrapper}>
              <Text style={styles.prefix}>R$</Text>
              <TextInput
                ref={priceInputRef}
                style={[styles.input, styles.priceInput]}
                value={tempValue}
                onChangeText={setTempValue}
                onBlur={handleFinishEditing}
                onSubmitEditing={handleFinishEditing}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
          ) : (
            <TouchableOpacity onPress={() => handleStartEditing('price')}>
              <Text style={styles.price}>{formatCurrency(item.price)}</Text>
            </TouchableOpacity>
          )}
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
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    color: '#000',
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
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#81007F',
    padding: 0,
    fontSize: 16,
    color: '#000',
  },
  nameInput: {
    flex: 1,
    marginRight: 8,
  },
  quantityInput: {
    width: 30,
    textAlign: 'center',
  },
  priceInput: {
    width: 60,
    textAlign: 'right',
  },
  editWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suffix: {
    fontSize: 16,
    color: '#000',
    marginLeft: 2,
  },
  prefix: {
    fontSize: 16,
    color: '#000',
    marginRight: 2,
  }
});
