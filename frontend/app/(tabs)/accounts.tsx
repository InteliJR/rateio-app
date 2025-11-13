import { StyleSheet, Text, View } from 'react-native';

export default function AccountsScreen() {
  return (
    <View style={styles.container}>
      <Text>AccountsScreen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});