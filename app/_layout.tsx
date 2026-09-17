import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ThemeProvider as AppThemeProvider, useAppTheme } from '@/hooks/ThemeContext';

import { session, tripsAPI } from '@/services/api';
import { scheduleMultipleTripNotifications, showLocalNotification, TripNotification } from '@/services/notifications';
import { useEffect, useRef, useState } from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

function RootLayoutContent() {
  const { theme } = useAppTheme();


  const knownTripIds = useRef<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const checkNewTrips = async () => {
      if (!session.user) return; // Don't poll if not logged in
      try {
        const trips = await tripsAPI.getTrips(
          undefined,
          session.user?.id,
          session.user?.agency_id
        );

        const currentIds = new Set<string>(
          trips.map((t: any) => String(t.id))
        );

        if (!isInitialized) {
          knownTripIds.current = currentIds;
          setIsInitialized(true);
          return;
        }

        trips.forEach((trip: any) => {
          const id = String(trip.id);
          if (!knownTripIds.current.has(id)) {
            showLocalNotification(
              'New Trip Assigned',
              `${trip.passenger_name || trip.company_name} • ${trip.pickup_location || trip.starting_point}`
            );
          }
        });

        knownTripIds.current = currentIds;

        // --- Logic to find the single "current" trip ---
        const activeTrips = trips.filter((t: any) => {
          return (
            t.status !== 'completed' &&
            t.is_active !== false &&
            t.driver_response !== 'declined'
          );
        });

        activeTrips.sort((a: any, b: any) => {
          const timeA = a.start_date && a.one_way_start_time ? new Date(`${a.start_date}T${a.one_way_start_time}`).getTime() : 0;
          const timeB = b.start_date && b.one_way_start_time ? new Date(`${b.start_date}T${b.one_way_start_time}`).getTime() : 0;
          return timeA - timeB;
        });

        let currentTripId: string | null = null;
        if (activeTrips.length > 0) {
          const earliestTrip = activeTrips[0];
          if (earliestTrip.start_date && earliestTrip.one_way_start_time) {
            const startTime = new Date(`${earliestTrip.start_date}T${earliestTrip.one_way_start_time}`).getTime();
            const now = new Date().getTime();
            const diffMinutes = (startTime - now) / (1000 * 60);

            // A trip is "current" if it's starting within 20 minutes or has already started.
            if (diffMinutes <= 20) {
              currentTripId = String(earliestTrip.id);
            }
          } else {
            currentTripId = String(earliestTrip.id);
          }
        }
        // --- End of "current" trip logic ---


        // Schedule/refresh reminders for ONLY the current trip
        const notificationTrips: TripNotification[] = trips
          .filter((t: any) => {
            // Only schedule notifications for the trip that is currently considered "current".
            return currentTripId !== null && String(t.id) === currentTripId;
          })
          .map((t: any) => ({
            tripId: t.id,
            passengerName: t.company_name ? `Company: ${t.company_name}` : 'Passenger',
            pickupLocation: t.starting_point || 'Unknown Start',
            startDate: t.start_date,
            endDate: t.end_date,
            startTime: t.one_way_start_time,
            isPending: t.driver_response !== 'accepted',
          }));

        await scheduleMultipleTripNotifications(notificationTrips);
      } catch (e) {
        console.log('Trip polling failed', e);
      }
    };

    checkNewTrips();
    const interval = setInterval(checkNewTrips, 60000);
    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  return (
    <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack initialRouteName="index">
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="screens/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="screens/trip-details" options={{ headerShown: false }} />
        <Stack.Screen name="screens/driver-details" options={{ headerShown: false }} />
        <Stack.Screen name="screens/trips" options={{ headerShown: false }} />
        <Stack.Screen name="screens/map" options={{ headerShown: false }} />
        <Stack.Screen name="screens/settings" options={{ headerShown: false }} />
        <Stack.Screen name="screens/users" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>

      <RootLayoutContent />

    </AppThemeProvider>
  );
}