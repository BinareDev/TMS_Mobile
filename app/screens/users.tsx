import { View, Text, FlatList, StyleSheet } from 'react-native';

const users = [
  { id: '1', name: 'Ravi', role: 'Admin' },
  { id: '2', name: 'Kumar', role: 'User' },
  { id: '3', name: 'Suresh', role: 'User' }
];

export default function Users() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Users</Text>

      <FlatList
        data={users}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={[styles.role, item.role === 'Admin' ? styles.admin : styles.user]}>
              {item.role}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f3f4f6' },
  header: { fontSize: 26, fontWeight: '700', marginBottom: 15, color: '#111827' },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 12, marginBottom: 12, elevation: 2 },
  name: { fontSize: 18, fontWeight: '600', color: '#111827' },
  role: { marginTop: 5, fontWeight: '500', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', color: '#fff', fontSize: 12 },
  admin: { backgroundColor: '#6366f1' },
  user: { backgroundColor: '#60a5fa' }
});