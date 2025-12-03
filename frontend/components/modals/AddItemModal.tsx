import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BillItem } from '../items/ItemCard';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: Omit<BillItem, 'id' | 'assignedParticipants'>) => void;
}

type Step = 'selection' | 'product' | 'fee';

export const AddItemModal: React.FC<AddItemModalProps> = ({ visible, onClose, onAdd }) => {
  const [step, setStep] = useState<Step>('selection');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState({ name: '', quantity: '', value: '' });

  const resetForm = () => {
    setStep('selection');
    setName('');
    setQuantity('');
    setValue('');
    setErrors({ name: '', quantity: '', value: '' });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const formatCurrency = (text: string) => {
    // Remove non-numeric characters
    let numeric = text.replace(/[^0-9]/g, '');
    if (!numeric) return '';

    // Convert to decimal
    const amount = parseInt(numeric) / 100;

    // Format to BRL
    return amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const handleValueChange = (text: string) => {
    // If deleting everything, clear it
    if (!text) {
      setValue('');
      return;
    }

    // If user is typing, we just take the numbers and reformat
    const numeric = text.replace(/[^0-9]/g, '');
    const formatted = formatCurrency(numeric);
    setValue(formatted);
    if (errors.value) setErrors(prev => ({ ...prev, value: '' }));
  };

  const parseCurrency = (text: string): number => {
    const numeric = text.replace(/[^0-9]/g, '');
    return parseInt(numeric) / 100;
  };

  const validate = () => {
    const newErrors = { name: '', quantity: '', value: '' };
    let isValid = true;

    if (!name.trim()) {
      newErrors.name = 'Nome é obrigatório';
      isValid = false;
    }

    if (step === 'product' && !quantity.trim()) {
      newErrors.quantity = 'Quantidade é obrigatória';
      isValid = false;
    } else if (step === 'product' && parseInt(quantity) <= 0) {
      newErrors.quantity = 'Quantidade deve ser maior que 0';
      isValid = false;
    }

    if (!value.trim()) {
      newErrors.value = 'Valor é obrigatório';
      isValid = false;
    } else if (parseCurrency(value) <= 0) {
      newErrors.value = 'Valor deve ser maior que 0';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleAdd = () => {
    if (!validate()) return;

    const price = parseCurrency(value);
    const qty = step === 'product' ? parseInt(quantity) : 1;

    onAdd({
      name: name.trim(),
      quantity: qty,
      price: step === 'product' ? price * qty : price, // If fee, price is total value
    });

    handleClose();
  };

  const renderSelection = () => (
    <View style={styles.selectionContainer}>
      <Text style={styles.title}>Adicionar Item</Text>

      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => setStep('product')}
      >
        <Ionicons name="fast-food-outline" size={24} color="#81007F" />
        <Text style={styles.optionText}>Adicionar Produto</Text>
        <Ionicons name="chevron-forward" size={24} color="#ccc" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => setStep('fee')}
      >
        <Ionicons name="receipt-outline" size={24} color="#81007F" />
        <Text style={styles.optionText}>Adicionar Couvert/Taxa</Text>
        <Ionicons name="chevron-forward" size={24} color="#ccc" />
      </TouchableOpacity>
    </View>
  );

  const renderForm = () => (
    <View style={styles.formContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('selection')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {step === 'product' ? 'Novo Produto' : 'Nova Taxa'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        style={[styles.input, errors.name ? styles.inputError : null]}
        placeholder="Ex: Coca-cola"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
        }}
      />
      {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

      {step === 'product' && (
        <>
          <Text style={styles.label}>Quantidade</Text>
          <TextInput
            style={[styles.input, errors.quantity ? styles.inputError : null]}
            placeholder="Ex: 2"
            value={quantity}
            onChangeText={(text) => {
              setQuantity(text.replace(/[^0-9]/g, ''));
              if (errors.quantity) setErrors(prev => ({ ...prev, quantity: '' }));
            }}
            keyboardType="numeric"
          />
          {errors.quantity ? <Text style={styles.errorText}>{errors.quantity}</Text> : null}
        </>
      )}

      <Text style={styles.label}>
        {step === 'product' ? 'Preço Unitário' : 'Valor'}
      </Text>
      <TextInput
        style={[styles.input, errors.value ? styles.inputError : null]}
        placeholder="R$ 0,00"
        value={value}
        onChangeText={handleValueChange}
        keyboardType="numeric"
      />
      {errors.value ? <Text style={styles.errorText}>{errors.value}</Text> : null}

      <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
        <Text style={styles.addButtonText}>Adicionar</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalContent}
            >
              <View style={styles.handle} />
              {step === 'selection' ? renderSelection() : renderForm()}
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  selectionContainer: {
    gap: 16,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  formContainer: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: -8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: -8,
  },
  addButton: {
    backgroundColor: '#81007F',
    padding: 16,
    borderRadius: 28,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    color: '#FFFF00',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
