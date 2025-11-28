import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ParticipantsScreen() {
  const { id, participantCount } = useLocalSearchParams();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Participantes da Conta {id}</Text>
      <Text>Número de participantes: {participantCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
});
