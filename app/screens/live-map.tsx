import { activeSession, api, session, tripsAPI } from '@/services/api';
import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.8;
const CARD_MARGIN = 12;

export default function LiveMapScreen() {
  const { tripId, leg, status: paramStatus } = useLocalSearchParams();
  const [trip, setTrip] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);
  const [focusedPassenger, setFocusedPassenger] = useState<any>(null);
  const [showPassengerModal, setShowPassengerModal] = useState(false);
  const [selectedPassenger, setSelectedPassenger] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const isSimulatingRef = useRef(false);
  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const driverId = session.user?.id || 'cf6912d9-6617-482b-aacf-dd034c780185';
  const agencyId = session.user?.agency_id || '6e7cdb44-603c-46c4-a4ca-198334c34314';

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

  const startLocationTracking = async () => {
    // If activeSession is missing, try to restore from AsyncStorage
    if (!activeSession.location_id) {
      try {
        const storedId = await AsyncStorage.getItem('active_location_id');
        if (storedId) {
          activeSession.location_id = parseInt(storedId, 10);
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

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (loc) => {
        setDriverLocation(loc);

        // Push the updated location to the backend if we have an active location session
        if (activeSession && activeSession.location_id) {
          tripsAPI.updateLocation(activeSession.location_id, {
            driver_id: driverId,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy || undefined,
            speed: loc.coords.speed || undefined
          }).catch(e => console.log('Background location update failed silently', e));
        }
      }
    );
  };

  const fetchRoute = async (startLat: number, startLng: number, endLat: number, endLng: number, passList: any[] = []) => {
    try {
      const coords = [`${startLng},${startLat}`];

      // Add all passengers as waypoints so the route actually goes to them
      passList.forEach(p => {
        if (p.lat && p.lng) {
          coords.push(`${p.lng},${p.lat}`);
        }
      });

      coords.push(`${endLng},${endLat}`);
      const coordString = coords.join(';');

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const coordinates = data.routes[0].geometry.coordinates.map((coord: any) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        setRouteCoordinates(coordinates);
      } else {
        setRouteCoordinates([
          { latitude: startLat, longitude: startLng },
          { latitude: endLat, longitude: endLng },
        ]);
      }
    } catch (error) {
      setRouteCoordinates([
        { latitude: startLat, longitude: startLng },
        { latitude: endLat, longitude: endLng },
      ]);
    }
  };

  const loadTripDetails = async () => {
    try {
      setLoading(true);
      const trips = await tripsAPI.getTrips(undefined, driverId, agencyId);

      const formattedDbTrips = trips.map((ts: any) => {
        let passengerList: any[] = [];

        if (ts.route_point) {
          try {
            const points = typeof ts.route_point === 'string' ? JSON.parse(ts.route_point) : ts.route_point;
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
          } catch (e) { }
        }

        if (passengerList.length === 0) {
          if (ts.passengers && Array.isArray(ts.passengers)) {
            passengerList = ts.passengers.map((p: any) => ({
              name: p.name || p.passenger_name || 'Unknown',
              phone: p.phone || p.passenger_phone || 'N/A',
              address: p.address || p.pickup_address || ts.starting_point || 'Unknown address',
              lat: p.lat || p.pickup_lat || ts.starting_lat,
              lng: p.lng || p.pickup_lng || ts.starting_lng,
            }));
          }
          if (passengerList.length === 0 && ts.passenger_list) {
            try {
              const passengerData = typeof ts.passenger_list === 'string' ? JSON.parse(ts.passenger_list) : ts.passenger_list;
              if (Array.isArray(passengerData)) {
                passengerList = passengerData.map((p: any) => ({
                  name: p.name || p.passenger_name || 'Unknown',
                  phone: p.phone || p.passenger_phone || 'N/A',
                  address: p.address || p.pickup_address || ts.starting_point || 'Unknown address',
                  lat: p.lat || p.pickup_lat || ts.starting_lat,
                  lng: p.lng || p.pickup_lng || ts.starting_lng,
                }));
              }
            } catch (e) { }
          }
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
          source: 'postgres'
        };
      });

      const mockTrips: any[] = [
        {
          id: 'mock-1',
          passengers: [{ name: 'Aditi Sharma (Mock)', phone: '9876543210', address: 'Coimbatore Airport', lat: 11.03, lng: 77.04 }],
          pickup_location: 'Coimbatore Airport, Coimbatore',
          pickup_lat: 11.03,
          pickup_lng: 77.04,
          dropoff_location: 'Gandhipuram Bus Stand, Coimbatore',
          dropoff_lat: 11.02,
          dropoff_lng: 76.97,
        }
      ];

      const allTrips = [...formattedDbTrips, ...mockTrips];
      const tripData = allTrips.find((t: any) => String(t.id) === String(tripId));

      // Use paramStatus if passed, otherwise fallback to tripData.status
      if (tripData && paramStatus) {
        tripData.status = paramStatus;
      }

      if (tripData && tripData.status === 'completed') {
        try {
          const locRes = await api.get('/mobile/locations', { params: { trip_id: tripId, driver_id: driverId } });
          if (locRes.data && locRes.data.length > 0) {
            // Sort to get the latest
            const latestLoc = locRes.data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            if (latestLoc.route_point) {
              const parsed = typeof latestLoc.route_point === 'string' ? JSON.parse(latestLoc.route_point) : latestLoc.route_point;
              if (Array.isArray(parsed) && parsed.length > 0) {
                // Safely update passenger list with final status
                tripData.passengers = (tripData.passengers || []).map((p: any) => {
                  const pId = String(p.id || p.passenger_id);
                  const match = parsed.find((mp: any) => String(mp.passenger_id || mp.id) === pId || mp.passenger_name === p.name);
                  if (match) {
                    return { ...p, ispresent: match.ispresent, pickup: match.pickup, dropoff: match.dropoff };
                  }
                  return p;
                });
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch completed location data", e);
        }
      }

      if (tripData && leg === 'return') {
        setTrip({
          ...tripData,
          pickup_location: tripData.dropoff_location,
          pickup_lat: tripData.dropoff_lat,
          pickup_lng: tripData.dropoff_lng,
          dropoff_location: tripData.pickup_location,
          dropoff_lat: tripData.pickup_lat,
          dropoff_lng: tripData.pickup_lng,
        });
        setPassengers(tripData.passengers || []);
        if (tripData.dropoff_lat && tripData.dropoff_lng && tripData.pickup_lat && tripData.pickup_lng) {
          fetchRoute(tripData.dropoff_lat, tripData.dropoff_lng, tripData.pickup_lat, tripData.pickup_lng, tripData.passengers || []);
          // Make sure car marker is visible immediately
          setDriverLocation(prev => prev || {
            coords: { latitude: tripData.dropoff_lat, longitude: tripData.dropoff_lng, altitude: null, accuracy: 5, altitudeAccuracy: null, heading: null, speed: 0 },
            timestamp: Date.now()
          });
        }
      } else if (tripData) {
        setTrip(tripData);
        setPassengers(tripData.passengers || []);
        if (tripData.pickup_lat && tripData.pickup_lng && tripData.dropoff_lat && tripData.dropoff_lng) {
          fetchRoute(tripData.pickup_lat, tripData.pickup_lng, tripData.dropoff_lat, tripData.dropoff_lng, tripData.passengers || []);
          // Make sure car marker is visible immediately
          setDriverLocation(prev => prev || {
            coords: { latitude: tripData.pickup_lat, longitude: tripData.pickup_lng, altitude: null, accuracy: 5, altitudeAccuracy: null, heading: null, speed: 0 },
            timestamp: Date.now()
          });
        }
      }
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const centerOnCoordinate = (lat: number, lng: number) => {
    mapRef.current?.animateToRegion({
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 1000);
  };

  const centerOnAll = () => {
    if (!trip || !trip.pickup_lat) return;
    mapRef.current?.fitToCoordinates([
      { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
      { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
      ...(driverLocation ? [{ latitude: driverLocation.coords.latitude, longitude: driverLocation.coords.longitude }] : []),
      ...passengers.map(p => ({ latitude: p.lat, longitude: p.lng }))
    ], { edgePadding: { top: 100, right: 50, bottom: 250, left: 50 }, animated: true });
  };

  const handlePassengerSelect = (passenger: any) => {
    setFocusedPassenger(passenger);
    if (passenger && passenger.lat && passenger.lng) {
      centerOnCoordinate(passenger.lat, passenger.lng);
    } else {
      centerOnAll();
    }
  };

  const toggleSimulation = async () => {
    if (isSimulating) {
      isSimulatingRef.current = false;
      setIsSimulating(false);
    } else {
      if (routeCoordinates.length === 0) {
        Alert.alert("No Route", "Please wait for the route to load before simulating.");
        return;
      }

      if (!activeSession || !activeSession.location_id) {
        try {
          // Attempt to find the existing active location ID from the backend
          const allLocsRes = await api.get('/mobile/locations/all');
          const activeLoc = allLocsRes.data.find(
            (loc: any) => String(loc.trip_id) === String(tripId) && loc.is_active === true && String(loc.driver_id) === String(driverId)
          );

          if (activeLoc && activeLoc.id) {
            console.log("Restored location_id from backend:", activeLoc.id);
            if (!activeSession) {
              Object.assign(activeSession, { location_id: activeLoc.id });
            } else {
              activeSession.location_id = activeLoc.id;
            }
          } else {
            // Location doesn't exist, they actually need to start the trip
            Alert.alert(
              "Location Session Missing",
              "The car will move on screen, but it won't save to the database because no trip has been 'Started' to create a location record. Go back to Dashboard and click 'Start Trip' first!"
            );
            return;
          }
        } catch (e) {
          console.warn("Failed to fetch location_id", e);
          return;
        }
      }

      setIsSimulating(true);
      isSimulatingRef.current = true;
      let i = 0;
      let visitedPassengers = new Set();

      const runSimulation = async () => {
        while (isSimulatingRef.current && i < routeCoordinates.length) {
          const coord = routeCoordinates[i];

          // Mock a location object
          const mockLoc: Location.LocationObject = {
            coords: {
              latitude: coord.latitude,
              longitude: coord.longitude,
              altitude: null,
              accuracy: 5,
              altitudeAccuracy: null,
              heading: null,
              speed: 15,
            },
            timestamp: Date.now(),
          };

          setDriverLocation(mockLoc);

          // Manually push to backend since we bypassed the Location.watchPositionAsync callback
          if (activeSession && activeSession.location_id) {
            tripsAPI.updateLocation(activeSession.location_id, {
              driver_id: driverId,
              latitude: coord.latitude,
              longitude: coord.longitude,
              accuracy: 5,
              speed: 15
            }).then(res => console.log(`Sim sync success: lat ${coord.latitude}`))
              .catch(e => console.log('Simulation sync failed', e));
          } else {
            console.log("Sim sync skipped: activeSession.location_id is null");
          }

          // Check if we reached a passenger (~30 meter radius)
          let isNearPassenger = false;
          for (const p of passengers) {
            if (p.id && !visitedPassengers.has(p.id) && p.lat && p.lng && Math.abs(p.lat - coord.latitude) < 0.0003 && Math.abs(p.lng - coord.longitude) < 0.0003) {
              isNearPassenger = true;
              visitedPassengers.add(p.id);
              break;
            }
          }

          if (isNearPassenger) {
            console.log("Arrived at passenger! Waiting 30 seconds...");
            for (let w = 0; w < 30; w++) {
              if (!isSimulatingRef.current) break;
              await new Promise(res => setTimeout(res, 1000));
            }
            i += 10; // skip a few points to prevent repeatedly triggering at same spot
          } else {
            await new Promise(res => setTimeout(res, 1000));
            i += 3; // Step size (skip 2 points each second to drive reasonably fast)
          }
        }

        setIsSimulating(false);
        isSimulatingRef.current = false;
      };

      runSimulation();
    }
  };

  const savePassengerState = (updatedPassengers: any[]) => {
    const cleanUpdated = updatedPassengers.map(p => ({
      passenger_id: p.passenger_id || p.id,
      passenger_name: p.passenger_name || p.name || 'Unknown',
      passenger_phone: p.passenger_phone || p.phone || 'N/A',
      timestamp: p.timestamp || new Date().toISOString(),
      pickup: p.pickup || false,
      pickup_point: p.pickup_point || p.address || 'Unknown address',
      pickup_lat: p.pickup_lat || p.lat,
      pickup_lng: p.pickup_lng || p.lng,
      ispresent: p.ispresent !== false,
      dropoff: p.dropoff || false
    }));

    // Update DriverLocation Table (if location session is active)
    if (activeSession && activeSession.location_id) {
      tripsAPI.updateLocationRoutePoints({
        trip_id: tripId as string,
        location_id: activeSession.location_id,
        driver_id: driverId,
        agency_id: agencyId,
        route_point: cleanUpdated
      }).catch(e => console.log('Failed to sync route points to driver location', e));
    } else {
      console.warn("Cannot update route points: activeSession.location_id is missing");
    }
  };

  const handleComplete = async () => {
    try {
      let originalId = String(tripId);
      if (originalId.endsWith('-outbound')) {
        originalId = originalId.replace('-outbound', '');
      } else if (originalId.endsWith('-return')) {
        originalId = originalId.replace('-return', '');
      }

      if (String(tripId).startsWith('mock-')) {
        Alert.alert('Success (Mock)', 'Mock trip completed locally');
        router.replace('/(tabs)/dashboard');
        return;
      }

      let locationId = activeSession.location_id || 0;
      if (locationId === 0) {
        try {
          const locIdStr = await AsyncStorage.getItem('active_location_id');
          if (locIdStr) locationId = parseInt(locIdStr, 10);
        } catch (storageErr) {
          console.warn("AsyncStorage unavailable");
        }
      }

      if (locationId === 0) {
        try {
          const allLocationsRes = await api.get('/mobile/locations/all');
          const allLocations = allLocationsRes.data;
          const activeLoc = allLocations.find((loc: any) => String(loc.trip_id) === originalId && loc.is_active === true);
          if (activeLoc && activeLoc.id) {
            locationId = activeLoc.id;
          }
        } catch (fetchErr) { }
      }

      if (locationId === 0) {
        Alert.alert('Error', 'Could not find active location tracking for this trip.');
        return;
      }

      const tripLeg = leg === 'return' ? 'return' : 'outbound';
      await tripsAPI.completeTrip(driverId, locationId, originalId, tripLeg);

      try {
        await AsyncStorage.removeItem('active_location_id');
      } catch (e) { }
      activeSession.location_id = null;

      Alert.alert('Success', 'Trip completed successfully');
      router.replace('/(tabs)/dashboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to complete trip');
    }
  };

  if (loading || !trip) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Live Map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: (trip.pickup_lat + trip.dropoff_lat) / 2,
          longitude: (trip.pickup_lng + trip.dropoff_lng) / 2,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onMapReady={centerOnAll}
      >
        {/* Route Line */}
        <Polyline
          coordinates={routeCoordinates.length > 0 ? routeCoordinates : [
            { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
            { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
          ]}
          strokeColor="#6366f1"
          strokeWidth={4}
        />

        {/* Driver Live Location */}
        {driverLocation && (
          <Marker
            coordinate={{
              latitude: driverLocation.coords.latitude,
              longitude: driverLocation.coords.longitude,
            }}
            title="My Vehicle"
            zIndex={100}
          >
            <View style={styles.driverMarkerContainer}>
              <View style={styles.driverMarkerInner}>
                <FontAwesome5 name="car-side" size={16} color="#ffffff" />
              </View>
            </View>
          </Marker>
        )}

        {/* Start Point */}
        <Marker
          coordinate={{
            latitude: trip.pickup_lat,
            longitude: trip.pickup_lng,
          }}
          title="Start Point"
          description={trip.pickup_location}
        >
          <View style={[styles.endpointMarker, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}>
            <View style={[styles.endpointMarkerInner, { backgroundColor: '#22c55e' }]}>
              <Text style={styles.endpointText}>A</Text>
            </View>
          </View>
        </Marker>

        {/* End Point */}
        <Marker
          coordinate={{
            latitude: trip.dropoff_lat,
            longitude: trip.dropoff_lng,
          }}
          title="End Point"
          description={trip.dropoff_location}
        >
          <View style={[styles.endpointMarker, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
            <View style={[styles.endpointMarkerInner, { backgroundColor: '#ef4444' }]}>
              <Text style={styles.endpointText}>B</Text>
            </View>
          </View>
        </Marker>

        {/* Passengers */}
        {passengers.length > 0 && passengers.map((passenger, index) => {
          if (focusedPassenger && focusedPassenger.id !== passenger.id && focusedPassenger.name !== passenger.name) {
            return null; // hide other passengers if one is focused
          }
          if (passenger.lat && passenger.lng) {
            let markerColor = "#38bdf8"; // default present
            let markerIcon = "user";

            if (passenger.dropoff) {
              markerColor = "#6366f1";
              markerIcon = "user-check";
            } else if (passenger.pickup) {
              markerColor = "#10b981";
              markerIcon = "user-check";
            } else if (passenger.ispresent === false) {
              markerColor = "#ef4444";
              markerIcon = "user-times";
            }

            return (
              <Marker
                key={index}
                coordinate={{ latitude: passenger.lat, longitude: passenger.lng }}
                title={passenger.name}
                description={passenger.address}
                zIndex={50}
              >
                <View style={[styles.passengerMarkerContainer, { backgroundColor: markerColor + '33' }]}>
                  <View style={[styles.passengerMarkerInner, { backgroundColor: markerColor }]}>
                    <FontAwesome5 name={markerIcon} size={14} color="#ffffff" />
                  </View>
                </View>
              </Marker>
            );
          }
          return null;
        })}
      </MapView>

      {/* Header */}
      <View style={styles.headerControls}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={20} color="#f8fafc" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Live Route</Text>
          <Text style={styles.headerSubtitle}>{leg === 'return' ? 'Return Leg' : 'Outbound Leg'}</Text>
        </View>

        {trip?.status !== 'completed' && (
          <TouchableOpacity
            style={[styles.simulateButton, { backgroundColor: isSimulating ? '#ef4444' : '#10b981' }]}
            onPress={toggleSimulation}
          >
            <FontAwesome5 name={isSimulating ? "stop" : "play"} size={14} color="#fff" />
            <Text style={styles.simulateButtonText}>{isSimulating ? "Stop" : "Simulate"}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.centerButton} onPress={centerOnAll}>
          <FontAwesome5 name="crosshairs" size={20} color="#f8fafc" />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSheet}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContainer}
          snapToInterval={CARD_WIDTH + (CARD_MARGIN * 2)}
          decelerationRate="fast"
        >
          {/* "All Passengers" Summary Card */}
          <View style={styles.cardWrapper}>
            <TouchableOpacity
              style={[styles.passengerCard, !focusedPassenger && styles.activeCard]}
              activeOpacity={0.8}
              onPress={() => handlePassengerSelect(null)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <FontAwesome5 name="users" size={20} color="#6366f1" />
                </View>
                <View style={styles.passengerInfo}>
                  <Text style={styles.passengerName}>All Passengers ({passengers.length})</Text>
                  <Text style={styles.passengerPhone}>Tap to view all on map</Text>
                </View>
              </View>
              <View style={styles.cardDetails}>
                <Text style={styles.locationLabel}>TRIP ROUTE</Text>
                <Text style={styles.locationText} numberOfLines={1}>{trip.pickup_location}</Text>
                <FontAwesome5 name="arrow-down" size={10} color="#64748b" style={{ marginVertical: 4 }} />
                <Text style={styles.locationText} numberOfLines={1}>{trip.dropoff_location}</Text>

                {trip?.status !== 'completed' && (
                  <TouchableOpacity
                    style={styles.completeTripBtn}
                    onPress={handleComplete}
                  >
                    <Text style={styles.completeTripBtnText}>End</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Individual Passenger Cards */}
          {passengers.map((passenger, index) => (
            <View key={index} style={styles.cardWrapper}>
              <TouchableOpacity
                style={[
                  styles.passengerCard,
                  (focusedPassenger && (focusedPassenger.id === passenger.id || focusedPassenger.name === passenger.name)) && styles.activeCard
                ]}
                activeOpacity={0.8}
                onPress={() => handlePassengerSelect(passenger)}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.avatar, {
                    backgroundColor: passenger.dropoff ? '#6366f120' :
                      passenger.pickup ? '#10b98120' :
                        passenger.ispresent === false ? '#ef444420' : '#38bdf820'
                  }]}>
                    <FontAwesome5
                      name={passenger.dropoff ? 'user-check' : passenger.pickup ? 'user-check' : passenger.ispresent === false ? 'user-times' : 'user'}
                      size={16}
                      color={passenger.dropoff ? '#6366f1' : passenger.pickup ? '#10b981' : passenger.ispresent === false ? '#ef4444' : '#38bdf8'}
                    />
                  </View>
                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerName} numberOfLines={1}>{passenger.name}</Text>
                    <View style={styles.phoneRow}>
                      <FontAwesome5 name="phone" size={10} color="#38bdf8" />
                      <Text style={styles.passengerPhone}>{passenger.phone}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.cardDetails}>
                  <Text style={styles.locationLabel}>PICKUP POINT</Text>
                  <Text style={styles.locationText} numberOfLines={2}>{passenger.address}</Text>
                  {trip?.status !== 'completed' && (
                    <View style={styles.actionButtonsRow}>
                      {leg === 'outbound' ? (
                        <>
                          <TouchableOpacity
                            style={[styles.actionBtn, passenger.pickup && styles.actionBtnActivePickedUp]}
                            onPress={() => {
                              const val = !passenger.pickup;
                              const updated = passengers.map(p =>
                                p.id === passenger.id ? { ...p, pickup: val, ispresent: true } : p
                              );
                              setPassengers(updated);
                              savePassengerState(updated);
                            }}
                          >
                            <Text style={[styles.actionBtnText, passenger.pickup && styles.actionBtnTextActive]}>Picked Up</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, passenger.ispresent === false && styles.actionBtnActiveAbsent]}
                            onPress={() => {
                              const val = passenger.ispresent !== false;
                              const updated = passengers.map(p =>
                                p.id === passenger.id ? { ...p, ispresent: !val, pickup: false } : p
                              );
                              setPassengers(updated);
                              savePassengerState(updated);
                            }}
                          >
                            <Text style={[styles.actionBtnText, passenger.ispresent === false && styles.actionBtnTextActive]}>Absent</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          style={[styles.actionBtn, passenger.dropoff && styles.actionBtnActiveDroppedOff, { flex: 1 }]}
                          onPress={() => {
                            const val = !passenger.dropoff;
                            const updated = passengers.map(p =>
                              p.id === passenger.id ? { ...p, dropoff: val } : p
                            );
                            setPassengers(updated);
                            savePassengerState(updated);
                          }}
                        >
                          <Text style={[styles.actionBtnText, passenger.dropoff && styles.actionBtnTextActive]}>Dropped Off</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Passenger Status Modal */}
      {showPassengerModal && selectedPassenger && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={showPassengerModal}
          onRequestClose={() => setShowPassengerModal(false)}
        >
          <View style={styles.passengerModalOverlay}>
            <View style={styles.passengerModalContent}>
              <View style={styles.passengerModalHeader}>
                <Text style={styles.passengerModalTitle}>{selectedPassenger.name}</Text>
                <TouchableOpacity onPress={() => setShowPassengerModal(false)}>
                  <FontAwesome5 name="times" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={styles.passengerModalBody}>
                {leg === 'outbound' ? (
                  <>
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>Picked Up</Text>
                      <Switch
                        trackColor={{ false: "#334155", true: "#6366f1" }}
                        thumbColor={selectedPassenger.pickup ? "#ffffff" : "#f1f5f9"}
                        onValueChange={(val) => {
                          const updated = passengers.map(p =>
                            p.id === selectedPassenger.id ? { ...p, pickup: val, ispresent: true } : p
                          );
                          setPassengers(updated);
                          setSelectedPassenger({ ...selectedPassenger, pickup: val, ispresent: true });
                          savePassengerState(updated);
                        }}
                        value={selectedPassenger.pickup || false}
                      />
                    </View>

                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>Absent</Text>
                      <Switch
                        trackColor={{ false: "#334155", true: "#ef4444" }}
                        thumbColor={selectedPassenger.ispresent === false ? "#ffffff" : "#f1f5f9"}
                        onValueChange={(val) => {
                          const updated = passengers.map(p =>
                            p.id === selectedPassenger.id ? { ...p, ispresent: !val, pickup: false } : p
                          );
                          setPassengers(updated);
                          setSelectedPassenger({ ...selectedPassenger, ispresent: !val, pickup: false });
                          savePassengerState(updated);
                        }}
                        value={selectedPassenger.ispresent === false}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>Dropped Off</Text>
                      <Switch
                        trackColor={{ false: "#334155", true: "#10b981" }}
                        thumbColor={selectedPassenger.dropoff ? "#ffffff" : "#f1f5f9"}
                        onValueChange={(val) => {
                          const updated = passengers.map(p =>
                            p.id === selectedPassenger.id ? { ...p, dropoff: val } : p
                          );
                          setPassengers(updated);
                          setSelectedPassenger({ ...selectedPassenger, dropoff: val });
                          savePassengerState(updated);
                        }}
                        value={selectedPassenger.dropoff || false}
                      />
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={() => setShowPassengerModal(false)}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  headerTextContainer: {
    flex: 1,
  },
  simulateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  simulateButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  headerControls: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  centerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#6366f1',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  carouselContainer: {
    paddingHorizontal: width * 0.1 - CARD_MARGIN,
    paddingTop: 20,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
  },
  passengerCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  activeCard: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(30, 41, 59, 1)',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerPhone: {
    fontSize: 13,
    color: '#94a3b8',
    marginLeft: 6,
    fontWeight: '600',
  },
  cardDetails: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    padding: 12,
    borderRadius: 12,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  driverMarkerContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarkerInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  passengerMarkerContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerMarkerInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
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
  completeTripBtn: {
    marginTop: 16,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  completeTripBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  actionBtnText: {
    color: '#818cf8',
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnTextActive: {
    color: '#ffffff',
  },
  actionBtnActivePickedUp: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  actionBtnActiveAbsent: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  actionBtnActiveDroppedOff: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  passengerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  passengerModalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: '#334155',
  },
  passengerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  passengerModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  passengerModalBody: {
    marginBottom: 20,
  },
  passengerModalSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  doneBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  }
});
