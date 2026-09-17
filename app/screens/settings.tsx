import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Linking } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/ThemeContext';
import { authAPI, session } from '@/services/api';

export default function SettingsScreen() {
  const { themePreference, theme, setThemePreference } = useAppTheme();
  const [agencyDetails, setAgencyDetails] = useState<any>(null);
  
  // User Info
  const user = session.user || {
    id: 'driver-id',
    name: 'Active Driver',
    contact_number: '+1 (555) 0199',
    role: 'Professional Driver',
    email: 'driver@tms.com',
    agency_id: '6e7cdb44-603c-46c4-a4ca-198334c34314',
  };

  const isDark = theme === 'dark';

  useEffect(() => {
    const fetchAgency = async () => {
      try {
        const agencies = await authAPI.getAgenciesDetailed();
        const currentAgency = agencies.find((agency: any) => String(agency.id) === String(user.agency_id));
        setAgencyDetails(currentAgency || null);
      } catch (error) {
        console.log('Failed to fetch agency details', error);
      }
    };

    fetchAgency();
  }, [user.agency_id]);

  // Dynamic theme styling
  const colors = {
    background: isDark ? '#0b0f19' : '#f8fafc',
    card: isDark ? '#1e293b' : '#ffffff',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e2e8f0',
    accent: '#6366f1',
    accentLight: 'rgba(99, 102, 241, 0.15)',
  };

  const themeOptions: { key: typeof themePreference; label: string; icon: string }[] = [
    { key: 'system', label: 'System Default', icon: 'laptop' },
    { key: 'light', label: 'Light', icon: 'sun' },
    { key: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        {router.canGoBack() && (
          <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome5 name="arrow-left" size={16} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>System Settings</Text>
      </View>

      {/* Driver Profile Summary */}
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push('/screens/driver-details')}
        activeOpacity={0.7}
      >
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.accentLight }]}>
            <FontAwesome5 name="user-astronaut" size={24} color={colors.accent} />
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user.name}</Text>
            <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>{user.role}</Text>
            <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>{user.contact_number}</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={14} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Agency Details */}
      {agencyDetails && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>AGENCY</Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.agencyTitleRow}>
              <FontAwesome5 name="building" size={16} color={colors.accent} />
              <Text style={[styles.cardLabel, styles.agencyTitle, { color: colors.textPrimary }]}>Agency Details</Text>
            </View>
            <Text style={[styles.agencyName, { color: colors.textPrimary }]}>
              {agencyDetails.agency_name || agencyDetails.name || 'Agency'}
            </Text>
            <View style={styles.agencyRow}>
              <FontAwesome5 name="map-marker-alt" size={14} color={colors.textSecondary} style={styles.agencyIcon} />
              <Text style={[styles.agencyText, { color: colors.textSecondary }]}>{agencyDetails.address || 'Address not available'}</Text>
            </View>
            <View style={styles.agencyRow}>
              <FontAwesome5 name="phone-alt" size={14} color={colors.textSecondary} style={styles.agencyIcon} />
              <Text style={[styles.agencyText, { color: colors.textSecondary }]}>{agencyDetails.contact_number || agencyDetails.phone || agencyDetails.contact || 'Contact not available'}</Text>
              {(agencyDetails.contact_number || agencyDetails.phone || agencyDetails.contact) && (
                <TouchableOpacity
                  style={[styles.callButton, { backgroundColor: '#10b981' }]}
                  onPress={() => Linking.openURL(`tel:${agencyDetails.contact_number || agencyDetails.phone || agencyDetails.contact}`)}
                >
                  <FontAwesome5 name="phone" size={12} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.callButtonText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
            {agencyDetails.email && (
              <View style={[styles.agencyRow, { marginBottom: 0 }]}>
                <FontAwesome5 name="envelope" size={14} color={colors.textSecondary} style={styles.agencyIcon} />
                <Text style={[styles.agencyText, { color: colors.textSecondary }]}>{agencyDetails.email}</Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* Theme Settings Section */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>THEME CONTROLS</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 40 }]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Choose Mode</Text>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
          Configure your visual interface layout.
        </Text>

        <View style={styles.themeSelectorContainer}>
          {themeOptions.map((opt) => {
            const isSelected = themePreference === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.themeButton,
                  {
                    backgroundColor: isSelected ? colors.accent : (isDark ? '#111827' : '#f1f5f9'),
                    borderColor: isSelected ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setThemePreference(opt.key)}
              >
                <FontAwesome5
                  name={opt.icon}
                  size={14}
                  color={isSelected ? '#ffffff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.themeButtonText,
                    {
                      color: isSelected ? '#ffffff' : colors.textPrimary,
                      fontWeight: isSelected ? '800' : '600',
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Theme Information Banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(14, 165, 233, 0.08)', borderColor: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(14, 165, 233, 0.2)' }]}>
          <FontAwesome5 name="info-circle" size={16} color="#0ea5e9" style={styles.infoIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTextTitle, { color: isDark ? '#38bdf8' : '#0284c7' }]}>Theme Details & Efficiency</Text>
            <Text style={[styles.infoTextBody, { color: colors.textSecondary }]}>
              ☀️ <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>Light Mode</Text> provides high contrast and visual sharpness under direct, bright sunlight—perfect for daytime navigation and readability.
            </Text>
            <Text style={[styles.infoTextBody, { color: colors.textSecondary, marginTop: 6 }]}>
              🌙 <Text style={{ fontWeight: 'bold', color: colors.textPrimary }}>Dark Mode</Text> utilizes pure black pixels to trigger OLED pixel shut-off, reducing overall device energy consumption and mitigating eye fatigue during nighttime shifts.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDetails: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
  },
  profileMeta: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  agencyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agencyTitle: {
    marginLeft: 10,
    marginBottom: 0,
  },
  agencyName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  agencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agencyIcon: {
    width: 20,
    textAlign: 'center',
    marginRight: 10,
  },
  agencyText: {
    fontSize: 14,
    flex: 1,
  },
  callButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  themeSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  themeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  themeButtonText: {
    fontSize: 12,
    marginLeft: 6,
  },
  infoBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
  },
  infoIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  infoTextTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoTextBody: {
    fontSize: 12,
    lineHeight: 18,
  },
});
