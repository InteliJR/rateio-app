import { StyleSheet, Text, View } from 'react-native';

export default function Bill() {
  return (
    <View style={styles.container}>
      <Text>Bill</Text>
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