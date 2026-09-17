import { FontAwesome5 } from '@expo/vector-icons';
import { Notifications } from '@/services/notifications';
import type { NotificationRequest } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function NotificationsScreen() {
  const [scheduledNotifs, setScheduledNotifs] = useState<NotificationRequest[]>([]);

  useEffect(() => {
    // Fetch all scheduled notifications to show them in the UI
    const fetchScheduled = async () => {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      setScheduledNotifs(scheduled);
    };

    fetchScheduled();
    const interval = setInterval(fetchScheduled, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={scheduledNotifs}
        keyExtractor={(item) => item.identifier}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome5 name="bell-slash" size={48} color="#475569" />
            <Text style={styles.emptyText}>No notifications scheduled.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <FontAwesome5 name="bell" size={20} color="#6366f1" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.content.title}</Text>
              <Text style={styles.cardBody}>{item.content.body}</Text>
              <Text style={styles.cardTime}>
                {(item.trigger as any)?.type === 'date' 
                  ? new Date((item.trigger as any).date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                  : 'Pending'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 14,
    color: '#cbd5e1',
    marginBottom: 8,
  },
  cardTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
});