import { authAPI, session, setAuthToken } from '@/services/api';
import { initializePushNotifications, setupNotificationListeners } from '@/services/notifications';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [agencies, setAgencies] = useState<{ id: string; agency_name: string }[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<{ id: string; agency_name: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    fetchAgencies();
  }, []);

  const fetchAgencies = async () => {
    try {
      console.log('Fetching agencies from:', 'http://192.168.31.47:8000/api/auth/agencies');
      const data = await authAPI.getAgencies();
      console.log('Agencies fetched:', data);
      setAgencies(data);
      if (data && data.length > 0) {
        setSelectedAgency(data[0]);
      } else {
        // If no agencies returned, use a default mock agency for testing
        setAgencies([{ id: '1', agency_name: 'Test Agency' }]);
        setSelectedAgency({ id: '1', agency_name: 'Test Agency' });
      }
    } catch (error: any) {
      console.error('Failed to fetch agencies', error);
      console.error('Error details:', error.message, error.code);
      // Use mock agency for testing when backend is unreachable
      console.log('Using mock agency for testing');
      setAgencies([{ id: '1', agency_name: 'Test Agency' }]);
      setSelectedAgency({ id: '1', agency_name: 'Test Agency' });
      Alert.alert('Connection Warning', 'Using test mode - backend unreachable. Please ensure your phone and computer are on the same WiFi network and Windows Firewall allows port 8000.');
    }
  };

  const handleLogin = async () => {
    if (!selectedAgency) {
      Alert.alert('Error', 'Please select an agency');
      return;
    }
    if (!phoneNumber || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.login({
        username: phoneNumber,
        password: password,
        agency_id: selectedAgency.id,
      });
      
      if (response && response.access_token) {
        // Initialize token globally
        setAuthToken(response.access_token);
        
        // Store user in session (explicitly adding selected agency_id since backend UserResponse lacks it)
        session.user = {
          ...response.user,
          agency_id: selectedAgency.id,
        };

        // Initialize push notifications for the logged in user
        if (session.user && session.user.id) {
          initializePushNotifications(session.user.id);
          setupNotificationListeners();
        }
        
        Alert.alert('Success', 'Login successful');
        router.replace('/dashboard'); // Navigate to tabs
      } else {
        Alert.alert('Error', 'Invalid login response');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoBackground}>
          <FontAwesome5 name="taxi" size={32} color="#38bdf8" />
        </View>
        <Text style={styles.logoTitle}>TMS Mobile</Text>
        <Text style={styles.logoSubtitle}>Secure Login for Drivers</Text>
      </View>

      {/* Agency Dropdown */}
      <Text style={styles.label}>Agency *</Text>
      <TouchableOpacity 
        style={styles.inputContainer} 
        onPress={() => setShowDropdown(true)}
      >
        <FontAwesome5 name="building" size={16} color="#64748b" style={styles.inputIcon} />
        <Text style={styles.dropdownValueText}>
          {selectedAgency ? selectedAgency.agency_name : 'Select Agency'}
        </Text>
        <FontAwesome5 name="chevron-down" size={14} color="#64748b" style={{ marginRight: 16 }} />
      </TouchableOpacity>

      <Text style={styles.label}>Phone Number / Email *</Text>
      <View style={styles.inputContainer}>
        <FontAwesome5 name="user" size={16} color="#64748b" style={styles.inputIcon} />
        <TextInput
          placeholder="Phone Number / Email"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          style={styles.inputField}
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
      </View>
      
      <Text style={styles.label}>Password *</Text>
      <View style={styles.inputContainer}>
        <FontAwesome5 name="lock" size={16} color="#64748b" style={styles.inputIcon} />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.inputField}
          placeholderTextColor="#64748b"
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'LOGIN'}</Text>
      </TouchableOpacity>

      {/* Dropdown Selection Modal */}
      <Modal visible={showDropdown} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Agency</Text>
            <FlatList
              data={agencies}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedAgency(item);
                    setShowDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{item.agency_name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowDropdown(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Text style={styles.footer}>© 2026 Travel Management System</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1, 
    justifyContent: 'center', 
    padding: 24, 
    backgroundColor: '#0b0f19'
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  logoSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
    height: 56,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 12,
  },
  inputField: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 16,
    paddingRight: 16,
  },
  dropdownValueText: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#6366f1', 
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5
  },
  buttonText: {
    color: '#fff', 
    fontWeight: '800', 
    fontSize: 18,
    letterSpacing: 0.5,
  },
  footer: {
    textAlign: 'center', 
    marginTop: 40, 
    color: '#64748b',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    width: '100%',
    maxHeight: '60%',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#475569',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
    color: '#f8fafc',
    textAlign: 'center',
  },
  dropdownItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  closeButton: {
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
