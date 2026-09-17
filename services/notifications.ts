import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api, tripsAPI } from './api';

const getMockNotificationsModule = () => ({
  setNotificationHandler: () => {},
  setNotificationCategoryAsync: async () => {},
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' }),
  setNotificationChannelAsync: async () => {},
  getExpoPushTokenAsync: async () => ({ data: '' }),
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  scheduleNotificationAsync: async () => '',
  getAllScheduledNotificationsAsync: async () => [],
  cancelScheduledNotificationAsync: async () => {},
  SchedulableTriggerInputTypes: { DATE: 1 },
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, NONE: 0, UNPROJECTED: -1000 }
});

// Safely require expo-notifications, suppressing the console.error thrown by SDK 53+ in Expo Go on Android
const getNotificationsModule = () => {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    console.log('Skipping expo-notifications import in Expo Go on Android to prevent crash.');
    return getMockNotificationsModule();
  }

  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  try {
    // Intercept/suppress the specific expo-notifications warning during package initialization
    console.error = (...args: any[]) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('expo-notifications: Android Push notifications')) {
        return;
      }
      originalConsoleError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('expo-notifications: Android Push notifications')) {
        return;
      }
      originalConsoleWarn.apply(console, args);
    };

    return require('expo-notifications');
  } catch (error: any) {
    console.log('[expo-notifications info]: Caught initialization error:', error?.message);
    return getMockNotificationsModule();
  } finally {
    // Always restore the original console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
};

export const Notifications = getNotificationsModule() as typeof import('expo-notifications');

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface TripNotification {
  tripId: string |number;
  passengerName: string;
  pickupLocation: string;

  startDate: string;
  endDate: string;
  startTime: string; // Example: "10:00:00"

  isPending?: boolean;
}

// Set up interactive notification categories
Notifications.setNotificationCategoryAsync('pending_trip', [
  {
    identifier: 'accept_trip',
    buttonTitle: 'Accept',
    options: { opensAppToForeground: false },
  },
  {
    identifier: 'decline_trip',
    buttonTitle: 'Decline',
    options: { isDestructive: true, opensAppToForeground: false },
  },
]);
// Request notification permissions
export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    console.log('Notifications require a physical device');
    return false;
  }

  // @ts-ignore: Mismatched expo/expo-notifications version typing
  const { granted: existingGranted } = await Notifications.getPermissionsAsync();
  let finalGranted = existingGranted;

  if (!existingGranted) {
    // @ts-ignore: Mismatched expo/expo-notifications version typing
    const { granted } = await Notifications.requestPermissionsAsync();
    finalGranted = granted;
  }

  if (!finalGranted) {
    console.log('Failed to get notification permissions');
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return true;
};

// Register for push notifications and get the push token
export const registerForPushNotificationsAsync = async (): Promise<string | null> => {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    console.log('Push notifications (remote) are not supported in Expo Go on Android. Use a development build instead.');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  // Get the push token
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: '2a4fea61-aba5-4a5f-9fee-3401aeb6bec0',
  });

  console.log('Push token:', token.data);
  return token.data;
};

// Send push token to backend
export const sendPushTokenToBackend = async (token: string, userId: string) => {
  try {
    const response = await api.post('/push-token', {
      token,
      user_id: userId,
      platform: Platform.OS,
    });
    
    if (response.status === 200 || response.status === 201) {
      console.log('Push token registered successfully with backend');
      return true;
    } else {
      console.error('Failed to register push token with backend');
      return false;
    }
  } catch (error) {
    console.error('Error registering push token:', error);
    return false;
  }
};

// Initialize push notifications (call this on app startup)
export const initializePushNotifications = async (userId: string) => {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      await sendPushTokenToBackend(token, userId);
    }
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
};

// Handle incoming push notifications
export const setupNotificationListeners = () => {
  // Listen for notifications received while app is foregrounded
  const subscription = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);
  });

  // Listen for user tapping on notification or acting on a button
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(async response => {
    console.log('Notification response:', response);
    const data = response.notification.request.content.data || {};
    const actionId = response.actionIdentifier;
    
    // Handle navigation or actions based on notification data
    if (data.tripId) {
      const driverId = 'cf6912d9-6617-482b-aacf-dd034c780185'; // fallback active driver

      if (actionId === 'accept_trip') {
        console.log(`Accepting trip ${data.tripId} via notification action`);
        try {
          await tripsAPI.acceptTrip(data.tripId as string, driverId);
        } catch (e) { console.error('Failed to accept trip', e); }
      } else if (actionId === 'decline_trip') {
        console.log(`Declining trip ${data.tripId} via notification action`);
        try {
          await tripsAPI.rejectTrip(data.tripId as string, driverId);
        } catch (e) { console.error('Failed to decline trip', e); }
      } else {
        // Just tapped the notification
        // router.push(`/screens/trip-details?tripId=${data.tripId}`);
      }
    }
  });

  return { subscription, responseSubscription };
};

// Helper to schedule local notifications when running in Expo Go on Android
const scheduleLocalTripReminders = async (trip: TripNotification) => {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await cancelTripNotifications(trip.tripId);

  const now = new Date();

  const startDate = new Date(trip.startDate);
  const endDate = trip.endDate ? new Date(trip.endDate) : new Date(trip.startDate);

const [hour, minute, second] = trip.startTime
  .split(":")
  .map(Number);

const intervals = [15, 10, 5];

for (
  let current = new Date(startDate);
  current <= endDate;
  current.setDate(current.getDate() + 1)
) {
  const tripDateTime = new Date(current);

  tripDateTime.setHours(hour);
  tripDateTime.setMinutes(minute);
  tripDateTime.setSeconds(second || 0);

  if (tripDateTime <= now) {
    continue;
  }

  for (const minutes of intervals) {
    const reminderTime = new Date(
      tripDateTime.getTime() - minutes * 60 * 1000
    );

    if (reminderTime <= now) {
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: `trip-${trip.tripId}-${current.toISOString().split("T")[0]}-${minutes}`,
      content: {
        title: trip.isPending
          ? `Action Required - Trip in ${minutes}m`
          : `Trip Reminder - ${minutes} minutes`,
        body: trip.isPending
          ? `Please ACCEPT or DECLINE your trip for ${trip.passengerName}.`
          : `Trip for ${trip.passengerName} starts in ${minutes} minutes.`,
        data: {
          tripId: trip.tripId,
        },
        categoryIdentifier: trip.isPending
          ? "pending_trip"
          : undefined,
        sound: true,
        vibrate: trip.isPending && minutes <= 5 
          ? [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] 
          : undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      } as any,
    });

    console.log(
      `Scheduled ${minutes} min reminder for ${tripDateTime.toDateString()}`
    );
  }
}

  
};

// Send an immediate local notification (used for instant alerts in Expo Go)
export const showLocalNotification = async (title: string, body: string) => {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null, // Send immediately
    });
    console.log(`[Notification Fallback] Dispatched immediate local notification: "${title}"`);
  }
};

export const scheduleCertificationExpiryNotification = async (driverId: string | number, expiryDateStr: string) => {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  try {
    const expiryDate = new Date(expiryDateStr.replace(' ', 'T'));
    if (isNaN(expiryDate.getTime())) return;
    
    const now = new Date();
    const daysToNotify = [5, 2, 1];
    
    // First, clear any previously scheduled certification notifications for this driver
    for (const days of [5, 2, 1]) {
      try {
        await Notifications.cancelScheduledNotificationAsync(`cert-expiry-${driverId}-${days}`);
      } catch(e) {}
    }

    let scheduledAny = false;
    
    for (const days of daysToNotify) {
      const targetDate = new Date(expiryDate.getTime() - (days * 24 * 60 * 60 * 1000));
      targetDate.setHours(9, 0, 0, 0); // Alert at 9 AM
      
      if (targetDate > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `cert-expiry-${driverId}-${days}`,
          content: {
            title: 'Action Required: Certification Expiring Soon',
            body: `Your driving certification will expire in ${days} ${days === 1 ? 'day' : 'days'}. Please renew it to avoid service interruption.`,
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetDate,
          } as any,
        });
        console.log(`Scheduled certification expiry notification for ${days} days out (${targetDate.toISOString()})`);
        scheduledAny = true;
      }
    }
    
    // If no future schedules were made, check if we are currently within the urgent window (<= 5 days) but before expiration
    if (!scheduledAny && expiryDate > now) {
      const msDiff = expiryDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 5) {
        // Show immediate local notification on app load
        await showLocalNotification(
          'Action Required: Certification Expiring Soon', 
          `Your driving certification will expire in ${daysDiff} ${daysDiff === 1 ? 'day' : 'days'}. Please renew it immediately.`
        );
      }
    }
  } catch (error) {
    console.error('Failed to schedule certification notification', error);
  }
};

// Cancel local notifications for a specific trip in Expo Go, or let backend manage it in dev builds
export const cancelTripNotifications = async (tripId: string | number) => {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of scheduled) {
        if (notification.identifier.includes(`trip-${tripId}`)) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
          console.log(`[Notification Fallback] Cancelled local notification: ${notification.identifier}`);
        }
      }
    } catch (e) {
      console.error('Error cancelling local notification:', e);
    }
  } else {
    console.log(`[Push Notification Info] Backend handles scheduling/cancellation for trip: ${tripId}`);
  }
};

// Schedule local notifications for multiple trips in Expo Go, or let backend manage it in dev builds
export const scheduleMultipleTripNotifications = async (trips: TripNotification[]) => {
  console.log(`[Notification Fallback] Scheduling local reminders for ${trips.length} trips in notifiction.tsx...`);
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    console.log('[Notification Fallback] Scheduling local reminders for Expo Go on Android...');
    for (const trip of trips) {
      await scheduleLocalTripReminders(trip);
    }
  } else {
    console.log(`[Push Notification Info] Backend handles scheduling for ${trips.length} trips`);
  }
};
