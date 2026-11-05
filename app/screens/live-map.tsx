import { showCustomAlert } from '@/components/GlobalAlert';
import { activeSession, api, session, tripsAPI } from '@/services/api';
import {
  RouteDeviationDetector,
  calculateDistanceToRoute,
  calculateItineraryRoutes,
  distanceFromRouteMeters,
  notifyDeviation,
  calculateDistance,
  type LatLng,
  type RoutePoint,
} from '@/services/routeDeviation';
import {
  fetchDirections,
  searchPlacesAutocomplete,
  getPlaceDetails,
  searchNearbyPlaces,
  announceVoiceInstruction,
  getManeuverIcon,
  calculateBearing,
  type NavigationRoute,
  type NavigationStep,
  type PlaceResult,
  type RoutePreferences,
} from '@/services/googleNavigation';
import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapType,
} from 'react-native-maps';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.82;
const CARD_MARGIN = 10;

// Google Maps API Key
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyC3hcVreZORUipdbZryndAPXRj9a_-EEuU';

type NearbyCategory = 'gas_station' | 'hospital' | 'restaurant' | 'parking' | 'car_repair';

export default function LiveMapScreen() {
  const { tripId, leg, status: paramStatus } = useLocalSearchParams();

  // Core Trip & Passenger State
  const [trip, setTrip] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedPassenger, setFocusedPassenger] = useState<any>(null);
  const [showPassengerModal, setShowPassengerModal] = useState(false);
  const [selectedPassenger, setSelectedPassenger] = useState<any>(null);

  // Driver Location & Tracking
  const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
  const [vehicleHeading, setVehicleHeading] = useState<number>(0);
  const [gpsConnected, setGpsConnected] = useState(false);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Map Controls & Views
  const [mapType, setMapType] = useState<MapType>('standard');
  const [showMapTypeModal, setShowMapTypeModal] = useState(false);
  const [showsTraffic, setShowsTraffic] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [autoCenter, setAutoCenter] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(0.04);

  // Navigation & Directions State
  const [routes, setRoutes] = useState<NavigationRoute[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [routeCoordinates, setRouteCoordinates] = useState<RoutePoint[]>([]);
  const [originalRouteCoordinates, setOriginalRouteCoordinates] = useState<RoutePoint[]>([]);
  const [currentStep, setCurrentStep] = useState<NavigationStep | null>(null);
  const [nextStep, setNextStep] = useState<NavigationStep | null>(null);
  const [showStepsModal, setShowStepsModal] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const lastSpokenStepIdRef = useRef<string | null>(null);

  // Route Options (Avoid Tolls, Highways, Ferries)
  const [preferences, setPreferences] = useState<RoutePreferences>({
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false,
  });
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);

  // Places Search & Nearby Amenities
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPredictions, setSearchPredictions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [activeNearbyCategory, setActiveNearbyCategory] = useState<NearbyCategory | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const isSimulatingRef = useRef(false);

  // Route Deviation Detection State
  const deviationDetectorRef = useRef(new RouteDeviationDetector());
  const [isDeviating, setIsDeviating] = useState(false);
  const [deviationDistance, setDeviationDistance] = useState(0);
  const [isRerouting, setIsRerouting] = useState(false);
  const [showDeviationAlert, setShowDeviationAlert] = useState(false);

  // Map & Subscriptions Refs
  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const driverId = session.user?.id || 'cf6912d9-6617-482b-aacf-dd034c780185';
  const agencyId = session.user?.agency_id || '6e7cdb44-603c-46c4-a4ca-198334c34314';

  // Distance to end calculations
  const getDistanceToEndKm = (): number | null => {
    if (!driverLocation?.coords || trip?.dropoff_lat == null || trip?.dropoff_lng == null) {
      return null;
    }
    const dist = calculateDistance(
      driverLocation.coords.latitude,
      driverLocation.coords.longitude,
      trip.dropoff_lat,
      trip.dropoff_lng
    );
    return dist / 1000;
  };

  // Check if all passengers have been handled
  const allPassengersCompleted = () => {
    if (!passengers || passengers.length === 0) return true;
    if (leg === 'return') {
      return passengers.every((p) => p.dropoff === true || p.ispresent === false);
    }
    return passengers.every((p) => p.pickup === true || p.ispresent === false);
  };

  // Check if trip is accepted
  const isTripAccepted = () => {
    return (
      trip?.status === 'accepted' ||
      paramStatus === 'accepted' ||
      trip?.status === 'started' ||
      trip?.status === 'in_progress'
    );
  };

  // Current active route object
  const activeRoute = routes[activeRouteIndex] || null;

  // Initialize and load details
  useEffect(() => {
    loadTripDetails();
    startLocationTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      isSimulatingRef.current = false;
    };
  }, [tripId, leg]);

  // Recalculate route when preferences change
  useEffect(() => {
    if (trip && trip.pickup_lat && trip.dropoff_lat) {
      const startLat = driverLocation?.coords?.latitude || trip.pickup_lat;
      const startLng = driverLocation?.coords?.longitude || trip.pickup_lng;
      loadRoutes(startLat, startLng, trip.dropoff_lat, trip.dropoff_lng, passengers);
    }
  }, [preferences]);

  // Update navigation step & voice announcement on location update
  useEffect(() => {
    if (!driverLocation || !activeRoute || !activeRoute.steps || activeRoute.steps.length === 0) {
      return;
    }

    const dLat = driverLocation.coords.latitude;
    const dLng = driverLocation.coords.longitude;

    // Find nearest step along the route
    let nearestStep: NavigationStep | null = null;
    let minStepDist = Infinity;
    let stepIndex = 0;

    for (let idx = 0; idx < activeRoute.steps.length; idx++) {
      const step = activeRoute.steps[idx];
      const dist = calculateDistance(
        dLat,
        dLng,
        step.startLocation.latitude,
        step.startLocation.longitude
      );
      if (dist < minStepDist) {
        minStepDist = dist;
        nearestStep = step;
        stepIndex = idx;
      }
    }

    if (nearestStep) {
      setCurrentStep(nearestStep);
      setNextStep(activeRoute.steps[stepIndex + 1] || null);

      // Trigger voice navigation if instruction changed
      if (nearestStep.id !== lastSpokenStepIdRef.current) {
        lastSpokenStepIdRef.current = nearestStep.id;
        announceVoiceInstruction(nearestStep.cleanInstruction, isVoiceMuted);
      }
    }
  }, [driverLocation, activeRoute, isVoiceMuted]);

  // Fetch routes from Google Directions with alternatives and fallbacks
  const loadRoutes = async (
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    passList: any[]
  ) => {
    try {
      const remainingWaypoints = passList
        .filter((p) => {
          if (leg === 'return') return !p.dropoff && p.ispresent !== false;
          return !p.pickup && p.ispresent !== false;
        })
        .filter((p) => p.lat && p.lng)
        .map((p) => ({ latitude: p.lat, longitude: p.lng }));

      const origin = { latitude: startLat, longitude: startLng };
      const destination = { latitude: endLat, longitude: endLng };

      const computedRoutes = await fetchDirections(
        origin,
        destination,
        remainingWaypoints,
        GOOGLE_MAPS_API_KEY,
        preferences
      );

      if (computedRoutes.length > 0) {
        setRoutes(computedRoutes);
        setActiveRouteIndex(0);
        const primaryCoords = computedRoutes[0].coordinates;
        setRouteCoordinates(primaryCoords);

        if (originalRouteCoordinates.length === 0) {
          setOriginalRouteCoordinates(primaryCoords);
        }

        if (computedRoutes[0].steps.length > 0) {
          setCurrentStep(computedRoutes[0].steps[0]);
          setNextStep(computedRoutes[0].steps[1] || null);
        }
      }
    } catch (error) {
      console.warn('Failed to load navigation routes:', error);
    }
  };

  // Automatic reroute when off-route
  const handleAutomaticReroute = async (currentLat: number, currentLng: number) => {
    if (!trip || isRerouting) return;

    try {
      setIsRerouting(true);
      showCustomAlert('Rerouting', 'Recalculating Google route through remaining stops...');

      const remainingPassengers = passengers.filter((p) => {
        if (leg === 'return') return !p.dropoff && p.ispresent !== false;
        return !p.pickup && p.ispresent !== false;
      });

      const waypoints = remainingPassengers
        .filter((p) => p.lat && p.lng)
        .map((p) => ({ latitude: p.lat, longitude: p.lng }));

      const computedRoutes = await fetchDirections(
        { latitude: currentLat, longitude: currentLng },
        { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
        waypoints,
        GOOGLE_MAPS_API_KEY,
        preferences
      );

      if (computedRoutes.length > 0) {
        const newRoute = computedRoutes[0].coordinates;
        setRoutes(computedRoutes);
        setActiveRouteIndex(0);
        setOriginalRouteCoordinates([...routeCoordinates]);
        setRouteCoordinates(newRoute);

        deviationDetectorRef.current.markReroute();

        await notifyDeviation(String(tripId), driverId, api, {
          currentLat,
          currentLng,
          deviationDistance,
          originalRoute: originalRouteCoordinates,
          newRoute,
        });

        announceVoiceInstruction('Route recalculated. Continue forward.', isVoiceMuted);
      }
    } catch (error) {
      showCustomAlert('Rerouting', 'Using nearest path to remaining stops.');
    } finally {
      setIsRerouting(false);
    }
  };

  // Start continuous location tracking
  const startLocationTracking = async () => {
    if (!activeSession.location_id) {
      try {
        const storedId = await AsyncStorage.getItem('active_location_id');
        if (storedId) activeSession.location_id = parseInt(storedId, 10);
        const storedTripId = await AsyncStorage.getItem('active_trip_id');
        if (storedTripId) activeSession.trip_id = storedTripId;
        const storedLeg = await AsyncStorage.getItem('active_trip_leg');
        if (storedLeg === 'outbound' || storedLeg === 'return') {
          activeSession.leg = storedLeg;
        }
      } catch (e) {
        console.warn('Failed to load active_location_id', e);
      }
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Permission to access location was denied');
      return;
    }

    const currentLoc = await Location.getCurrentPositionAsync({});
    setDriverLocation(currentLoc);
    setGpsConnected(true);
    lastLocationRef.current = {
      lat: currentLoc.coords.latitude,
      lng: currentLoc.coords.longitude,
    };

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 3,
      },
      (loc) => {
        // Calculate vehicle bearing / heading
        if (lastLocationRef.current) {
          const bearing = calculateBearing(
            lastLocationRef.current.lat,
            lastLocationRef.current.lng,
            loc.coords.latitude,
            loc.coords.longitude
          );
          if (loc.coords.speed && loc.coords.speed > 1) {
            setVehicleHeading(bearing);
          } else if (loc.coords.heading != null && loc.coords.heading >= 0) {
            setVehicleHeading(loc.coords.heading);
          }
        }
        lastLocationRef.current = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };

        setDriverLocation(loc);

        // Auto-follow vehicle if enabled
        if (autoCenter && !isSimulatingRef.current) {
          mapRef.current?.animateCamera({
            center: {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            },
            pitch: 30,
            heading: loc.coords.heading || vehicleHeading,
          });
        }

        // Route deviation detection
        if (routeCoordinates.length > 0 && !isSimulatingRef.current) {
          const deviationStatus = deviationDetectorRef.current.checkDeviation(
            loc.coords.latitude,
            loc.coords.longitude,
            routeCoordinates,
            loc.coords.accuracy ?? undefined
          );

          setDeviationDistance(deviationStatus.distanceFromRoute);
          setIsDeviating(deviationStatus.isDeviating);

          if (deviationStatus.isDeviating && !deviationDetectorRef.current.isDeviationNotified()) {
            deviationDetectorRef.current.markDeviationNotified();
            setShowDeviationAlert(true);

            notifyDeviation(String(tripId), driverId, api, {
              currentLat: loc.coords.latitude,
              currentLng: loc.coords.longitude,
              deviationDistance: deviationStatus.distanceFromRoute,
              originalRoute:
                originalRouteCoordinates.length > 0
                  ? originalRouteCoordinates
                  : routeCoordinates,
            }).catch((e) => console.error('Failed to notify deviation:', e));
          }

          if (
            deviationStatus.isDeviating &&
            deviationDetectorRef.current.canReroute() &&
            !isRerouting &&
            trip
          ) {
            handleAutomaticReroute(loc.coords.latitude, loc.coords.longitude);
          }
        }

        // Push to backend
        if (activeSession && activeSession.location_id) {
          tripsAPI
            .updateLocation(activeSession.location_id, {
              driver_id: driverId,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy || undefined,
              speed: loc.coords.speed || undefined,
            })
            .catch((e) => console.log('Background location update silent fail', e));
        }
      }
    );
  };

  // Load trip details
  const loadTripDetails = async () => {
    try {
      setLoading(true);
      const trips = await tripsAPI.getTrips(undefined, driverId, agencyId);

      const formattedDbTrips = trips.map((ts: any) => {
        let passengerList: any[] = [];
        if (ts.route_point) {
          try {
            const points =
              typeof ts.route_point === 'string' ? JSON.parse(ts.route_point) : ts.route_point;
            if (Array.isArray(points) && points.length > 0) {
              passengerList = points.map((p: any) => ({
                ...p,
                id: p.passenger_id || p.id || Math.random().toString(),
                name: p.passenger_name || 'Unknown',
                phone: p.passenger_phone || 'N/A',
                address: p.address || p.pickup_address || ts.starting_point || 'Unknown address',
                lat: p.lat || p.pickup_lat || ts.starting_lat,
                lng: p.lng || p.pickup_lng || ts.starting_lng,
              }));
            }
          } catch (e) {}
        }

        if (passengerList.length === 0 && ts.passengers && Array.isArray(ts.passengers)) {
          passengerList = ts.passengers.map((p: any) => ({
            name: p.name || p.passenger_name || 'Unknown',
            phone: p.phone || p.passenger_phone || 'N/A',
            address: p.address || p.pickup_address || ts.starting_point || 'Unknown address',
            lat: p.lat || p.pickup_lat || ts.starting_lat,
            lng: p.lng || p.pickup_lng || ts.starting_lng,
          }));
        }

        return {
          id: ts.id,
          passengers: passengerList,
          pickup_location: ts.starting_point || 'Unknown Start',
          pickup_lat: ts.starting_lat,
          pickup_lng: ts.starting_lng,
          dropoff_location: ts.end_point || 'Unknown End',
          dropoff_lat: ts.end_lat,
          dropoff_lng: ts.end_lng,
          status: ts.status || 'pending',
        };
      });

      const mockTrips: any[] = [
        {
          id: 'mock-1',
          passengers: [
            {
              name: 'Aditi Sharma (Mock)',
              phone: '9876543210',
              address: 'Coimbatore Airport',
              lat: 11.03,
              lng: 77.04,
            },
          ],
          pickup_location: 'Coimbatore Airport, Coimbatore',
          pickup_lat: 11.03,
          pickup_lng: 77.04,
          dropoff_location: 'Gandhipuram Bus Stand, Coimbatore',
          dropoff_lat: 11.02,
          dropoff_lng: 76.97,
        },
      ];

      const allTrips = [...formattedDbTrips, ...mockTrips];
      const tripData = allTrips.find((t: any) => String(t.id) === String(tripId));

      if (tripData && paramStatus) {
        tripData.status = paramStatus;
      }

      if (tripData && leg === 'return') {
        const reversed = {
          ...tripData,
          pickup_location: tripData.dropoff_location,
          pickup_lat: tripData.dropoff_lat,
          pickup_lng: tripData.dropoff_lng,
          dropoff_location: tripData.pickup_location,
          dropoff_lat: tripData.pickup_lat,
          dropoff_lng: tripData.pickup_lng,
        };
        setTrip(reversed);
        setPassengers(tripData.passengers || []);
        if (reversed.pickup_lat && reversed.dropoff_lat) {
          loadRoutes(
            reversed.pickup_lat,
            reversed.pickup_lng,
            reversed.dropoff_lat,
            reversed.dropoff_lng,
            tripData.passengers || []
          );
        }
      } else if (tripData) {
        setTrip(tripData);
        setPassengers(tripData.passengers || []);
        if (tripData.pickup_lat && tripData.dropoff_lat) {
          loadRoutes(
            tripData.pickup_lat,
            tripData.pickup_lng,
            tripData.dropoff_lat,
            tripData.dropoff_lng,
            tripData.passengers || []
          );
        }
      }
    } catch (error) {
      console.error('Error loading trip details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Save updated passenger state
  const savePassengerState = (updatedPassengers: any[]) => {
    const cleanUpdated = updatedPassengers.map((p) => ({
      passenger_id: p.passenger_id || p.id,
      passenger_name: p.passenger_name || p.name || 'Unknown',
      passenger_phone: p.passenger_phone || p.phone || 'N/A',
      timestamp: p.timestamp || new Date().toISOString(),
      pickup: p.pickup || false,
      pickup_point: p.pickup_point || p.address || 'Unknown address',
      pickup_lat: p.pickup_lat || p.lat,
      pickup_lng: p.pickup_lng || p.lng,
      ispresent: p.ispresent !== false,
      dropoff: p.dropoff || false,
    }));

    if (activeSession && activeSession.location_id) {
      tripsAPI
        .updateLocationRoutePoints({
          trip_id: tripId as string,
          location_id: activeSession.location_id,
          driver_id: driverId,
          agency_id: agencyId,
          route_point: cleanUpdated,
        })
        .catch((e) => console.log('Failed to sync route points', e));
    }
  };

  // Complete Trip handler
  const handleComplete = async () => {
    try {
      let originalId = String(tripId).replace('-outbound', '').replace('-return', '');

      if (String(tripId).startsWith('mock-')) {
        showCustomAlert('Success (Mock)', 'Mock trip completed locally');
        router.replace('/(tabs)/dashboard');
        return;
      }

      let locationId = activeSession.location_id || 0;
      if (locationId === 0) {
        const locIdStr = await AsyncStorage.getItem('active_location_id');
        if (locIdStr) locationId = parseInt(locIdStr, 10);
      }

      if (locationId === 0) {
        showCustomAlert('Error', 'Could not find active location tracking for this trip.');
        return;
      }

      const tripLeg = leg === 'return' ? 'return' : 'outbound';
      await tripsAPI.completeTrip(driverId, locationId, originalId, tripLeg);

      await AsyncStorage.removeItem('active_location_id');
      await AsyncStorage.removeItem('active_trip_id');
      await AsyncStorage.removeItem('active_trip_leg');
      activeSession.location_id = null;
      activeSession.trip_id = null;
      activeSession.leg = null;

      showCustomAlert('Trip Completed', 'All stops successfully completed.');
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      showCustomAlert('Error', 'Failed to complete trip');
    }
  };

  // Map Camera Controls
  const centerOnDriver = () => {
    if (!driverLocation?.coords) return;
    setAutoCenter(true);
    mapRef.current?.animateCamera(
      {
        center: {
          latitude: driverLocation.coords.latitude,
          longitude: driverLocation.coords.longitude,
        },
        pitch: 45,
        heading: vehicleHeading,
        zoom: 17,
      },
      { duration: 800 }
    );
  };

  const centerOnAll = () => {
    setAutoCenter(false);
    if (!trip || !trip.pickup_lat) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
        { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
        ...(driverLocation
          ? [
              {
                latitude: driverLocation.coords.latitude,
                longitude: driverLocation.coords.longitude,
              },
            ]
          : []),
        ...passengers.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      ],
      {
        edgePadding: { top: 120, right: 60, bottom: isFullScreen ? 40 : 260, left: 60 },
        animated: true,
      }
    );
  };

  const zoomIn = () => {
    setZoomLevel((prev) => Math.max(0.005, prev / 1.8));
    if (driverLocation?.coords) {
      mapRef.current?.animateToRegion(
        {
          latitude: driverLocation.coords.latitude,
          longitude: driverLocation.coords.longitude,
          latitudeDelta: zoomLevel / 1.8,
          longitudeDelta: zoomLevel / 1.8,
        },
        400
      );
    }
  };

  const zoomOut = () => {
    setZoomLevel((prev) => Math.min(0.2, prev * 1.8));
    if (driverLocation?.coords) {
      mapRef.current?.animateToRegion(
        {
          latitude: driverLocation.coords.latitude,
          longitude: driverLocation.coords.longitude,
          latitudeDelta: zoomLevel * 1.8,
          longitudeDelta: zoomLevel * 1.8,
        },
        400
      );
    }
  };

  const resetNorth = () => {
    mapRef.current?.animateCamera({ heading: 0 }, { duration: 600 });
  };

  // Places Search
  const handleSearchTextChange = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length >= 2) {
      setIsSearching(true);
      const center = driverLocation?.coords
        ? { latitude: driverLocation.coords.latitude, longitude: driverLocation.coords.longitude }
        : undefined;
      const results = await searchPlacesAutocomplete(text, GOOGLE_MAPS_API_KEY, center);
      setSearchPredictions(results);
      setIsSearching(false);
    } else {
      setSearchPredictions([]);
    }
  };

  const handleSelectPrediction = async (prediction: any) => {
    setShowSearchModal(false);
    setSearchPredictions([]);
    setSearchQuery(prediction.mainText);

    const details = await getPlaceDetails(prediction.placeId, GOOGLE_MAPS_API_KEY);
    if (details) {
      const place: PlaceResult = {
        id: prediction.placeId,
        name: details.name,
        address: details.address,
        latitude: details.latitude,
        longitude: details.longitude,
        type: 'searched',
        distanceMeters: driverLocation?.coords
          ? Math.round(
              calculateDistance(
                driverLocation.coords.latitude,
                driverLocation.coords.longitude,
                details.latitude,
                details.longitude
              )
            )
          : undefined,
      };
      setSelectedPlace(place);
      mapRef.current?.animateCamera({
        center: { latitude: details.latitude, longitude: details.longitude },
        zoom: 16,
      });
    }
  };

  // Nearby Amenities Search
  const handleSelectNearbyCategory = async (cat: NearbyCategory) => {
    if (activeNearbyCategory === cat) {
      setActiveNearbyCategory(null);
      setNearbyPlaces([]);
      return;
    }

    setActiveNearbyCategory(cat);
    setLoadingNearby(true);
    const center = driverLocation?.coords
      ? { latitude: driverLocation.coords.latitude, longitude: driverLocation.coords.longitude }
      : { latitude: trip.pickup_lat, longitude: trip.pickup_lng };

    const places = await searchNearbyPlaces(cat, center, GOOGLE_MAPS_API_KEY);
    setNearbyPlaces(places);
    setLoadingNearby(false);

    if (places.length > 0) {
      mapRef.current?.fitToCoordinates(
        places.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        { edgePadding: { top: 120, right: 60, bottom: 200, left: 60 }, animated: true }
      );
    }
  };

  if (loading || !trip) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Live Google Navigation...</Text>
      </View>
    );
  }

  const distanceToEndKm = getDistanceToEndKm();
  const hasDestinationCoords =
    trip?.dropoff_lat != null &&
    trip?.dropoff_lng != null &&
    trip.dropoff_lat !== 0 &&
    trip.dropoff_lng !== 0;
  const isWithinOneKm = hasDestinationCoords
    ? distanceToEndKm !== null && distanceToEndKm <= 1.0
    : true;

  const canEndTrip =
    trip?.status !== 'completed' &&
    isTripAccepted() &&
    isWithinOneKm &&
    allPassengersCompleted();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Main Map Component */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        mapType={mapType}
        showsTraffic={showsTraffic}
        showsBuildings={true}
        showsIndoors={true}
        showsCompass={true}
        showsMyLocationButton={false}
        initialRegion={{
          latitude: (trip.pickup_lat + trip.dropoff_lat) / 2,
          longitude: (trip.pickup_lng + trip.dropoff_lng) / 2,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onPanDrag={() => {
          if (autoCenter) setAutoCenter(false);
        }}
      >
        {/* Alternative Routes Polylines (clickable) */}
        {routes.map((rt, idx) => {
          if (idx === activeRouteIndex) return null;
          return (
            <Polyline
              key={rt.id}
              coordinates={rt.coordinates}
              strokeColor="#94a3b8"
              strokeWidth={5}
              lineDashPattern={[2, 3]}
              tappable={true}
              onPress={() => {
                setActiveRouteIndex(idx);
                setRouteCoordinates(rt.coordinates);
                Haptics.selectionAsync();
              }}
            />
          );
        })}

        {/* Original Route (shown when rerouted) */}
        {originalRouteCoordinates.length > 0 &&
          originalRouteCoordinates.length !== routeCoordinates.length && (
            <Polyline
              coordinates={originalRouteCoordinates}
              strokeColor="#64748b"
              strokeWidth={3}
              lineDashPattern={[6, 6]}
            />
          )}

        {/* Active Route Polyline */}
        <Polyline
          coordinates={
            routeCoordinates.length > 0
              ? routeCoordinates
              : [
                  { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
                  { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
                ]
          }
          strokeColor={isDeviating ? '#f59e0b' : '#3b82f6'}
          strokeWidth={6}
          zIndex={10}
        />

        {/* Live Driver / Vehicle Marker with Direction Heading */}
        {driverLocation && (
          <Marker
            coordinate={{
              latitude: driverLocation.coords.latitude,
              longitude: driverLocation.coords.longitude,
            }}
            title="My Vehicle"
            zIndex={200}
            flat={true}
            rotation={vehicleHeading}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarkerOuter}>
              <View style={styles.driverMarkerGlow} />
              <View style={styles.driverMarkerInner}>
                <FontAwesome5 name="location-arrow" size={16} color="#ffffff" />
              </View>
            </View>
          </Marker>
        )}

        {/* Start Point Marker */}
        <Marker
          coordinate={{ latitude: trip.pickup_lat, longitude: trip.pickup_lng }}
          title="Trip Start"
          description={trip.pickup_location}
        >
          <View style={[styles.endpointMarker, { backgroundColor: 'rgba(34, 197, 94, 0.25)' }]}>
            <View style={[styles.endpointMarkerInner, { backgroundColor: '#22c55e' }]}>
              <Text style={styles.endpointText}>A</Text>
            </View>
          </View>
        </Marker>

        {/* Dropoff Destination Marker */}
        <Marker
          coordinate={{ latitude: trip.dropoff_lat, longitude: trip.dropoff_lng }}
          title="Final Destination"
          description={trip.dropoff_location}
        >
          <View style={[styles.endpointMarker, { backgroundColor: 'rgba(239, 68, 68, 0.25)' }]}>
            <View style={[styles.endpointMarkerInner, { backgroundColor: '#ef4444' }]}>
              <Text style={styles.endpointText}>B</Text>
            </View>
          </View>
        </Marker>

        {/* Passenger Stop Markers */}
        {passengers.map((passenger, index) => {
          if (
            focusedPassenger &&
            focusedPassenger.id !== passenger.id &&
            focusedPassenger.name !== passenger.name
          ) {
            return null;
          }
          if (passenger.lat && passenger.lng) {
            let markerColor = '#38bdf8';
            let markerIcon = 'user';

            if (passenger.dropoff) {
              markerColor = '#6366f1';
              markerIcon = 'user-check';
            } else if (passenger.pickup) {
              markerColor = '#10b981';
              markerIcon = 'user-check';
            } else if (passenger.ispresent === false) {
              markerColor = '#ef4444';
              markerIcon = 'user-times';
            }

            return (
              <Marker
                key={`passenger-${index}`}
                coordinate={{ latitude: passenger.lat, longitude: passenger.lng }}
                title={`${passenger.name} (Stop ${index + 1})`}
                description={passenger.address}
                zIndex={50}
              >
                <View
                  style={[
                    styles.passengerMarkerContainer,
                    { backgroundColor: markerColor + '33' },
                  ]}
                >
                  <View
                    style={[styles.passengerMarkerInner, { backgroundColor: markerColor }]}
                  >
                    <FontAwesome5 name={markerIcon} size={13} color="#ffffff" />
                  </View>
                </View>
              </Marker>
            );
          }
          return null;
        })}

        {/* Nearby Amenities Markers */}
        {nearbyPlaces.map((place) => {
          let catIcon = 'map-marker-alt';
          let catColor = '#6366f1';
          if (place.type === 'gas_station') {
            catIcon = 'gas-pump';
            catColor = '#f59e0b';
          } else if (place.type === 'hospital') {
            catIcon = 'hospital';
            catColor = '#ef4444';
          } else if (place.type === 'restaurant') {
            catIcon = 'utensils';
            catColor = '#10b981';
          } else if (place.type === 'parking') {
            catIcon = 'parking';
            catColor = '#38bdf8';
          } else if (place.type === 'car_repair') {
            catIcon = 'wrench';
            catColor = '#8b5cf6';
          }

          return (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              title={place.name}
              description={place.address}
              onPress={() => setSelectedPlace(place)}
            >
              <View style={[styles.nearbyMarker, { backgroundColor: catColor }]}>
                <FontAwesome5 name={catIcon} size={12} color="#ffffff" />
              </View>
            </Marker>
          );
        })}

        {/* Searched Place Marker */}
        {selectedPlace && selectedPlace.type === 'searched' && (
          <Marker
            coordinate={{
              latitude: selectedPlace.latitude,
              longitude: selectedPlace.longitude,
            }}
            title={selectedPlace.name}
            description={selectedPlace.address}
          >
            <View style={styles.searchedPlaceMarker}>
              <FontAwesome5 name="map-pin" size={16} color="#ffffff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* TOP NAVIGATION HUD BANNER (Google Maps Style) */}
      {!isFullScreen && (
        <View style={styles.topHudContainer}>
          {/* Header Bar */}
          <View style={styles.topHeaderBar}>
            <TouchableOpacity style={styles.iconCircleBtn} onPress={() => router.back()}>
              <FontAwesome5 name="arrow-left" size={16} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.searchBarInputBox}
              onPress={() => setShowSearchModal(true)}
            >
              <FontAwesome5 name="search" size={14} color="#94a3b8" />
              <Text style={styles.searchBarPlaceholder} numberOfLines={1}>
                {searchQuery || 'Search Google Places & amenities...'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconCircleBtn, isVoiceMuted && styles.iconCircleBtnMuted]}
              onPress={() => {
                const muted = !isVoiceMuted;
                setIsVoiceMuted(muted);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (!muted && currentStep) {
                  announceVoiceInstruction(currentStep.cleanInstruction, false);
                }
              }}
            >
              <FontAwesome5
                name={isVoiceMuted ? 'volume-mute' : 'volume-up'}
                size={16}
                color={isVoiceMuted ? '#94a3b8' : '#10b981'}
              />
            </TouchableOpacity>
          </View>

          {/* Turn-by-Turn Instruction Card */}
          {currentStep && (
            <TouchableOpacity
              style={styles.turnInstructionCard}
              activeOpacity={0.9}
              onPress={() => setShowStepsModal(true)}
            >
              <View style={styles.turnManeuverBadge}>
                <FontAwesome5
                  name={getManeuverIcon(currentStep.maneuver)}
                  size={24}
                  color="#ffffff"
                />
              </View>

              <View style={styles.turnTextContainer}>
                <Text style={styles.turnDistanceText}>{currentStep.distanceText}</Text>
                <Text style={styles.turnInstructionText} numberOfLines={2}>
                  {currentStep.cleanInstruction}
                </Text>
                {nextStep && (
                  <Text style={styles.turnNextPreviewText} numberOfLines={1}>
                    Then {nextStep.cleanInstruction}
                  </Text>
                )}
              </View>

              <View style={styles.turnActionCol}>
                <View style={styles.stepsBadge}>
                  <Text style={styles.stepsBadgeText}>Steps</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Quick Nearby Category Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearbyPillsRow}
          >
            {[
              { id: 'gas_station', label: 'Petrol', icon: 'gas-pump' },
              { id: 'hospital', label: 'Hospital', icon: 'hospital' },
              { id: 'restaurant', label: 'Food', icon: 'utensils' },
              { id: 'parking', label: 'Parking', icon: 'parking' },
              { id: 'car_repair', label: 'Mechanic', icon: 'wrench' },
            ].map((cat) => {
              const active = activeNearbyCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.nearbyFilterPill, active && styles.nearbyFilterPillActive]}
                  onPress={() => handleSelectNearbyCategory(cat.id as NearbyCategory)}
                >
                  <FontAwesome5
                    name={cat.icon}
                    size={11}
                    color={active ? '#ffffff' : '#94a3b8'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.nearbyFilterPillText,
                      active && styles.nearbyFilterPillTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* FLOATING MAP CONTROLS (Right Side Column) */}
      <View style={[styles.floatingControlsColumn, isFullScreen && { top: 60 }]}>
        {/* Full-screen Toggle */}
        <TouchableOpacity
          style={styles.floatToolBtn}
          onPress={() => {
            setIsFullScreen(!isFullScreen);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <FontAwesome5
            name={isFullScreen ? 'compress-arrows-alt' : 'expand-arrows-alt'}
            size={16}
            color="#ffffff"
          />
        </TouchableOpacity>

        {/* Map Type Layers */}
        <TouchableOpacity
          style={styles.floatToolBtn}
          onPress={() => setShowMapTypeModal(true)}
        >
          <FontAwesome5 name="layer-group" size={16} color="#ffffff" />
        </TouchableOpacity>

        {/* Traffic Layer Toggle */}
        <TouchableOpacity
          style={[styles.floatToolBtn, showsTraffic && styles.floatToolBtnActive]}
          onPress={() => {
            setShowsTraffic(!showsTraffic);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <FontAwesome5
            name="traffic-light"
            size={16}
            color={showsTraffic ? '#10b981' : '#ffffff'}
          />
        </TouchableOpacity>

        {/* Route Options (Avoid Tolls, Highways) */}
        <TouchableOpacity
          style={styles.floatToolBtn}
          onPress={() => setShowPreferencesModal(true)}
        >
          <FontAwesome5 name="sliders-h" size={15} color="#ffffff" />
        </TouchableOpacity>

        {/* Compass / Reset North */}
        <TouchableOpacity style={styles.floatToolBtn} onPress={resetNorth}>
          <FontAwesome5 name="compass" size={16} color="#38bdf8" />
        </TouchableOpacity>

        {/* Zoom In (+) */}
        <TouchableOpacity style={styles.floatToolBtn} onPress={zoomIn}>
          <FontAwesome5 name="plus" size={16} color="#ffffff" />
        </TouchableOpacity>

        {/* Zoom Out (-) */}
        <TouchableOpacity style={styles.floatToolBtn} onPress={zoomOut}>
          <FontAwesome5 name="minus" size={16} color="#ffffff" />
        </TouchableOpacity>

        {/* Auto-Center / Re-center Vehicle */}
        <TouchableOpacity
          style={[styles.floatToolBtn, autoCenter && styles.floatToolBtnAutoCenter]}
          onPress={centerOnDriver}
        >
          <FontAwesome5
            name="location-arrow"
            size={16}
            color={autoCenter ? '#ffffff' : '#38bdf8'}
          />
        </TouchableOpacity>

        {/* Fit All Points */}
        <TouchableOpacity style={styles.floatToolBtn} onPress={centerOnAll}>
          <FontAwesome5 name="crosshairs" size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* SELECTED NEARBY PLACE PREVIEW POPUP */}
      {selectedPlace && (
        <View style={styles.placePreviewCard}>
          <View style={styles.placePreviewHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.placePreviewName}>{selectedPlace.name}</Text>
              <Text style={styles.placePreviewAddress} numberOfLines={1}>
                {selectedPlace.address}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedPlace(null)}>
              <FontAwesome5 name="times-circle" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <View style={styles.placePreviewFooter}>
            {selectedPlace.rating && (
              <View style={styles.ratingBadge}>
                <FontAwesome5 name="star" size={11} color="#f59e0b" solid />
                <Text style={styles.ratingText}>{selectedPlace.rating.toFixed(1)}</Text>
              </View>
            )}
            {selectedPlace.distanceMeters && (
              <Text style={styles.placeDistanceText}>
                {(selectedPlace.distanceMeters / 1000).toFixed(1)} km away
              </Text>
            )}
            <TouchableOpacity
              style={styles.placeRouteBtn}
              onPress={() => {
                if (driverLocation?.coords) {
                  loadRoutes(
                    driverLocation.coords.latitude,
                    driverLocation.coords.longitude,
                    selectedPlace.latitude,
                    selectedPlace.longitude,
                    []
                  );
                  setSelectedPlace(null);
                  showCustomAlert('Routing', `Navigating to ${selectedPlace.name}`);
                }
              }}
            >
              <FontAwesome5
                name="directions"
                size={13}
                color="#ffffff"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.placeRouteBtnText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* BOTTOM SHEET & PASSENGER CAROUSEL (TMS FUNCTIONALITY PRESERVED) */}
      {!isFullScreen && (
        <View style={styles.bottomSheet}>
          {/* Route Selector Chips (Fastest vs Alternatives) */}
          {routes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.routeSelectorRow}
            >
              {routes.map((rt, idx) => {
                const isSelected = idx === activeRouteIndex;
                return (
                  <TouchableOpacity
                    key={rt.id}
                    style={[styles.routeChip, isSelected && styles.routeChipSelected]}
                    onPress={() => {
                      setActiveRouteIndex(idx);
                      setRouteCoordinates(rt.coordinates);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text
                      style={[
                        styles.routeChipTitle,
                        isSelected && styles.routeChipTitleSelected,
                      ]}
                    >
                      {idx === 0 ? 'Fastest' : `Alt ${idx}`}
                    </Text>
                    <Text
                      style={[
                        styles.routeChipSubtitle,
                        isSelected && styles.routeChipSubtitleSelected,
                      ]}
                    >
                      {rt.durationText} • {rt.distanceText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Passenger Cards Carousel */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContainer}
            snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
            decelerationRate="fast"
          >
            {/* Passenger Stops */}
            {passengers.map((passenger, index) => (
              <View key={passenger.id || index} style={styles.cardWrapper}>
                <TouchableOpacity
                  style={[
                    styles.passengerCard,
                    focusedPassenger &&
                      (focusedPassenger.id === passenger.id ||
                        focusedPassenger.name === passenger.name) &&
                      styles.activeCard,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setFocusedPassenger(passenger);
                    if (passenger.lat && passenger.lng) {
                      mapRef.current?.animateToRegion({
                        latitude: passenger.lat,
                        longitude: passenger.lng,
                        latitudeDelta: 0.015,
                        longitudeDelta: 0.015,
                      });
                    }
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: passenger.dropoff
                            ? 'rgba(99, 102, 241, 0.2)'
                            : passenger.pickup
                            ? 'rgba(16, 185, 129, 0.2)'
                            : passenger.ispresent === false
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(56, 189, 248, 0.2)',
                        },
                      ]}
                    >
                      <FontAwesome5
                        name={
                          passenger.dropoff
                            ? 'user-check'
                            : passenger.pickup
                            ? 'user-check'
                            : passenger.ispresent === false
                            ? 'user-times'
                            : 'user'
                        }
                        size={16}
                        color={
                          passenger.dropoff
                            ? '#6366f1'
                            : passenger.pickup
                            ? '#10b981'
                            : passenger.ispresent === false
                            ? '#ef4444'
                            : '#38bdf8'
                        }
                      />
                    </View>
                    <View style={styles.passengerInfo}>
                      <Text style={styles.passengerName} numberOfLines={1}>
                        {passenger.name}{' '}
                        {passengers.length > 1 ? `(Stop ${index + 1})` : ''}
                      </Text>
                      <View style={styles.phoneRow}>
                        <FontAwesome5 name="phone" size={10} color="#38bdf8" />
                        <Text style={styles.passengerPhone}>{passenger.phone}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardDetails}>
                    <Text style={styles.locationLabel}>
                      {leg === 'return' ? 'DROPOFF POINT' : 'PICKUP POINT'}
                    </Text>
                    <Text style={styles.locationText} numberOfLines={2}>
                      {passenger.address}
                    </Text>

                    {/* Action Buttons */}
                    {isTripAccepted() && trip?.status !== 'completed' && (
                      <View style={styles.actionButtonsRow}>
                        {leg === 'outbound' ? (
                          <>
                            <TouchableOpacity
                              style={[
                                styles.actionBtn,
                                passenger.pickup && styles.actionBtnActivePickedUp,
                              ]}
                              onPress={() => {
                                const val = !passenger.pickup;
                                const updated = passengers.map((p) =>
                                  p.id === passenger.id
                                    ? { ...p, pickup: val, ispresent: true }
                                    : p
                                );
                                setPassengers(updated);
                                savePassengerState(updated);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              }}
                            >
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  passenger.pickup && styles.actionBtnTextActive,
                                ]}
                              >
                                {passenger.pickup ? '✓ Picked Up' : 'Pick Up'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.actionBtn,
                                passenger.ispresent === false &&
                                  styles.actionBtnActiveAbsent,
                              ]}
                              onPress={() => {
                                const val = passenger.ispresent !== false;
                                const updated = passengers.map((p) =>
                                  p.id === passenger.id
                                    ? { ...p, ispresent: !val, pickup: false }
                                    : p
                                );
                                setPassengers(updated);
                                savePassengerState(updated);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              }}
                            >
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  passenger.ispresent === false &&
                                    styles.actionBtnTextActive,
                                ]}
                              >
                                {passenger.ispresent === false ? '✗ Absent' : 'Absent'}
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.actionBtn,
                              passenger.dropoff && styles.actionBtnActiveDroppedOff,
                              { flex: 1 },
                            ]}
                            onPress={() => {
                              const val = !passenger.dropoff;
                              const updated = passengers.map((p) =>
                                p.id === passenger.id ? { ...p, dropoff: val } : p
                              );
                              setPassengers(updated);
                              savePassengerState(updated);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                          >
                            <Text
                              style={[
                                styles.actionBtnText,
                                passenger.dropoff && styles.actionBtnTextActive,
                              ]}
                            >
                              {passenger.dropoff ? '✓ Dropped Off' : 'Drop Off'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            ))}

            {/* Final Destination / End Trip Card */}
            <View style={styles.cardWrapper}>
              <TouchableOpacity
                style={[
                  styles.passengerCard,
                  !focusedPassenger && styles.activeCard,
                  canEndTrip && styles.canEndTripCard,
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  setFocusedPassenger(null);
                  if (trip.dropoff_lat && trip.dropoff_lng) {
                    mapRef.current?.animateToRegion({
                      latitude: trip.dropoff_lat,
                      longitude: trip.dropoff_lng,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    });
                  } else {
                    centerOnAll();
                  }
                }}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: canEndTrip
                          ? 'rgba(34, 197, 94, 0.25)'
                          : 'rgba(99, 102, 241, 0.2)',
                      },
                    ]}
                  >
                    <FontAwesome5
                      name={canEndTrip ? 'flag-checkered' : 'map-marker-alt'}
                      size={18}
                      color={canEndTrip ? '#22c55e' : '#6366f1'}
                    />
                  </View>
                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerName}>
                      {passengers.length > 0
                        ? 'Final Destination (End)'
                        : 'Trip Destination'}
                    </Text>
                    <Text style={styles.passengerPhone}>
                      {passengers.length > 0
                        ? `${
                            passengers.filter((p) =>
                              leg === 'return'
                                ? p.dropoff || p.ispresent === false
                                : p.pickup || p.ispresent === false
                            ).length
                          }/${passengers.length} Stops Completed`
                        : activeRoute?.durationText || 'Calculating ETA...'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardDetails}>
                  <Text style={styles.locationLabel}>DROPOFF DESTINATION</Text>
                  <Text style={styles.locationText} numberOfLines={1}>
                    {trip.dropoff_location}
                  </Text>

                  {distanceToEndKm !== null && (
                    <View style={styles.distanceBadge}>
                      <FontAwesome5 name="location-arrow" size={10} color="#818cf8" />
                      <Text style={styles.distanceBadgeText}>
                        {distanceToEndKm <= 1.0
                          ? `Within 1 km (${(distanceToEndKm * 1000).toFixed(0)}m away)`
                          : `${distanceToEndKm.toFixed(1)} km to destination`}
                      </Text>
                    </View>
                  )}

                  {canEndTrip ? (
                    <TouchableOpacity
                      style={styles.completeTripBtn}
                      onPress={handleComplete}
                    >
                      <FontAwesome5
                        name="check-circle"
                        size={15}
                        color="#ffffff"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.completeTripBtnText}>Complete & End Trip</Text>
                    </TouchableOpacity>
                  ) : (
                    trip?.status !== 'completed' &&
                    isTripAccepted() && (
                      <View style={styles.hintTextContainer}>
                        <Text style={styles.hintText}>
                          {!allPassengersCompleted()
                            ? '⚠️ Complete all stops before ending trip'
                            : !isWithinOneKm
                            ? `End button appears within 1 km (${
                                distanceToEndKm !== null
                                  ? `${distanceToEndKm.toFixed(1)} km away`
                                  : 'calculating...'
                              })`
                            : 'Trip ready to end'}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      {/* PLACES AUTOCOMPLETE SEARCH MODAL */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <SafeAreaView style={styles.searchModalContainer}>
          <View style={styles.searchModalHeader}>
            <TouchableOpacity
              style={styles.searchModalBackBtn}
              onPress={() => setShowSearchModal(false)}
            >
              <FontAwesome5 name="arrow-left" size={18} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.searchModalInputRow}>
              <FontAwesome5 name="search" size={14} color="#94a3b8" />
              <TextInput
                style={styles.searchModalInput}
                placeholder="Search addresses, places, points of interest..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={handleSearchTextChange}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <FontAwesome5 name="times-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {isSearching && (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.searchingText}>Searching Google Places...</Text>
            </View>
          )}

          <ScrollView style={styles.predictionsList}>
            {searchPredictions.map((pred, i) => (
              <TouchableOpacity
                key={pred.placeId || i}
                style={styles.predictionItem}
                onPress={() => handleSelectPrediction(pred)}
              >
                <View style={styles.predictionIconBox}>
                  <FontAwesome5 name="map-marker-alt" size={14} color="#38bdf8" />
                </View>
                <View style={styles.predictionTextBox}>
                  <Text style={styles.predictionMainText}>{pred.mainText}</Text>
                  {pred.secondaryText ? (
                    <Text style={styles.predictionSubText}>{pred.secondaryText}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MAP TYPE SELECTOR MODAL */}
      <Modal
        visible={showMapTypeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMapTypeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowMapTypeModal(false)}
        >
          <View style={styles.mapTypeCard}>
            <Text style={styles.modalTitle}>Map Layers</Text>
            <View style={styles.mapTypesGrid}>
              {[
                { id: 'standard', label: 'Default', icon: 'map' },
                { id: 'satellite', label: 'Satellite', icon: 'satellite' },
                { id: 'terrain', label: 'Terrain', icon: 'mountain' },
                { id: 'hybrid', label: 'Hybrid', icon: 'globe-americas' },
              ].map((m) => {
                const isSelected = mapType === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.mapTypeOption,
                      isSelected && styles.mapTypeOptionSelected,
                    ]}
                    onPress={() => {
                      setMapType(m.id as MapType);
                      setShowMapTypeModal(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <FontAwesome5
                      name={m.icon}
                      size={20}
                      color={isSelected ? '#3b82f6' : '#94a3b8'}
                    />
                    <Text
                      style={[
                        styles.mapTypeLabel,
                        isSelected && styles.mapTypeLabelSelected,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ROUTE PREFERENCES MODAL (Avoid Tolls, Highways, Ferries) */}
      <Modal
        visible={showPreferencesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPreferencesModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPreferencesModal(false)}
        >
          <View style={styles.preferencesCard}>
            <Text style={styles.modalTitle}>Route Options</Text>
            <View style={styles.prefSwitchRow}>
              <Text style={styles.prefSwitchLabel}>Avoid Toll Roads</Text>
              <Switch
                value={preferences.avoidTolls}
                onValueChange={(val) =>
                  setPreferences((prev) => ({ ...prev, avoidTolls: val }))
                }
                trackColor={{ false: '#334155', true: '#3b82f6' }}
              />
            </View>
            <View style={styles.prefSwitchRow}>
              <Text style={styles.prefSwitchLabel}>Avoid Highways</Text>
              <Switch
                value={preferences.avoidHighways}
                onValueChange={(val) =>
                  setPreferences((prev) => ({ ...prev, avoidHighways: val }))
                }
                trackColor={{ false: '#334155', true: '#3b82f6' }}
              />
            </View>
            <View style={styles.prefSwitchRow}>
              <Text style={styles.prefSwitchLabel}>Avoid Ferries</Text>
              <Switch
                value={preferences.avoidFerries}
                onValueChange={(val) =>
                  setPreferences((prev) => ({ ...prev, avoidFerries: val }))
                }
                trackColor={{ false: '#334155', true: '#3b82f6' }}
              />
            </View>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowPreferencesModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Apply Options</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* TURN-BY-TURN STEPS LIST MODAL */}
      <Modal
        visible={showStepsModal}
        animationType="slide"
        onRequestClose={() => setShowStepsModal(false)}
      >
        <SafeAreaView style={styles.stepsModalContainer}>
          <View style={styles.stepsModalHeader}>
            <Text style={styles.stepsModalTitle}>Directions & Turn-by-Turn</Text>
            <TouchableOpacity
              style={styles.stepsModalClose}
              onPress={() => setShowStepsModal(false)}
            >
              <FontAwesome5 name="times" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {activeRoute && (
            <View style={styles.stepsRouteSummary}>
              <Text style={styles.stepsSummaryDuration}>{activeRoute.durationText}</Text>
              <Text style={styles.stepsSummaryDistance}>
                ({activeRoute.distanceText}) • {activeRoute.summary}
              </Text>
            </View>
          )}

          <ScrollView style={styles.stepsScroll}>
            {activeRoute?.steps.map((step, idx) => (
              <View key={step.id || idx} style={styles.stepItemRow}>
                <View style={styles.stepIconCircle}>
                  <FontAwesome5
                    name={getManeuverIcon(step.maneuver)}
                    size={15}
                    color="#38bdf8"
                  />
                </View>
                <View style={styles.stepTextContainer}>
                  <Text style={styles.stepInstructionText}>
                    {step.cleanInstruction}
                  </Text>
                  <Text style={styles.stepDistSubText}>{step.distanceText}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ROUTE DEVIATION ALERT MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showDeviationAlert}
        onRequestClose={() => setShowDeviationAlert(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deviationCard}>
            <FontAwesome5 name="exclamation-triangle" size={32} color="#f59e0b" />
            <Text style={styles.deviationTitle}>Route Deviation Detected</Text>
            <Text style={styles.deviationText}>
              You have deviated {deviationDistance.toFixed(0)} meters from the assigned
              route.
            </Text>
            {isRerouting ? (
              <View style={styles.reroutingBadge}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.reroutingBadgeText}>
                  Recalculating Google route...
                </Text>
              </View>
            ) : (
              <Text style={styles.deviationSubtext}>
                Automatic rerouting will guide you to remaining passenger stops.
              </Text>
            )}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowDeviationAlert(false)}
            >
              <Text style={styles.modalCloseBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },

  // TOP NAVIGATION HUD
  topHudContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 28,
    left: 12,
    right: 12,
    zIndex: 100,
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  iconCircleBtnMuted: {
    backgroundColor: 'rgba(30, 41, 59, 0.88)',
  },
  searchBarInputBox: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  searchBarPlaceholder: {
    color: '#94a3b8',
    fontSize: 13,
    flex: 1,
  },

  // Turn-by-Turn Card
  turnInstructionCard: {
    backgroundColor: '#0f766e',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  turnManeuverBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnTextContainer: {
    flex: 1,
  },
  turnDistanceText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  turnInstructionText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  turnNextPreviewText: {
    color: '#ccfbf1',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  turnActionCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Nearby Filter Pills Row
  nearbyPillsRow: {
    paddingVertical: 8,
    gap: 6,
  },
  nearbyFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  nearbyFilterPillActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#60a5fa',
  },
  nearbyFilterPillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  nearbyFilterPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // FLOATING CONTROLS COLUMN (Right Side)
  floatingControlsColumn: {
    position: 'absolute',
    right: 12,
    top: Platform.OS === 'ios' ? 180 : 160,
    gap: 8,
    zIndex: 90,
  },
  floatToolBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  floatToolBtnActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  floatToolBtnAutoCenter: {
    backgroundColor: '#3b82f6',
    borderColor: '#60a5fa',
  },

  // Driver Vehicle Marker
  driverMarkerOuter: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarkerGlow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
  },
  driverMarkerInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    shadowColor: '#2563eb',
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },

  // Endpoints & Markers
  endpointMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endpointMarkerInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  endpointText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  passengerMarkerContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerMarkerInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  nearbyMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  searchedPlaceMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },

  // Nearby Place Preview Card
  placePreviewCard: {
    position: 'absolute',
    bottom: 240,
    left: 16,
    right: 16,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 95,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  placePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  placePreviewName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  placePreviewAddress: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  placePreviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  placeDistanceText: {
    color: '#cbd5e1',
    fontSize: 12,
    flex: 1,
  },
  placeRouteBtn: {
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  placeRouteBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // BOTTOM SHEET & CAROUSEL
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    zIndex: 80,
  },
  routeSelectorRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  routeChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  routeChipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#60a5fa',
  },
  routeChipTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  routeChipTitleSelected: {
    color: '#ffffff',
  },
  routeChipSubtitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  routeChipSubtitleSelected: {
    color: '#dbeafe',
  },

  carouselContainer: {
    paddingHorizontal: width * 0.09 - CARD_MARGIN,
    paddingTop: 4,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
  },
  passengerCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.96)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  activeCard: {
    borderColor: '#6366f1',
    borderWidth: 1.5,
  },
  canEndTripCard: {
    borderColor: '#22c55e',
    borderWidth: 1.8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 3,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerPhone: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 6,
    fontWeight: '600',
  },
  cardDetails: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 10,
    borderRadius: 12,
  },
  locationLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 3,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  distanceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#a5b4fc',
  },
  completeTripBtn: {
    marginTop: 12,
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  completeTripBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  hintTextContainer: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 6,
  },
  hintText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  actionBtnText: {
    color: '#818cf8',
    fontWeight: '700',
    fontSize: 11,
  },
  actionBtnTextActive: {
    color: '#ffffff',
  },
  actionBtnActivePickedUp: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  actionBtnActiveAbsent: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  actionBtnActiveDroppedOff: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },

  // MODALS
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
  },
  modalCloseBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Map Type Modal
  mapTypeCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  mapTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mapTypeOption: {
    width: '47%',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  mapTypeOptionSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3b82f6',
  },
  mapTypeLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  mapTypeLabelSelected: {
    color: '#3b82f6',
    fontWeight: '700',
  },

  // Preferences Modal
  preferencesCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  prefSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  prefSwitchLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },

  // Steps Modal
  stepsModalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  stepsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  stepsModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  stepsModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsRouteSummary: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepsSummaryDuration: {
    color: '#10b981',
    fontSize: 22,
    fontWeight: '800',
  },
  stepsSummaryDistance: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  stepsScroll: {
    flex: 1,
    padding: 16,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  stepIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTextContainer: {
    flex: 1,
  },
  stepInstructionText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  stepDistSubText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },

  // Places Search Modal
  searchModalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  searchModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchModalBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchModalInputRow: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchModalInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  searchingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  predictionsList: {
    flex: 1,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  predictionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  predictionTextBox: {
    flex: 1,
  },
  predictionMainText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  predictionSubText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },

  // Deviation Alert Modal
  deviationCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  deviationTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 12,
    textAlign: 'center',
  },
  deviationText: {
    fontSize: 13,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 8,
  },
  deviationSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
  },
  reroutingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reroutingBadgeText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '600',
  },
});
