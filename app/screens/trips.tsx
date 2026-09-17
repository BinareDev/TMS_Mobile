import { useColorScheme } from '@/hooks/use-color-scheme';
import { activeSession, api, loadSession, session, tripsAPI } from '@/services/api';
// import { cancelTripNotifications, scheduleMultipleTripNotifications, showLocalNotification, TripNotification } from '@/services/notifications';
import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';



interface Trip {
  id: string | number;
  original_id?: string | number; // Original trip ID for two-way trips
  passenger_name: string;
  passenger_phone: string;
  pickup_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_location: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  status: string;
  fare: number | null;
  distance: number | null;
  created_at: string;
  start_time?: string; // Trip start time for scheduling
  source?: string;
  company_name?: string;
  is_active?: boolean;
  is_started?: boolean;
  trip_type?: string;
  way?: string;
  start_date?: string;
  end_date?: string;
  // Leg identifier for two-way trips
  leg?: 'outbound' | 'return';
  // Two-way trip fields
  two_way_start_time?: string;
  two_way_isActive?: boolean;
  one_way_isActive?: boolean;
  driver_response_two_way?: string;
}

export default function TripsScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTripId, setRejectTripId] = useState<string | number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState<'current' | 'upcoming' | 'completed' | 'rejected'>('current');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(Date.now() + 24 * 60 * 60 * 1000)); // Default to tomorrow
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startTripPopupVisible, setStartTripPopupVisible] = useState(false);
  const [tripToStart, setTripToStart] = useState<any>(null);

  const theme = useColorScheme();
  const isDark = theme === 'dark';

  const colors = {
    background: isDark ? '#0b0f19' : '#f8fafc',
    card: isDark ? '#1e293b' : '#ffffff',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e2e8f0',
    accent: '#6366f1',
    activeTabBg: '#6366f1',
    inactiveTabBg: isDark ? '#1e293b' : '#ffffff',
    accentLight: 'rgba(99, 102, 241, 0.12)',
  };

  // Use active session credentials or fallback to active dev driver UUID
  const driverId = session.user?.id || 'cf6912d9-6617-482b-aacf-dd034c780185';
  const agencyId = session.user?.agency_id || '6e7cdb44-603c-46c4-a4ca-198334c34314';



  useEffect(() => {
    const init = async () => {
      await loadSession();
      loadTrips();
    };
    init();
  }, [activeTab, selectedDate]);

  useEffect(() => {
    // Continuously check for trips starting right now
    const checkUpcomingTrips = () => {
      if (!trips.length || startTripPopupVisible) return;

      const now = new Date();
      const upcomingTrip = trips.find((t: Trip) => {
        if (t.status === 'completed' || !t.start_time) return false;
        if (t.is_started) return false;

        // We use the start_date and end_date to see if today is valid
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
          const tripStartTime = new Date(t.start_time);
          // Show popup if it's the exact minute of the trip start time
          return now.getHours() === tripStartTime.getHours() &&
            now.getMinutes() === tripStartTime.getMinutes();
        }
        return false;
      });

      if (upcomingTrip) {
        setTripToStart(upcomingTrip);
        setStartTripPopupVisible(true);
      }
    };

    const interval = setInterval(checkUpcomingTrips, 10000);
    return () => clearInterval(interval);
  }, [trips, startTripPopupVisible]);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const data = await tripsAPI.getTrips(undefined, driverId, agencyId);
      
      let historyData: any[] = [];
      try {
        historyData = await tripsAPI.getTripHistory(agencyId, driverId);
      } catch (e) {
        console.warn("Failed to load trip history", e);
      }

      // Fetch active locations to see which trips are actually started right now
      let activeLocationTripIds = new Set<string>();
      try {
        const allLocsRes = await api.get('/mobile/locations/all');
        const activeLocs = allLocsRes.data.filter((loc: any) => loc.is_active === true);
        activeLocs.forEach((loc: any) => activeLocationTripIds.add(String(loc.trip_id)));
      } catch (e) {
        console.warn("Failed to fetch locations for is_started flag");
      }



      // STEP 1: Get all active trips
      const activeTrips = data.filter((t: any) => {
        return (
          t.status !== 'completed' &&
          t.is_active !== false &&
          t.driver_response !== 'declined'
        );
      });

      // STEP 2: Sort by start time (earliest first)
      activeTrips.sort((a: any, b: any) => {
        const timeA = a.start_date && a.one_way_start_time
          ? new Date(`${a.start_date}T${a.one_way_start_time}`).getTime()
          : 0;

        const timeB = b.start_date && b.one_way_start_time
          ? new Date(`${b.start_date}T${b.one_way_start_time}`).getTime()
          : 0;

        return timeA - timeB;
      });

      // STEP 3: Get today's date for filtering
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Format database trip objects into individual legs FIRST
      const formattedDbTrips: Trip[] = [];

      console.log('=== DEBUG: Raw trip data ===');
      console.log('Total trips:', data.length);

      data.forEach((ts: any) => {
        let passengerName = ts.company_name ? `Company: ${ts.company_name}` : 'No passengers';
        let passengerPhone = 'N/A';
        if (ts.route_point) {
          try {
            const points = typeof ts.route_point === 'string' ? JSON.parse(ts.route_point) : ts.route_point;
            if (Array.isArray(points) && points.length > 0) {
              const names = points.map((p: any) => p.passenger_name).filter(Boolean);
              const phones = points.map((p: any) => p.passenger_phone).filter(Boolean);
              if (names.length > 0) passengerName = names.join(', ');
              if (phones.length > 0) passengerPhone = phones.join(', ');
            }
          } catch (e) {
            // ignore parsing failures
          }
        }

        const baseTrip = {
          original_id: ts.id,
          is_started: activeLocationTripIds.has(String(ts.id)),
          passenger_name: passengerName,
          passenger_phone: passengerPhone,
          pickup_location: ts.starting_point || 'Unknown Start',
          pickup_lat: ts.starting_lat,
          pickup_lng: ts.starting_lng,
          dropoff_location: ts.end_point || 'Unknown End',
          dropoff_lat: ts.end_lat,
          dropoff_lng: ts.end_lng,
          fare: ts.distance_km ? Math.round(ts.distance_km * 15) : 100,
          distance: ts.distance_km ? Math.round(ts.distance_km * 10) / 10 : null,
          created_at: ts.created_at || new Date().toISOString(),
          source: 'postgres',
          start_date: ts.start_date,
          end_date: ts.end_date,
        };

        // Completed status now explicitly checks driver_response === 'completed' as per user request
        const isOneWayCompleted = ts.driver_response === 'completed' || ts.status === 'completed';
        const isTwoWayCompleted = ts.driver_response_two_way === 'completed' || ts.status === 'completed';

        // Check if this is a two-way trip
        if (ts.two_way_start_time !== null && ts.two_way_start_time !== undefined) {
          // Outbound leg
          const outboundTrip: Trip = {
            ...baseTrip,
            id: `${ts.id}-outbound`,
            status: ts.driver_response === 'declined' ? 'rejected' : (isOneWayCompleted ? 'completed' : (ts.driver_response === 'accepted' ? 'accepted' : 'pending')),
            is_active: ts.is_active !== false && !isOneWayCompleted,
            start_time: (() => {
              const date = ts.start_date;
              const time = ts.one_way_start_time;
              if (date && time) {
                return `${date}T${time}`;
              }
              return undefined;
            })(),
            leg: 'outbound',
            two_way_start_time: ts.two_way_start_time,
            two_way_isActive: ts.two_way_is_active ?? ts.two_way_isActive,
            one_way_isActive: ts.one_way_is_active ?? ts.one_way_isActive,
            driver_response_two_way: ts.driver_response_two_way,
          };
          formattedDbTrips.push(outboundTrip);

          // Return leg
          const returnTrip: Trip = {
            ...baseTrip,
            id: `${ts.id}-return`,
            // Reverse pickup and dropoff for return leg
            pickup_location: ts.end_point || 'Unknown Start',
            pickup_lat: ts.end_lat,
            pickup_lng: ts.end_lng,
            dropoff_location: ts.starting_point || 'Unknown End',
            dropoff_lat: ts.starting_lat,
            dropoff_lng: ts.starting_lng,
            status: ts.driver_response_two_way === 'declined' ? 'rejected' : (isTwoWayCompleted ? 'completed' : (ts.driver_response_two_way === 'accepted' ? 'accepted' : 'pending')),
            is_active: ts.is_active !== false && !isTwoWayCompleted,
            start_time: (() => {
              const date = ts.start_date;
              const time = ts.two_way_start_time;
              if (date && time) {
                return `${date}T${time}`;
              }
              return undefined;
            })(),
            leg: 'return',
            two_way_start_time: ts.two_way_start_time,
            two_way_isActive: ts.two_way_is_active ?? ts.two_way_isActive,
            one_way_isActive: ts.one_way_is_active ?? ts.one_way_isActive,
            driver_response_two_way: ts.driver_response_two_way,
          };
          formattedDbTrips.push(returnTrip);
        } else {
          // One-way trip
          const oneWayTrip: Trip = {
            ...baseTrip,
            id: ts.id,
            status: ts.driver_response === 'declined' ? 'rejected' : (isOneWayCompleted ? 'completed' : (ts.driver_response === 'accepted' ? 'accepted' : 'pending')),
            is_active: ts.is_active !== false && !isOneWayCompleted,
            start_time: (() => {
              const date = ts.start_date;
              const time = ts.one_way_start_time;
              if (date && time) {
                return `${date}T${time}`;
              }
              return undefined;
            })(),
            leg: undefined,
            two_way_start_time: ts.two_way_start_time,
            two_way_isActive: ts.two_way_is_active ?? ts.two_way_isActive,
            one_way_isActive: ts.one_way_is_active ?? ts.one_way_isActive,
            driver_response_two_way: ts.driver_response_two_way,
          };
          formattedDbTrips.push(oneWayTrip);
        }
      });

      // Format history trips
      const historyFormattedTrips: Trip[] = [];
      historyData.forEach((h: any) => {
        const ts = h.trip_schedule;
        if (!ts) return;
        
        let passengerName = ts.company_name ? `Company: ${ts.company_name}` : 'No passengers';
        let passengerPhone = 'N/A';
        if (ts.route_point) {
          try {
            const points = typeof ts.route_point === 'string' ? JSON.parse(ts.route_point) : ts.route_point;
            if (Array.isArray(points) && points.length > 0) {
              const names = points.map((p: any) => p.passenger_name).filter(Boolean);
              const phones = points.map((p: any) => p.passenger_phone).filter(Boolean);
              if (names.length > 0) passengerName = names.join(', ');
              if (phones.length > 0) passengerPhone = phones.join(', ');
            }
          } catch (e) {}
        }
        
        const historyTrip: Trip = {
          id: h.id, // unique history ID
          original_id: ts.id,
          is_started: false,
          passenger_name: passengerName,
          passenger_phone: passengerPhone,
          pickup_location: h.leg === 'return' ? (ts.end_point || 'Unknown Start') : (ts.starting_point || 'Unknown Start'),
          pickup_lat: h.leg === 'return' ? ts.end_lat : ts.starting_lat,
          pickup_lng: h.leg === 'return' ? ts.end_lng : ts.starting_lng,
          dropoff_location: h.leg === 'return' ? (ts.starting_point || 'Unknown End') : (ts.end_point || 'Unknown End'),
          dropoff_lat: h.leg === 'return' ? ts.starting_lat : ts.end_lat,
          dropoff_lng: h.leg === 'return' ? ts.starting_lng : ts.end_lng,
          fare: ts.distance_km ? Math.round(ts.distance_km * 15) : 100,
          distance: ts.distance_km ? Math.round(ts.distance_km * 10) / 10 : null,
          created_at: h.created_at || new Date().toISOString(),
          source: 'history',
          start_date: h.execution_date,
          end_date: h.execution_date,
          status: String(h.action || '').toLowerCase(), // 'completed' or 'rejected'
          is_active: false,
          start_time: (h.execution_date && (h.leg === 'return' ? ts.two_way_start_time : ts.one_way_start_time)) 
                        ? `${h.execution_date}T${h.leg === 'return' ? ts.two_way_start_time : ts.one_way_start_time}` 
                        : undefined,
          leg: h.leg,
        };
        historyFormattedTrips.push(historyTrip);
      });
      
      const allTrips = [...formattedDbTrips, ...historyFormattedTrips];

      // Filter trips for tabs based on leg properties
      const filteredTrips = allTrips.filter((t: any) => {

        let isActive = true;

        if (t.leg === 'outbound' || !t.leg) {
          // If it explicitly says false, it's completed
          if (t.one_way_isActive === false || t.one_way_isActive === 'false' || t.one_way_isActive === 0 ||
            t.one_way_is_active === false || t.one_way_is_active === 'false' || t.one_way_is_active === 0) {
            isActive = false;
          }
        } else if (t.leg === 'return') {
          // If it explicitly says false, it's completed
          if (t.two_way_isActive === false || t.two_way_isActive === 'false' || t.two_way_isActive === 0 ||
            t.two_way_is_active === false || t.two_way_is_active === 'false' || t.two_way_is_active === 0) {
            isActive = false;
          }
        }

        // Global statuses that mean it's done
        if (t.status === 'completed' || t.status === 'rejected') {
          isActive = false;
        }

        // --- FUTURE DATE OVERRIDE ---
        if (activeTab === 'upcoming' && t.end_date && t.status !== 'rejected') {
          const selected = new Date(selectedDate);
          selected.setHours(0, 0, 0, 0);

          if (selected.getTime() > today.getTime()) {
            const [endYear, endMonth, endDay] = t.end_date.split('-').map(Number);
            const endDateObj = new Date(endYear, endMonth - 1, endDay);
            endDateObj.setHours(0, 0, 0, 0);

            if (endDateObj.getTime() >= selected.getTime()) {
              isActive = true;
            }
          }
        }

        // Helper function to check if a trip matches the selected date
        const isDateMatching = (trip: any) => {
          if (!trip.start_date) return false;
          const selected = new Date(selectedDate);
          selected.setHours(0, 0, 0, 0);
          
          const [sYear, sMonth, sDay] = trip.start_date.split('-').map(Number);
          const sDate = new Date(sYear, sMonth - 1, sDay);
          sDate.setHours(0, 0, 0, 0);
          
          let eDate = sDate;
          if (trip.end_date) {
            const [eYear, eMonth, eDay] = trip.end_date.split('-').map(Number);
            eDate = new Date(eYear, eMonth - 1, eDay);
            eDate.setHours(0, 0, 0, 0);
          }
          
          return selected.getTime() >= sDate.getTime() && selected.getTime() <= eDate.getTime();
        };

        if (activeTab === 'rejected') {
          if (!isDateMatching(t)) return false;
          
          if (t.source === 'history') return t.status === 'rejected';
          
          // Fallback for old trips without history records
          const hasHistory = historyFormattedTrips.some(h =>
            h.original_id === t.original_id &&
            h.status === 'rejected' &&
            (h.leg === t.leg || !h.leg)
          );
          if (hasHistory) return false;
          return t.status === 'rejected';
        }

        if (activeTab === 'completed') {
          if (!isDateMatching(t)) return false;
          
          if (t.source === 'history') return t.status === 'completed';
          
          // Fallback for old trips without history records
          const hasHistory = historyFormattedTrips.some(h =>
            h.original_id === t.original_id &&
            h.status === 'completed' &&
            (h.leg === t.leg || !h.leg)
          );
          if (hasHistory) return false;
          return !isActive && t.status !== 'rejected';
        }

        if (activeTab === 'current') {
          if (t.source === 'history') return false; // History doesn't show in current tab
          
          // If there is ANY history for TODAY for this trip, hide it from the current tab!
          const hasHistoryForToday = historyFormattedTrips.some(h => {
            if (!h.start_date) return false;
            const [hYear, hMonth, hDay] = h.start_date.split('-').map(Number);
            const hDate = new Date(hYear, hMonth - 1, hDay);
            hDate.setHours(0, 0, 0, 0);
            return h.original_id === t.original_id && (h.leg === t.leg || !h.leg) && hDate.getTime() === today.getTime();
          });
          if (hasHistoryForToday) return false;

          // For current tab only, hide completed trips
          if (!isActive) return false;

          if (t.start_date) {
            const [startYear, startMonth, startDay] = t.start_date.split('-').map(Number);
            const startDate = new Date(startYear, startMonth - 1, startDay);
            startDate.setHours(0, 0, 0, 0);

            let endDate = startDate;
            if (t.end_date) {
              const [endYear, endMonth, endDay] = t.end_date.split('-').map(Number);
              endDate = new Date(endYear, endMonth - 1, endDay);
              endDate.setHours(0, 0, 0, 0);
            }

            return today.getTime() >= startDate.getTime() && today.getTime() <= endDate.getTime();
          }
          return false;
        }

        if (activeTab === 'upcoming') {
          const selected = new Date(selectedDate);
          selected.setHours(0, 0, 0, 0);

          // Always show history trips for the selected date (past, today, or future)
          if (t.source === 'history') {
            if (t.start_date) {
              const [hYear, hMonth, hDay] = t.start_date.split('-').map(Number);
              const hDate = new Date(hYear, hMonth - 1, hDay);
              hDate.setHours(0, 0, 0, 0);
              // Only match if legs match or history leg is null
              return hDate.getTime() === selected.getTime();
            }
            return false;
          }
          
          // For active trips, if we already have a history record for this exact date, hide it!
          const hasHistoryForDate = historyFormattedTrips.some(h => {
            if (!h.start_date) return false;
            const [hYear, hMonth, hDay] = h.start_date.split('-').map(Number);
            const hDate = new Date(hYear, hMonth - 1, hDay);
            hDate.setHours(0, 0, 0, 0);
            return h.original_id === t.original_id && (h.leg === t.leg || !h.leg) && hDate.getTime() === selected.getTime();
          });
          if (hasHistoryForDate) return false;

          if (t.start_date) {
            const [startYear, startMonth, startDay] = t.start_date.split('-').map(Number);
            const startDate = new Date(startYear, startMonth - 1, startDay);
            startDate.setHours(0, 0, 0, 0);

            let endDate = startDate;
            if (t.end_date) {
              const [endYear, endMonth, endDay] = t.end_date.split('-').map(Number);
              endDate = new Date(endYear, endMonth - 1, endDay);
              endDate.setHours(0, 0, 0, 0);
            }
            return selected.getTime() >= startDate.getTime() && selected.getTime() <= endDate.getTime();
          }
          return false;
        }

        return false;
      });

      // Sort all trips by start time
      filteredTrips.sort((a: any, b: any) => {
        const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return timeA - timeB;
      });

      console.log(filteredTrips);
      setTrips(filteredTrips);

      // The continuous check is now handled by a separate useEffect interval

      // --------------------
      // NEW TRIP NOTIFICATION
      // --------------------


      // // --------------------
      // // SCHEDULE 15/10/5 MIN REMINDERS
      // // --------------------
      // const notificationTrips: TripNotification[] = data
      //   .filter(
      //     (t: any) =>
      //       currentTripId !== null &&
      //       String(t.id) === currentTripId
      //   )
      //   .map((t: any) => ({
      //     tripId: t.id,
      //     passengerName: t.company_name
      //       ? `Company: ${t.company_name}`
      //       : "Passenger",

      //     pickupLocation: t.starting_point,

      //     startDate: t.start_date,
      //     endDate: t.end_date,

      //     startTime: t.one_way_start_time,

      //     isPending: t.driver_response !== "accepted",
      //   }));

      // // Cancel old reminders first (avoid duplicates)
      // for (const trip of notificationTrips) {
      //   await cancelTripNotifications(trip.tripId);
      // }

      // // Schedule new reminders
      // await scheduleMultipleTripNotifications(notificationTrips);
    } catch (error: any) {
      if (error.response?.status === 401) {
        Alert.alert('Session Expired', 'Please log in again');
        router.replace('/');
      } else {
        Alert.alert('Error', 'Failed to load trips');
      }
    } finally {
      setLoading(false);
    }
  };



  const submitReject = async () => {
    if (!rejectTripId) return;
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for rejecting the trip.');
      return;
    }

    setRejectModalVisible(false);

    try {
      // Extract original_id if this is a leg trip
      const originalId = String(rejectTripId).includes('-') ? String(rejectTripId).split('-')[0] : rejectTripId;
      const isReturnLeg = String(rejectTripId).includes('-return');

      if (String(rejectTripId).startsWith('mock-')) {
        Alert.alert('Success (Mock)', 'Mock trip rejected locally');
        setTrips(prev => prev.filter(t => t.id !== rejectTripId));
        return;
      }

      if (isReturnLeg) {
        await tripsAPI.rejectReturnTrip(originalId, rejectReason);
        Alert.alert('Success', 'Return trip rejected');
      } else {
        await tripsAPI.rejectTrip(originalId, driverId, rejectReason);
        Alert.alert('Success', 'Trip rejected');
      }

      // if (Platform.OS === 'android' && isRunningInExpoGo()) {
      //   const trip = trips.find(t => t.id === rejectTripId);
      //   const name = trip ? trip.passenger_name : 'Passenger';
      //   showLocalNotification('Trip Rejected', `You have rejected the trip for ${name}.`);
      // }

      loadTrips();
    } catch (error) {
      Alert.alert('Error', 'Failed to reject trip');
    }
  };



  const handleComplete = async (tripId: string | number) => {
    try {
      // Extract original_id if this is a leg trip (safely handle UUIDs)
      let originalId = String(tripId);
      let leg: 'outbound' | 'return' = 'outbound';
      if (originalId.endsWith('-outbound')) {
        originalId = originalId.replace('-outbound', '');
        leg = 'outbound';
      } else if (originalId.endsWith('-return')) {
        originalId = originalId.replace('-return', '');
        leg = 'return';
      }

      if (String(tripId).startsWith('mock-')) {
        Alert.alert('Success (Mock)', 'Mock trip completed locally');
        setTrips(prev => prev.filter(t => t.id !== tripId));
        return;
      }

      let locationId = activeSession.location_id || 0;
      if (locationId === 0) {
        try {
          const locIdStr = await AsyncStorage.getItem('active_location_id');
          if (locIdStr) locationId = parseInt(locIdStr, 10);
        } catch (storageErr) {
          console.warn("AsyncStorage unavailable, relying on activeSession");
        }
      }

      // ROBUST FALLBACK: If local storage and memory both failed (e.g. app was reloaded),
      // we can fetch the active location ID directly from the backend!
      if (locationId === 0) {
        try {
          const allLocationsRes = await api.get('/mobile/locations/all');
          const allLocations = allLocationsRes.data;
          // Find the active location for THIS trip
          const activeLoc = allLocations.find((loc: any) => loc.trip_id === originalId && loc.is_active === true);
          if (activeLoc && activeLoc.id) {
            locationId = activeLoc.id;
            console.log("Successfully recovered location_id from backend:", locationId);
          }
        } catch (fetchErr) {
          console.error("Failed to recover location_id from backend", fetchErr);
        }
      }

      if (locationId === 0) {
        Alert.alert('Error', 'Could not find active location tracking for this trip. The backend might have already deactivated it.');
        return;
      }

      await tripsAPI.completeTrip(driverId, locationId, originalId, leg);

      try {
        await AsyncStorage.removeItem('active_location_id');
      } catch (e) { }
      activeSession.location_id = null;

      Alert.alert('Success', 'Trip completed successfully');

      // if (Platform.OS === 'android' && isRunningInExpoGo()) {
      //   const trip = trips.find(t => t.id === tripId);
      //   const name = trip ? trip.passenger_name : 'Passenger';
      //   showLocalNotification('Trip Completed', `You have completed the trip for ${name}.`);
      // }

      loadTrips();
    } catch (error) {
      Alert.alert('Error', 'Failed to complete trip');
    }
  };

  const renderTrip = ({ item }: { item: Trip }) => {
    let displayStatus = item.status;

    if (activeTab === 'rejected') {
      displayStatus = 'rejected';
    } else if (activeTab === 'completed') {
      displayStatus = 'completed';
    } else if (activeTab === 'upcoming') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);

      if (selected.getTime() > today.getTime()) {
        displayStatus = 'pending';
      } else if (selected.getTime() === today.getTime()) {
        if (item.source === 'history') {
          displayStatus = item.status;
        } else if (item.status === 'rejected') {
          displayStatus = 'rejected';
        } else if (item.is_active === false) {
          displayStatus = 'completed';
        }
      } else if (selected.getTime() < today.getTime()) {
        // A passed date alone does not mean the driver completed the trip.
        // Only an actual completion record can use the completed status.
        if (item.source === 'history' || item.status === 'completed' || item.status === 'rejected') {
          displayStatus = item.status;
        } else {
          displayStatus = 'pending';
        }
      }
    } else if (item.is_active === false && item.status !== 'rejected') {
      displayStatus = 'completed';
    }

    const isCurrentlyRunning = item.is_started && activeTab === 'current' && item.is_active !== false;

    return (
      <View style={[
        styles.card, 
        { backgroundColor: colors.card, borderColor: colors.border },
        isCurrentlyRunning && styles.activeTripCard
      ]}>
        {isCurrentlyRunning && (
          <View style={styles.runningBadge}>
            <Text style={styles.runningBadgeText}>IN PROGRESS</Text>
          </View>
        )}
        <View style={styles.cardHeader}>
          <Text style={[styles.passengerName, { color: colors.textPrimary }]}>{item.passenger_name}</Text>
          <View style={styles.headerBadges}>
            {item.leg && (
              <View style={[styles.legBadge, { backgroundColor: item.leg === 'outbound' ? '#6366f1' : '#f59e0b' }]}>
                <Text style={styles.legText}>{item.leg === 'outbound' ? 'OUTBOUND' : 'RETURN'}</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(displayStatus) }]}>
              <Text style={styles.statusText}>{displayStatus.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Styled Timeline Map Segment */}
        <View style={styles.timelineContainer}>
          <View style={styles.timelineLeft}>
            <View style={[styles.timelineDot, { backgroundColor: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }]} />
            <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
            <View style={[styles.timelineDot, { backgroundColor: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }]} />
          </View>
          <View style={styles.timelineRight}>
            <View style={styles.locationGroup}>
              <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
              <Text style={[styles.locationText, { color: colors.textSecondary }]} numberOfLines={1}>{item.pickup_location}</Text>
            </View>
            <View style={{ height: 20 }} />
            <View style={styles.locationGroup}>
              <Text style={styles.locationLabel}>DROPOFF LOCATION</Text>
              <Text style={[styles.locationText, { color: colors.textSecondary }]} numberOfLines={1}>{item.dropoff_location}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.detailsRow, { borderTopColor: colors.border }]}>
          {item.start_date && (
            <View style={styles.detailItem}>
              <View style={styles.detailIconContainer}>
                <FontAwesome5 name="calendar-alt" size={12} color="#38bdf8" />
              </View>
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {item.start_date}{item.end_date && item.end_date !== item.start_date ? ` - ${item.end_date}` : ''}
              </Text>
            </View>
          )}
          {item.start_time && (
            <View style={styles.detailItem}>
              <View style={styles.detailIconContainer}>
                <FontAwesome5 name="clock" size={12} color="#38bdf8" />
              </View>
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {new Date(item.start_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
              </Text>
            </View>
          )}
          {item.distance && (
            <View style={styles.detailItem}>
              <View style={styles.detailIconContainer}>
                <FontAwesome5 name="road" size={12} color="#38bdf8" />
              </View>
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.distance} km</Text>
            </View>
          )}
          <View style={styles.detailItem}>
            <View style={styles.detailIconContainer}>
              <FontAwesome5 name="phone" size={12} color="#38bdf8" />
            </View>
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.passenger_phone}</Text>
          </View>
        </View>


        {item.status === 'accepted' && activeTab === 'current' && item.is_active !== false && item.is_started === true && (
          <>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={() => handleComplete(item.id)}
            >
              <Text style={styles.actionButtonText}>Complete Trip</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 15 }}>
          <TouchableOpacity
            style={styles.secondaryDetailsButton}
            onPress={() => router.push({
              pathname: '/screens/trip-details',
              params: {
                tripId: item.original_id ? item.original_id.toString() : item.id.toString(),
                leg: item.leg || 'outbound'
              }
            })}
          >
            <FontAwesome5 name="list-ul" size={14} color="#e2e8f0" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryDetailsText}>Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryMapButton}
            onPress={() => router.push({
              pathname: '/screens/live-map',
              params: {
                tripId: item.original_id ? item.original_id.toString() : item.id.toString(),
                leg: item.leg || 'outbound',
                status: item.status
              }
            })}
          >
            <FontAwesome5 name="map-marker-alt" size={14} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryMapText}>Live Map</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'accepted': return '#10b981';
      case 'rejected': return '#ef4444';
      case 'completed': return '#6366f1';
      default: return '#64748b';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        {router.canGoBack() && (
          <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome5 name="arrow-left" size={16} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Available Trips</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'current' ? { backgroundColor: colors.activeTabBg, borderColor: colors.accent } : { backgroundColor: colors.inactiveTabBg, borderColor: colors.border }]}
          onPress={() => setActiveTab('current')}
        >
          <Text style={[styles.tabText, activeTab === 'current' ? { color: '#ffffff' } : { color: colors.textSecondary }]}>Current</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' ? { backgroundColor: colors.activeTabBg, borderColor: colors.accent } : { backgroundColor: colors.inactiveTabBg, borderColor: colors.border }]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' ? { color: '#ffffff' } : { color: colors.textSecondary }]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' ? { backgroundColor: colors.activeTabBg, borderColor: colors.accent } : { backgroundColor: colors.inactiveTabBg, borderColor: colors.border }]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' ? { color: '#ffffff' } : { color: colors.textSecondary }]}>Completed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rejected' ? { backgroundColor: colors.activeTabBg, borderColor: colors.accent } : { backgroundColor: colors.inactiveTabBg, borderColor: colors.border }]}
          onPress={() => setActiveTab('rejected')}
        >
          <Text style={[styles.tabText, activeTab === 'rejected' ? { color: '#ffffff' } : { color: colors.textSecondary }]}>Rejected</Text>
        </TouchableOpacity>
      </View>

      {(activeTab === 'upcoming' || activeTab === 'completed' || activeTab === 'rejected') && (
        <TouchableOpacity
          style={[styles.datePickerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowDatePicker(true)}
        >
          <FontAwesome5 name="calendar-alt" size={16} color={colors.accent} />
          <Text style={[styles.datePickerText, { color: colors.textPrimary }]}>
            {selectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
          <FontAwesome5 name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      {loading ? (
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading trips...</Text>
      ) : (
        <FlatList
          data={trips}
          renderItem={renderTrip}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No {activeTab} trips available</Text>
          }
        />
      )}

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

      {/* Start Trip Popup */}
      {/* <Modal
        animationType="fade"
        transparent={true}
        visible={startTripPopupVisible}
        onRequestClose={() => setStartTripPopupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.startTripPopupContent, { backgroundColor: colors.card }]}>
            <View style={styles.startTripPopupHeader}>
              <FontAwesome5 name="car-side" size={32} color="#10b981" />
              <Text style={[styles.startTripPopupTitle, { color: colors.textPrimary }]}>Trip Starting Soon!</Text>
            </View>

            <Text style={[styles.startTripPopupText, { color: colors.textSecondary }]}>
              Your trip is about to start. Are you ready to begin?
            </Text>

            {tripToStart && (
              <View style={styles.startTripPopupDetails}>
                <Text style={[styles.startTripPopupDetailLabel, { color: colors.textSecondary }]}>Passenger:</Text>
                <Text style={[styles.startTripPopupDetailValue, { color: colors.textPrimary }]}>
                  {tripToStart.passenger_name || tripToStart.company_name}
                </Text>

                <Text style={[styles.startTripPopupDetailLabel, { color: colors.textSecondary }]}>From:</Text>
                <Text style={[styles.startTripPopupDetailValue, { color: colors.textPrimary }]}>
                  {tripToStart.pickup_location}
                </Text>

                <Text style={[styles.startTripPopupDetailLabel, { color: colors.textSecondary }]}>To:</Text>
                <Text style={[styles.startTripPopupDetailValue, { color: colors.textPrimary }]}>
                  {tripToStart.dropoff_location}
                </Text>

                <Text style={[styles.startTripPopupDetailLabel, { color: colors.textSecondary }]}>Time:</Text>
                <Text style={[styles.startTripPopupDetailValue, { color: colors.textPrimary }]}>
                  {tripToStart.start_time ? new Date(tripToStart.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </Text>
              </View>
            )}


          </View>
        </View>
      </Modal> */}

      {/* Calendar Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDatePicker}
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Date</Text>
            <Calendar
              onDayPress={(day: DateData) => {
                setSelectedDate(new Date(day.dateString));
                setShowDatePicker(false);
              }}
              markedDates={{
                [selectedDate.toISOString().split('T')[0]]: {
                  selected: true,
                  selectedColor: colors.accent,
                  selectedTextColor: '#ffffff',
                },
              }}
              theme={{
                backgroundColor: colors.card,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.textSecondary,
                selectedDayBackgroundColor: colors.accent,
                selectedDayTextColor: '#ffffff',
                todayTextColor: colors.accent,
                dayTextColor: colors.textPrimary,
                textDisabledColor: colors.textSecondary,
                arrowColor: colors.accent,
                monthTextColor: colors.textPrimary,
                textDayFontWeight: '500',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: '500',
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
              }}
              enableSwipeMonths={true}
            />
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? 40 : 25,
    marginBottom: 20,
    paddingHorizontal: 20,
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeTab: {
    backgroundColor: '#6366f1',
    borderColor: '#818cf8',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  activeTabText: {
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
  },
  activeTripCard: {
    borderColor: '#38bdf8',
    borderWidth: 2,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  runningBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: '#38bdf8',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  runningBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  passengerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    flex: 1,
    marginRight: 10,
  },
  legBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  legText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#cbd5e1',
    flex: 1,
    lineHeight: 20,
  },
  timelineContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  timelineLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    width: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  timelineRight: {
    flex: 1,
    justifyContent: 'space-between',
  },
  locationGroup: {
    justifyContent: 'center',
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailsRow: {
    flexDirection: 'column',
    marginTop: 8,
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  detailIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  completeButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryDetailsButton: {
    flex: 1,
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  secondaryDetailsText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryMapButton: {
    flex: 1,
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: '#6366f1',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#6366f1',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  primaryMapText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  viewMapButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  viewMapButtonText: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
    color: '#94a3b8',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
    color: '#64748b',
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
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  datePickerText: {
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  datePickerContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  dateOptionsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 24,
  },
  dateOptionButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  dateOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  calendarContent: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  startTripPopupContent: {
    width: '90%',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  startTripPopupHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  startTripPopupTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 12,
  },
  startTripPopupText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  startTripPopupDetails: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  startTripPopupDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  startTripPopupDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  startTripPopupButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  startTripPopupButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startTripPopupCancelButton: {
    borderWidth: 1,
  },
  startTripPopupCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  startTripPopupStartButton: {
    backgroundColor: '#10b981',
  },
  startTripPopupStartText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
