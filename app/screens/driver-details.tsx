import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/ThemeContext';
import { tripsAPI, session } from '@/services/api';

export default function DriverDetailsScreen() {
  const { theme } = useAppTheme();
  const isDark = theme === 'dark';
  
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any>(null);

  useEffect(() => {
    const fetchDriverDetails = async () => {
      try {
        setLoading(true);
        // Fallback driverId if session.user.id is missing
        const driverId = session.user?.id || 'driver-id';
        const details = await tripsAPI.getDriverDetails(driverId);
        setDriver(details);
      } catch (e) {
        console.error("Failed to load driver details", e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDriverDetails();
  }, []);

  const colors = {
    background: isDark ? '#0b0f19' : '#f8fafc',
    card: isDark ? '#1e293b' : '#ffffff',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e2e8f0',
    accent: '#6366f1',
    accentLight: 'rgba(99, 102, 241, 0.15)',
    success: '#10b981',
    successLight: 'rgba(16, 185, 129, 0.15)',
    warning: '#f59e0b',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FontAwesome5 name="arrow-left" size={16} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Driver Profile</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading Profile...</Text>
        </View>
      ) : driver ? (
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Main Profile Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.profileHeader}>
              <View style={[styles.avatarLarge, { backgroundColor: colors.accentLight }]}>
                <FontAwesome5 name="user-tie" size={36} color={colors.accent} />
                <View style={[styles.statusBadge, { backgroundColor: colors.success }]}>
                  <FontAwesome5 name="check" size={10} color="#fff" />
                </View>
              </View>
              <Text style={[styles.driverName, { color: colors.textPrimary }]}>{driver.name}</Text>
              <Text style={[styles.driverRole, { color: colors.textSecondary }]}>{driver.role}</Text>
              
              {/* Rating badge removed as stats are no longer returned */}
            </View>
            
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            
            <View style={styles.contactRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(14, 165, 233, 0.1)' }]}>
                <FontAwesome5 name="phone-alt" size={14} color="#0ea5e9" />
              </View>
              <Text style={[styles.contactText, { color: colors.textPrimary }]}>{driver.contact_number}</Text>
            </View>
          </View>
          
          {/* Stats Row Removed per user request */}
          
          {/* Vehicle Information Removed per user request */}
          
          {/* License Information */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>LICENSE & COMPLIANCE</Text>
          </View>
          
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.detailRow}>
              <FontAwesome5 name="address-card" size={16} color={colors.textSecondary} style={styles.detailIcon} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>License Number</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{driver.license?.number || 'N/A'}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <FontAwesome5 name="calendar-check" size={16} color={colors.textSecondary} style={styles.detailIcon} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Expiry Date</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {(() => {
                  if (!driver.license?.expiry) return 'N/A';
                  try {
                    // Handle '2026-05-09 00:00:00' format gracefully across platforms
                    const d = new Date(driver.license.expiry.replace(' ', 'T'));
                    if (isNaN(d.getTime())) return driver.license.expiry.split(' ')[0];
                    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                  } catch (e) {
                    return String(driver.license.expiry);
                  }
                })()}
              </Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: Platform.OS === 'ios' ? 40 : 25,
    marginBottom: 20,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 38,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  driverRole: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  ratingText: {
    color: '#f59e0b',
    fontWeight: '800',
    fontSize: 14,
    marginLeft: 6,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 14,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactText: {
    fontSize: 15,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  statIcon: {
    marginBottom: 10,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionHeader: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: 14,
    width: 18,
    textAlign: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
