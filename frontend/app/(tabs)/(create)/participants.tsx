import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ParticipantsScreen() {
  const { id, participantCount } = useLocalSearchParams();
  const router = useRouter();

  const initialCount = Number(participantCount) || 0;
  const [nameInput, setNameInput] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);

  const handleAddParticipant = () => {
    if (!nameInput.trim() || participants.length === (Number(participantCount) || 0)) {
      Alert.alert('Limite atingido', 'O número máximo de participantes foi atingido');
      return;
    }
    setParticipants([...participants, nameInput.trim()]);
    setNameInput('');
  };

  const handleRemoveParticipant = (index: number) => {
    const newParticipants = [...participants];
    newParticipants.splice(index, 1);
    setParticipants(newParticipants);
  };

  const handleScan = () => {
    // Optional: Validate if participants match the count or if at least one exists
    if (participants.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos um participante.');
      return;
    }

    router.push({
      pathname: '/(tabs)/(create)/camera',
      params: {
        id,
        participants: JSON.stringify(participants)
      }
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          Defina os nomes {initialCount > 0 ? `(${participants.length}/${initialCount})` : ''}
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Digite seu nome...."
            value={nameInput}
            onChangeText={setNameInput}
            onSubmitEditing={handleAddParticipant}
          />
          <TouchableOpacity style={styles.okButton} onPress={handleAddParticipant}>
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {participants.map((participant, index) => (
            <View key={index} style={styles.participantRow}>
              <Text style={styles.participantName}>{participant}</Text>
              <TouchableOpacity onPress={() => handleRemoveParticipant(index)}>
                <Ionicons name="close" size={20} color="#888" />
              </TouchableOpacity>
            </View>
          ))}

          {/* Placeholder items to match the visual style if list is empty or short? 
              The image shows "Nome Sobrenome 1", etc. 
              We'll just show the actual added participants. 
          */}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
          <Text style={styles.scanButtonText}>Escanear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    paddingTop: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '500',
    color: '#000',
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 24,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#333',
  },
  okButton: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#81007F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  okButtonText: {
    color: '#81007F',
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContainer: {
    marginTop: 8,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  participantName: {
    fontSize: 16,
    color: '#333',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#fff',
  },
  scanButton: {
    backgroundColor: '#81007F',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#FFFF00', // Yellow text as per typical design in this app, or white? Image shows yellow/gold.
    fontSize: 18,
    fontWeight: '500',
  },
});
