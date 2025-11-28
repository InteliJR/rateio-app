import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

export default function NewBillScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [numPeople, setNumPeople] = useState('');
  const [defineNameOption, setDefineNameOption] = useState<'sim' | 'nao'>('nao');
  const [billName, setBillName] = useState('');
  const [serviceRate, setServiceRate] = useState('');

  const [touched, setTouched] = useState({
    numPeople: false,
    billName: false,
    serviceRate: false,
  });

  const validate = () => {
    const errors: { numPeople?: string; billName?: string; serviceRate?: string } = {};

    // Validate Number of People
    if (!numPeople.trim()) {
      errors.numPeople = 'Campo obrigatório';
    } else {
      const num = parseInt(numPeople, 10);
      if (isNaN(num) || num < 1) {
        errors.numPeople = 'Mínimo de 1 participante';
      }
    }

    // Validate Bill Name
    if (defineNameOption === 'sim') {
      if (!billName.trim()) {
        errors.billName = 'Nome da conta é obrigatório';
      }
    }

    // Validate Service Rate
    if (!serviceRate.trim()) {
      errors.serviceRate = 'Campo obrigatório';
    } else {
      const rate = parseFloat(serviceRate);
      if (isNaN(rate)) {
        errors.serviceRate = 'Valor inválido';
      } else if (rate < 0) {
        errors.serviceRate = 'A taxa não pode ser negativa';
      } else if (rate > 100) {
        errors.serviceRate = 'A taxa máxima é 100%';
      }
    }

    return errors;
  };

  const errors = validate();
  const isFormValid = Object.keys(errors).length === 0;

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleConfirm = () => {
    if (!isFormValid) return;

    // TODO: Implement bill creation logic
    console.log({
      billId: id,
      numPeople,
      defineNameOption,
      billName: defineNameOption === 'sim' ? billName : undefined,
      serviceRate,
    });
    // Navigate back or to next screen
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Seção: Adicionar pessoas */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adicionar pessoas</Text>

            <Text style={styles.label}>Quantas pessoas irão participar dessa conta?</Text>
            <TextInput
              style={[styles.input, touched.numPeople && errors.numPeople ? styles.inputError : null]}
              placeholder="5"
              value={numPeople}
              onChangeText={setNumPeople}
              onBlur={() => handleBlur('numPeople')}
              keyboardType="numeric"
            />
            {touched.numPeople && errors.numPeople && (
              <Text style={styles.errorText}>{errors.numPeople}</Text>
            )}

            <Text style={styles.label}>Deseja definir o nome?</Text>
            <View style={styles.radioGroup}>
              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => setDefineNameOption('sim')}
              >
                <View style={styles.radioCircle}>
                  {defineNameOption === 'sim' && <View style={styles.radioCircleFilled} />}
                </View>
                <Text style={styles.radioLabel}>Sim</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.radioOption}
                onPress={() => {
                  setDefineNameOption('nao');
                  setBillName(''); // Clear name when switching to 'nao'
                }}
              >
                <View style={styles.radioCircle}>
                  {defineNameOption === 'nao' && <View style={styles.radioCircleFilled} />}
                </View>
                <Text style={styles.radioLabel}>Não</Text>
              </TouchableOpacity>
            </View>

            {defineNameOption === 'sim' && (
              <View>
                <TextInput
                  style={[
                    styles.input,
                    styles.conditionalInput,
                    touched.billName && errors.billName ? styles.inputError : null
                  ]}
                  placeholder="Nome da conta"
                  value={billName}
                  onChangeText={setBillName}
                  onBlur={() => handleBlur('billName')}
                />
                {touched.billName && errors.billName && (
                  <Text style={styles.errorText}>{errors.billName}</Text>
                )}
              </View>
            )}
          </View>

          {/* Seção: Definir a taxa de serviço */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Definir a taxa de serviço</Text>

            <Text style={styles.label}>Defina a porcentagem da taxa de serviço?</Text>
            <TextInput
              style={[styles.input, touched.serviceRate && errors.serviceRate ? styles.inputError : null]}
              placeholder="10"
              value={serviceRate}
              onChangeText={setServiceRate}
              onBlur={() => handleBlur('serviceRate')}
              keyboardType="numeric"
            />
            {touched.serviceRate && errors.serviceRate && (
              <Text style={styles.errorText}>{errors.serviceRate}</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Botão Confirmar fixo no bottom */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, !isFormValid && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!isFormValid}
        >
          <Text style={styles.buttonText}>Confirmar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100, // Space for fixed button
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 32,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputError: {
    borderColor: '#ff4d4d',
  },
  errorText: {
    color: '#ff4d4d',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 8,
  },
  conditionalInput: {
    marginTop: 12,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 4,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#81007F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleFilled: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#81007F',
  },
  radioLabel: {
    fontSize: 14,
    color: '#333',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  button: {
    backgroundColor: '#81007F',
    paddingVertical: 14,
    borderRadius: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFF00',
    fontSize: 16,
    fontWeight: '600',
  },
});
