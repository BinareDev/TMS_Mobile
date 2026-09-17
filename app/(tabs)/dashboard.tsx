import { useColorScheme } from '@/hooks/use-color-scheme';
import { brand, surface } from '@/constants/design';
import { activeSession, api, session, tripsAPI } from '@/services/api';
import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';

export default function Dashboard() {
  const [availableCount, setAvailableCount] = useState<number | string>('-');
  const [acceptedCount, setAcceptedCount] = useState<number | string>('-');
  const [rejectedCount, setRejectedCount] = useState<number | string>('-');
  const [completedCount, setCompletedCount] = useState<number | string>('-');
  const [currentTrip, setCurrentTrip] = useState<any>(null);
  const [urgentTrip, setUrgentTrip] = useState<any>(null);
  const [tripToStartNow, setTripToStartNow] = useState<any>(null);
  const dismissedStartTrips = React.useRef<Set<string>>(new Set());
  const [dismissedLoaded, setDismissedLoaded] = useState(false);
  const [, setLoading] = useState(true);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTripId, setRejectTripId] = useState<string | number | null>(null);
  const [rejectTripLeg, setRejectTripLeg] = useState<'outbound' | 'return'>('outbound');
  const [rejectReason, setRejectReason] = useState('');

  const theme = useColorScheme();
  const isDark = theme === 'dark';

  const driverId = session.user?.id || 'cf6912d9-6617-482b-aacf-dd034c780185';
  const agencyId = session.user?.agency_id || '6e7cdb44-603c-46c4-a4ca-198334c34314';

  // Dynamic colors
  const colors = {
    ...(isDark ? surface.dark : surface.light),
    textPrimary: isDark ? surface.dark.text : surface.light.text,
    textSecondary: isDark ? surface.dark.muted : surface.light.muted,
    accent: brand.primary,
    accentLight: 'rgba(79, 70, 229, 0.12)',
    success: brand.success,
    successLight: 'rgba(16, 185, 129, 0.15)',
    glowDot: brand.success,
    warning: brand.warning,
    danger: brand.danger,
  };

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        setLoading(true);
        const trips = await tripsAPI.getTrips(undefined, driverId, agencyId);

        const available = trips.filter((t: any) =>
          t.driver_response !== 'accepted' &&
          t.driver_response !== 'declined' &&
          t.status !== 'completed' &&
          t.is_active === true
        ).length;

        const accepted = trips.filter((t: any) =>
          t.driver_response === 'accepted' &&
          t.status !== 'completed' &&
          t.is_active === true
        ).length;

        const rejected = trips.filter((t: any) =>
          t.driver_response === 'declined' ||
          t.driver_response_two_way === 'declined'
        ).length;

        const completed = trips.filter((t: any) =>
          t.status === 'completed' ||
          (t.is_active === false && t.driver_response !== 'declined' && t.driver_response_two_way !== 'declined')
        ).length;

        // Find current/active trip
        const now = new Date();
        const current = trips.find((t: any) => {
          if (t.status === 'completed' || !t.is_active) return false;
          if (!t.start_date) return false;

          const startDate = new Date(t.start_date);
          const endDate = t.end_date ? new Date(t.end_date) : new Date(t.start_date);

          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const tripStartDay = new Date(startDate);
          tripStartDay.setHours(0, 0, 0, 0);
          const tripEndDay = new Date(endDate);
          tripEndDay.setHours(0, 0, 0, 0);

          if (today >= tripStartDay && today <= tripEndDay) {
            // Check outbound leg
            if (t.driver_response === 'accepted' && t.one_way_start_time) {
              const [hour, minute, second] = t.one_way_start_time.split(':').map(Number);
              const tripTodayTime = new Date(now);
              tripTodayTime.setHours(hour, minute, second || 0, 0);

              const diffMinutes = (tripTodayTime.getTime() - now.getTime()) / (1000 * 60);
              if (diffMinutes >= -30 && diffMinutes <= 120) {
                return true;
              }
            }

            // Check return leg
            if (t.driver_response_two_way === 'accepted' && t.two_way_start_time) {
              const [hour, minute, second] = t.two_way_start_time.split(':').map(Number);
              const tripTodayTime = new Date(now);
              tripTodayTime.setHours(hour, minute, second || 0, 0);

              const diffMinutes = (tripTodayTime.getTime() - now.getTime()) / (1000 * 60);
              if (diffMinutes >= -30 && diffMinutes <= 120) {
                return true;
              }
            }
          }
          return false;
        });

        setAvailableCount(available);
        setAcceptedCount(accepted);
        setRejectedCount(rejected);
        setCompletedCount(completed);
        setCurrentTrip(current);

        const urgent = trips.find((t: any) => {
          if (t.status === 'completed' || !t.is_active) return false;
          if (!t.start_date) return false;

          const startDate = new Date(t.start_date);
          const endDate = t.end_date ? new Date(t.end_date) : new Date(t.start_date);

          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const tripStartDay = new Date(startDate);
          tripStartDay.setHours(0, 0, 0, 0);
          const tripEndDay = new Date(endDate);
          tripEndDay.setHours(0, 0, 0, 0);

          if (today >= tripStartDay && today <= tripEndDay) {
            // Check outbound leg
            const isOutboundPending = !t.driver_response || t.driver_response === 'pending';
            if (isOutboundPending && t.one_way_start_time) {
              const [hour, minute, second] = t.one_way_start_time.split(':').map(Number);
              const tripTodayTime = new Date(now);
              tripTodayTime.setHours(hour, minute, second || 0, 0);

              const diffMinutes = (tripTodayTime.getTime() - now.getTime()) / (1000 * 60);
              console.log(`[Urgent Check] Outbound leg for trip ${t.id}: time=${t.one_way_start_time}, diff=${diffMinutes} mins, pending=${isOutboundPending}`);
              if (diffMinutes >= 0 && diffMinutes <= 5) {
                t.urgentLeg = 'outbound';
                return true;
              }
            }

            // Check return leg
            const isReturnPending = !t.driver_response_two_way || t.driver_response_two_way === 'pending';
            if (isReturnPending && t.two_way_start_time) {
              const [hour, minute, second] = t.two_way_start_time.split(':').map(Number);
              const tripTodayTime = new Date(now);
              tripTodayTime.setHours(hour, minute, second || 0, 0);

              const diffMinutes = (tripTodayTime.getTime() - now.getTime()) / (1000 * 60);
              console.log(`[Urgent Check] Return leg for trip ${t.id}: time=${t.two_way_start_time}, diff=${diffMinutes} mins, pending=${isReturnPending}`);
              if (diffMinutes >= 0 && diffMinutes <= 5) {
                t.urgentLeg = 'return';
                return true;
              }
            }
          }
          return false;
        });
        setUrgentTrip(urgent);
      } catch (error) {
        console.error('Failed to fetch dashboard counts:', error);
        setAvailableCount(0);
        setAcceptedCount(0);
        setRejectedCount(0);
        setCompletedCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (urgentTrip) {
      Vibration.vibrate([1000, 1000, 1000], true);
    } else {
      Vibration.cancel();
    }
    return () => Vibration.cancel();
  }, [urgentTrip]);

  // Load dismissed trips from storage
  useEffect(() => {
    try {
      AsyncStorage.getItem('dismissedStartTrips').then(stored => {
        if (stored) {
          try {
            const arr = JSON.parse(stored);
            dismissedStartTrips.current = new Set(arr);
          } catch(e) {}
        }
        setDismissedLoaded(true);
      }).catch((e) => {
        console.warn('AsyncStorage is not available for dismissedStartTrips:', e);
        setDismissedLoaded(true);
      });
    } catch (e) {
      console.warn('AsyncStorage sync error:', e);
      setDismissedLoaded(true);
    }
  }, []);

  // Check for certification expiry on app load
  useEffect(() => {
    const checkCertification = async () => {
      try {
        if (!session.user?.id) return;
        const driverDetails = await tripsAPI.getDriverDetails(session.user.id);
        if (driverDetails && driverDetails.license && driverDetails.license.expiry) {
          const { scheduleCertificationExpiryNotification } = require('@/services/notifications');
          await scheduleCertificationExpiryNotification(session.user.id, driverDetails.license.expiry);
        }
      } catch (e) {
        console.log('Failed to check certification expiry', e);
      }
    };
    
    // Only check once when dashboard mounts
    checkCertification();
  }, []);

  const dismissTripStart = (key: string) => {
    dismissedStartTrips.current.add(key);
    try {
      AsyncStorage.setItem('dismissedStartTrips', JSON.stringify(Array.from(dismissedStartTrips.current))).catch(() => {});
    } catch (e) {}
  };

  // Separate useEffect to check for trips that need to start
  useEffect(() => {
    if (!dismissedLoaded) return;

    const checkTripsToStart = async () => {
      try {
        const trips = await tripsAPI.getTrips(undefined, driverId, agencyId);
        
        let activeLocationTripIds = new Set<string>();
        try {
          const allLocsRes = await api.get('/mobile/locations/all');
          const activeLocs = allLocsRes.data.filter((loc: any) => loc.is_active === true);
          activeLocs.forEach((loc: any) => activeLocationTripIds.add(String(loc.trip_id)));
        } catch (e) {}

        const now = new Date();

        const startingNow = trips.find((t: any) => {
          if (t.status === 'completed' || !t.is_active) return false;
          if (activeLocationTripIds.has(String(t.id))) return false; // Already started
          if (!t.start_date) return false;

          const startDate = new Date(t.start_date);
          const endDate = t.end_date ? new Date(t.end_date) : new Date(t.start_date);

          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const tripStartDay = new Date(startDate);
          tripStartDay.setHours(0, 0, 0, 0);
          const tripEndDay = new Date(endDate);
          tripEndDay.setHours(0, 0, 0, 0);

          if (today >= tripStartDay && today <= tripEndDay) {
            // Check one_way_start_time
            if (t.one_way_start_time && t.one_way_is_active !== false && t.driver_response === 'accepted') {
              const [hour, minute, second] = t.one_way_start_time.split(':').map(Number);
              const tripTodayTime = new Date(now);
              tripTodayTime.setHours(hour, minute, second || 0, 0);
              const diffMinutes = (tripTodayTime.getTime() - now.getTime()) / (1000 * 60);
              // Show popup from 2 mins before start up to 30 mins after
              if (diffMinutes >= -30 && diffMinutes <= 2) {
                if (!dismissedStartTrips.current.has(`${t.id}-outbound`)) {
                  t.startingLeg = 'outbound';
                  return true;
                }
              }
            }

            // Check two_way_start_time if exists
            if (t.two_way_start_time && t.two_way_is_active !== false && t.driver_response_two_way === 'accepted') {
              const [hour, minute, second] = t.two_way_start_time.split(':').map(Number);
              const tripTodayTime = new Date(now);
              tripTodayTime.setHours(hour, minute, second || 0, 0);
              const diffMinutes = (tripTodayTime.getTime() - now.getTime()) / (1000 * 60);
              console.log(`Trip ${t.id} two_way - diffMinutes: ${diffMinutes}`);
              if (diffMinutes >= -30 && diffMinutes <= 2) {
                if (!dismissedStartTrips.current.has(`${t.id}-return`)) {
                  t.startingLeg = 'return';
                  return true;
                }
              }
            }
          }
          return false;
        });
        console.log('Trip to start now:', startingNow);
        setTripToStartNow(startingNow);
      } catch (error) {
        console.error('Failed to check trips to start:', error);
      }
    };

    checkTripsToStart();
    const interval = setInterval(checkTripsToStart, 10000);
    return () => clearInterval(interval);
  }, [dismissedLoaded]);

  useEffect(() => {
    // Only vibrate for start trip if there is no urgent trip taking priority
    if (tripToStartNow && !urgentTrip) {
      Vibration.vibrate([500, 200, 500], true);
    } else if (!urgentTrip) {
      // Only cancel vibration if urgentTrip is also null (otherwise we might cancel urgent's vibration)
      Vibration.cancel();
    }
  }, [tripToStartNow, urgentTrip]);

  const promptReject = (tripId: string | number, leg?: 'outbound' | 'return') => {
    setRejectTripId(tripId);
    setRejectTripLeg(leg || 'outbound');
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const submitReject = async () => {
    if (!rejectTripId) return;
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for rejecting the trip.');
      return;
    }

    setRejectModalVisible(false);

    try {
      if (rejectTripLeg === 'return') {
        await tripsAPI.rejectReturnTrip(rejectTripId, driverId, rejectReason);
      } else {
        await tripsAPI.rejectTrip(rejectTripId, driverId, rejectReason);
      }
      Alert.alert('Declined', 'Trip Declined.');
      setUrgentTrip(null);
      Vibration.cancel();
    } catch (error) {
      Alert.alert('Error', 'Failed to reject trip.');
    }
  };

  const handleUrgentAction = async (action: 'accept' | 'decline') => {
    if (!urgentTrip) return;
    try {
      if (action === 'accept') {
        if (urgentTrip.urgentLeg === 'return') {
          await tripsAPI.acceptReturnTrip(urgentTrip.id, driverId);
        } else {
          await tripsAPI.acceptTrip(urgentTrip.id, driverId);
        }
        Alert.alert('Success', 'Trip Accepted!');
        setUrgentTrip(null);
        Vibration.cancel();
      } else {
        promptReject(urgentTrip.id, urgentTrip.urgentLeg);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update trip status.');
    }
  };

  const handleStartTrip = async (tripId: string | number) => {
    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to start trip.');
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude, accuracy, speed } = location.coords;

      // Build location data, only including accuracy/speed if they exist
      const locationData: any = {
        driver_id: driverId,
        trip_id: tripId,
        agency_id: agencyId,
        latitude,
        longitude,
        company_id: session.user?.company_id,
        start_date: tripToStartNow?.start_date,
        end_date: tripToStartNow?.end_date || tripToStartNow?.start_date,
      };
      if (accuracy !== null) locationData.accuracy = accuracy;
      if (speed !== null) locationData.speed = speed;

      // Call location API to create location record
      const locationResponse = await tripsAPI.startLocationTracking(locationData);

      if (locationResponse && locationResponse.location_id) {
        activeSession.location_id = locationResponse.location_id;
        try {
          await AsyncStorage.setItem('active_location_id', locationResponse.location_id.toString());
        } catch (storageErr) {
          console.warn("AsyncStorage not available, skipping local save.", storageErr);
        }

        // Sync initial route points to driver_location table immediately
        let targetTrip = tripToStartNow;
        if (!targetTrip && typeof urgentTrip !== 'undefined' && urgentTrip && urgentTrip.id === tripId) {
          targetTrip = urgentTrip;
        }

        if (targetTrip && targetTrip.route_point) {
          try {
            const parsedPoints = typeof targetTrip.route_point === 'string' ? JSON.parse(targetTrip.route_point) : targetTrip.route_point;
            if (Array.isArray(parsedPoints) && parsedPoints.length > 0) {
              await tripsAPI.updateLocationRoutePoints({
                trip_id: tripId,
                location_id: locationResponse.location_id,
                driver_id: driverId,
                agency_id: agencyId,
                route_point: parsedPoints
              });
              console.log("Successfully synced initial route points to driver_location table");
            }
          } catch(e) {
             console.warn("Failed to sync initial route points", e);
          }
        }
      }

      // Accept the trip (if it's not already accepted)
      try {
        await tripsAPI.acceptTrip(tripId, driverId);
      } catch (acceptErr) {
        console.warn("acceptTrip failed, it might already be accepted.", acceptErr);
      }

      Alert.alert('Success', 'Trip Started!');
      if (tripToStartNow) {
        const leg = tripToStartNow.startingLeg || (tripToStartNow.one_way_is_active !== false ? 'outbound' : 'return');
        dismissTripStart(`${tripId}-${leg}`);
        router.push(`/screens/live-map?tripId=${tripId}&leg=${leg}`);
      } else {
        dismissTripStart(String(tripId));
        router.push(`/screens/live-map?tripId=${tripId}&leg=outbound`);
      }
      setTripToStartNow(null);
    } catch (e: any) {
      console.error("Start Trip Error: ", e);
      const errorMessage = e?.response?.data?.detail || e?.message || JSON.stringify(e);
      Alert.alert('Error', `Failed to start trip: ${errorMessage}`);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Profile Header */}
      <View style={[styles.profileHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.profileAvatar, { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
          <FontAwesome5 name="user-astronaut" size={20} color={colors.accent} />
        </View>
        <View style={styles.profileDetails}>
          <Text style={styles.profileGreeting}>DRIVER CONSOLE</Text>
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>{session.user?.name || 'Active Driver'}</Text>
          <Text style={[styles.profileSubtext, { color: colors.textSecondary }]}>Ready for your next assignment</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={styles.statusGlowDot} />
          <Text style={styles.statusPillText}>ON DUTY</Text>
        </View>
      </View>

      {urgentTrip && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={!!urgentTrip}
          onRequestClose={() => setUrgentTrip(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.danger, borderWidth: 2 }]}>
              <View style={{ alignItems: 'center', marginBottom: 15 }}>
                <FontAwesome5 name="exclamation-circle" size={40} color={colors.danger} />
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.danger, marginTop: 10, textAlign: 'center' }}>URGENT: TRIP STARTING SOON</Text>
              </View>

              <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
                Trip for <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{urgentTrip.passenger_name || urgentTrip.company_name}</Text> at <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{urgentTrip.starting_point}</Text> starts in less than 5 minutes!
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.danger, marginRight: 10 }]}
                  onPress={() => handleUrgentAction('decline')}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>DECLINE</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.success }]}
                  onPress={() => handleUrgentAction('accept')}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>ACCEPT TRIP</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {tripToStartNow && !urgentTrip && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={!!tripToStartNow && !urgentTrip}
          onRequestClose={() => setTripToStartNow(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <FontAwesome5 name="car-side" size={40} color={colors.accent} />
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginTop: 10 }}>Start Trip</Text>
              </View>

              <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
                It&apos;s time to start the trip for <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{tripToStartNow.passenger_name || tripToStartNow.company_name}</Text> at <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{tripToStartNow.starting_point}</Text>.
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
                  onPress={() => {
                    if (tripToStartNow) {
                      const leg = tripToStartNow.startingLeg || (tripToStartNow.one_way_is_active !== false ? 'outbound' : 'return');
                      dismissTripStart(`${tripToStartNow.id}-${leg}`);
                    }
                    setTripToStartNow(null);
                  }}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Close</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.accent }]}
                  onPress={() => handleStartTrip(tripToStartNow.id)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Start Trip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}


      {/* Live Telemetry Widget */}
      {/* <View style={[styles.liveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.liveCardHeader}>
          <View style={[styles.liveBadge, { backgroundColor: colors.successLight }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.liveBadgeText, { color: colors.success }]}>GPS LINK ACTIVE</Text>
          </View>
          <Text style={styles.radarTime}>LIVE</Text>
        </View>
        
        <Text style={[styles.liveCardTitle, { color: colors.textPrimary }]}>Awaiting Assignation</Text>
        <Text style={[styles.liveCardDesc, { color: colors.textSecondary }]}>
          Your current telemetry is feeding back to dispatch. Status is updated in real time.
        </Text>

        <View style={[styles.liveFooter, { borderTopColor: colors.border }]}>
          <View style={styles.liveStat}>
            <Text style={[styles.liveStatVal, { color: colors.textPrimary }]}>{acceptedCount}</Text>
            <Text style={[styles.liveStatLabel, { color: colors.textSecondary }]}>Active Schedules</Text>
          </View>
          <View style={[styles.liveStatDivider, { backgroundColor: colors.border }]} />
          <View style={styles.liveStat}>
            <Text style={[styles.liveStatVal, { color: colors.accent }]}>100%</Text>
            <Text style={[styles.liveStatLabel, { color: colors.textSecondary }]}>Signal Quality</Text>
          </View>
        </View>
      </View> */}

      {/* Quick Actions Panel */}
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: colors.textSecondary }]}>QUICK CONTROLS</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/screens/map' as any)}>
          <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(236, 72, 153, 0.12)' }]}>
            <FontAwesome5 name="map-marked-alt" size={16} color="#ec4899" />
          </View>
          <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Live Map</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/screens/trips' as any)}>
          <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
            <FontAwesome5 name="taxi" size={16} color="#38bdf8" />
          </View>
          <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>View Trips</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/screens/settings' as any)}>
          <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
            <FontAwesome5 name="cog" size={16} color="#818cf8" />
          </View>
          <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Operational Metrics (Moved down!) */}
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: colors.textSecondary }]}>REALTIME OPERATIONAL METRICS</Text>
      </View>

      <View style={styles.metricsContainer}>
          {/* Available Jobs Row */}
          <TouchableOpacity
            style={[styles.metricRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/screens/trips' as any)}
          >
            <View style={[styles.metricIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
              <FontAwesome5 name="briefcase" size={18} color="#10b981" />
            </View>
            <View style={styles.metricTextContent}>
              <Text style={[styles.metricName, { color: colors.textPrimary }]}>Available Assignments</Text>
              <Text style={[styles.metricDesc, { color: colors.textSecondary }]}>Pending schedules waiting for your response.</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: 'rgba(16, 185, 129, 0.18)' }]}>
              <Text style={[styles.countText, { color: '#10b981' }]}>{availableCount}</Text>
            </View>
          </TouchableOpacity>

          {/* Active Schedules Row */}
          <TouchableOpacity
            style={[styles.metricRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/screens/trips' as any)}
          >
            <View style={[styles.metricIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
              <FontAwesome5 name="car" size={18} color="#38bdf8" />
            </View>
            <View style={styles.metricTextContent}>
              <Text style={[styles.metricName, { color: colors.textPrimary }]}>Active Schedules</Text>
              <Text style={[styles.metricDesc, { color: colors.textSecondary }]}>Accepted trips currently on your duty list.</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: 'rgba(56, 189, 248, 0.18)' }]}>
              <Text style={[styles.countText, { color: '#38bdf8' }]}>{acceptedCount}</Text>
            </View>
          </TouchableOpacity>

          {/* Completed Trips Row */}
          <TouchableOpacity
            style={[styles.metricRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/screens/trips' as any)}
          >
            <View style={[styles.metricIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
              <FontAwesome5 name="check-circle" size={18} color="#6366f1" />
            </View>
            <View style={styles.metricTextContent}>
              <Text style={[styles.metricName, { color: colors.textPrimary }]}>Completed Trips</Text>
              <Text style={[styles.metricDesc, { color: colors.textSecondary }]}>Total trips you have completed.</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: 'rgba(99, 102, 241, 0.18)' }]}>
              <Text style={[styles.countText, { color: '#6366f1' }]}>{completedCount}</Text>
            </View>
          </TouchableOpacity>

          {/* Rejected Trips Row */}
          <TouchableOpacity
            style={[styles.metricRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/screens/trips' as any)}
          >
            <View style={[styles.metricIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
              <FontAwesome5 name="times-circle" size={18} color="#ef4444" />
            </View>
            <View style={styles.metricTextContent}>
              <Text style={[styles.metricName, { color: colors.textPrimary }]}>Rejected Trips</Text>
              <Text style={[styles.metricDesc, { color: colors.textSecondary }]}>Trips you have declined.</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}>
              <Text style={[styles.countText, { color: '#ef4444' }]}>{rejectedCount}</Text>
            </View>
          </TouchableOpacity>
      </View>

      {/* Terminate Session Action */}
      <TouchableOpacity
        style={[styles.logoutRow, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)', borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)' }]}
        onPress={() => router.replace('/')}
      >
        <FontAwesome5 name="sign-out-alt" size={14} color="#ef4444" />
        <Text style={styles.logoutText}>Terminate Active Session</Text>
      </TouchableOpacity>

      {/* Reject Reason Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={rejectModalVisible}
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Reject Trip</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Please provide a reason for rejecting this trip.</Text>

            <TextInput
              style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g., Too far, Vehicle issue..."
              placeholderTextColor="#94a3b8"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmitButton]}
                onPress={submitReject}
              >
                <Text style={styles.modalSubmitText}>Submit Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 40 : 25,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 24,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  profileDetails: {
    marginLeft: 12,
    flex: 1,
  },
  profileGreeting: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  profileSubtext: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusGlowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  liveCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  liveCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  radarTime: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 1,
  },
  liveCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  liveCardDesc: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 20,
  },
  liveFooter: {
    borderTopWidth: 1,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  liveStat: {
    alignItems: 'center',
  },
  liveStatVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  liveStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  liveStatDivider: {
    width: 1,
    height: 30,
  },
  panelHeader: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  panelTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionBtn: {
    width: '31%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  metricsContainer: {
    marginBottom: 20,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  metricIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTextContent: {
    marginLeft: 14,
    flex: 1,
    paddingRight: 10,
  },
  metricName: {
    fontSize: 14,
    fontWeight: '800',
  },
  metricDesc: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  countBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '800',
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 15,
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
    marginLeft: 8,
  },
  urgentCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  urgentTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  urgentText: {
    fontSize: 14,
    marginBottom: 16,
  },
  urgentActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  urgentBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  urgentBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelButton: {
    borderWidth: 1,
    marginRight: 12,
  },
  modalSubmitButton: {
    backgroundColor: '#ef4444',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  elevenAMCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  elevenAMTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  elevenAMText: {
    fontSize: 14,
    marginBottom: 16,
  },
  startTripButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startTripButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  currentTripCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  currentTripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  currentTripTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
  currentTripText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  currentTripLocation: {
    fontSize: 13,
    marginBottom: 4,
  },
  currentTripTime: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  currentTripTimeText: {
    fontSize: 13,
    marginLeft: 6,
  },
  currentTripButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  currentTripButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
