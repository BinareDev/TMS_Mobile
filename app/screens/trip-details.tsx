import { session, tripsAPI } from '@/services/api';
import { FontAwesome5 } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, Switch, LayoutAnimation, Platform, UIManager } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TripDetailsScreen() {
  const { tripId, leg } = useLocalSearchParams();
  const [trip, setTrip] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMapModal, setShowMapModal] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);

  // Expand/Collapse States
  const [isPassengerExpanded, setIsPassengerExpanded] = useState(true);
  const [isRouteInfoExpanded, setIsRouteInfoExpanded] = useState(true);
  const [isMapExpanded, setIsMapExpanded] = useState(true);
  const [isTripDetailsExpanded, setIsTripDetailsExpanded] = useState(true);

  const toggleSection = (setter: any, value: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(value);
  };
  const driverId = session.user?.id || 'cf6912d9-6617-482b-aacf-dd034c780185';
  const agencyId = session.user?.agency_id || '6e7cdb44-603c-46c4-a4ca-198334c34314';

  useEffect(() => {
    loadTripDetails();
  }, [tripId, leg]);

  // Fetch route from OSRM (Open Source Routing Machine) - free, no API key required
  const fetchRoute = async (startLat: number, startLng: number, endLat: number, endLng: number) => {
    try {
      console.log('Fetching route from', startLat, startLng, 'to', endLat, endLng);
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
      );
      const data = await response.json();
      console.log('OSRM response:', data);
      
      if (data.routes && data.routes.length > 0) {
        const coordinates = data.routes[0].geometry.coordinates.map((coord: any) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        console.log('Route coordinates count:', coordinates.length);
        setRouteCoordinates(coordinates);
      } else {
        console.log('No routes found in response');
        // Fallback to straight line
        setRouteCoordinates([
          { latitude: startLat, longitude: startLng },
          { latitude: endLat, longitude: endLng },
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch route:', error);
      // Fallback to straight line if API fails
      setRouteCoordinates([
        { latitude: startLat, longitude: startLng },
        { latitude: endLat, longitude: endLng },
      ]);
    }
  };

  const loadTripDetails = async () => {
    try {
      setLoading(true);
      // Fetch trips from database for the driver
      const trips = await tripsAPI.getTrips(undefined, driverId, agencyId);
      
      const formattedDbTrips = trips.map((ts: any) => {
        let passengerName = ts.company_name ? `Company: ${ts.company_name}` : 'No passengers';
        let passengerPhone = 'N/A';
        let passengerList: any[] = [];
        
        // Try to get passenger data from multiple sources
        if (ts.route_point) {
          try {
            const points = typeof ts.route_point === 'string' ? JSON.parse(ts.route_point) : ts.route_point;
            if (Array.isArray(points) && points.length > 0) {
              const names = points.map((p: any) => p.passenger_name).filter(Boolean);
              const phones = points.map((p: any) => p.passenger_phone).filter(Boolean);
              if (names.length > 0) passengerName = names.join(', ');
              if (phones.length > 0) passengerPhone = phones.join(', ');
              
              // Parse individual passenger details
              passengerList = points.map((p: any) => ({
                ...p, // Retain raw object
                id: p.passenger_id || p.id || Math.random().toString(), // fallback id
                name: p.passenger_name || 'Unknown',
                phone: p.passenger_phone || 'N/A',
                address: p.address || p.pickup_address || ts.starting_point || 'Unknown address',
                lat: p.lat || p.pickup_lat || ts.starting_lat,
                lng: p.lng || p.pickup_lng || ts.starting_lng,
                pickup: p.pickup || false,
                dropoff: p.dropoff || false,
                ispresent: p.ispresent || false,
              }));
            }
          } catch (e) {
            // ignore parsing failure
          }
        }
        
        // Fallback: Check for shuttle passengers in other fields
        if (passengerList.length === 0) {
          if (ts.passengers && Array.isArray(ts.passengers)) {
            passengerList = ts.passengers.map((p: any) => ({
              name: p.name || p.passenger_name || 'Unknown',
              phone: p.phone || p.passenger_phone || 'N/A',
              address: p.address || p.pickup_address || ts.starting_point || 'Unknown address',
              lat: p.lat || p.pickup_lat || ts.starting_lat,
              lng: p.lng || p.pickup_lng || ts.starting_lng,
            }));
            const names = passengerList.map(p => p.name).filter(Boolean);
            const phones = passengerList.map(p => p.phone).filter(Boolean);
            if (names.length > 0) passengerName = names.join(', ');
            if (phones.length > 0) passengerPhone = phones.join(', ');
          }
          
          // Check for passenger_list field
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
                const names = passengerList.map(p => p.name).filter(Boolean);
                const phones = passengerList.map(p => p.phone).filter(Boolean);
                if (names.length > 0) passengerName = names.join(', ');
                if (phones.length > 0) passengerPhone = phones.join(', ');
              }
            } catch (e) {
              // ignore parsing failure
            }
          }
        }
        
        // Completed status now explicitly checks driver_response === 'completed' as per user request
        const isOneWayCompleted = ts.driver_response === 'completed' || ts.status === 'completed';
        const isTwoWayCompleted = ts.driver_response_two_way === 'completed' || ts.status === 'completed';
        
        let computedStatus = 'pending';
        if (leg === 'return') {
          computedStatus = ts.driver_response_two_way === 'declined' ? 'rejected' : (isTwoWayCompleted ? 'completed' : (ts.driver_response_two_way === 'accepted' ? 'accepted' : 'pending'));
        } else {
          computedStatus = ts.driver_response === 'declined' ? 'rejected' : (isOneWayCompleted ? 'completed' : (ts.driver_response === 'accepted' ? 'accepted' : 'pending'));
        }
        
        return {
          id: ts.id,
          passenger_name: passengerName,
          passenger_phone: passengerPhone,
          passengers: passengerList,
          pickup_location: ts.starting_point || 'Unknown Start',
          pickup_lat: ts.starting_lat,
          pickup_lng: ts.starting_lng,
          dropoff_location: ts.end_point || 'Unknown End',
          dropoff_lat: ts.end_lat,
          dropoff_lng: ts.end_lng,
          status: computedStatus,
          fare: ts.distance_km ? Math.round(ts.distance_km * 15) : 100,
          distance: ts.distance_km ? Math.round(ts.distance_km * 10) / 10 : null,
          created_at: ts.created_at || new Date().toISOString(),
          source: 'postgres'
        };
      });

      // Mock trips for frontend display
      const mockTrips: any[] = [
        {
          id: 'mock-1',
          passenger_name: 'Aditi Sharma (Mock)',
          passenger_phone: '9876543210',
          pickup_location: 'Coimbatore Airport, Coimbatore',
          pickup_lat: 11.03,
          pickup_lng: 77.04,
          dropoff_location: 'Gandhipuram Bus Stand, Coimbatore',
          dropoff_lat: 11.02,
          dropoff_lng: 76.97,
          status: 'pending',
          fare: 350,
          distance: 12.5,
          created_at: new Date().toISOString()
        },
        {
          id: 'mock-2',
          passenger_name: 'Rajesh Kumar (Mock)',
          passenger_phone: '9876543211',
          pickup_location: 'Railway Station, Coimbatore',
          pickup_lat: 10.99,
          pickup_lng: 76.96,
          dropoff_location: 'PSG College of Technology, Coimbatore',
          dropoff_lat: 11.02,
          dropoff_lng: 77.00,
          status: 'accepted',
          fare: 220,
          distance: 6.8,
          created_at: new Date().toISOString()
        },
        {
          id: 'mock-3',
          passenger_name: 'Meena Patel (Mock)',
          passenger_phone: '9876543212',
          pickup_location: 'Brookefields Mall, Coimbatore',
          pickup_lat: 11.01,
          pickup_lng: 76.96,
          dropoff_location: 'TIDEL Park, Coimbatore',
          dropoff_lat: 11.02,
          dropoff_lng: 77.03,
          status: 'completed',
          fare: 400,
          distance: 14.2,
          created_at: new Date().toISOString()
        }
      ];

      const allTrips = [...formattedDbTrips, ...mockTrips];
      const tripData = allTrips.find((t: any) => String(t.id) === String(tripId));
      
      // If this is a return leg, reverse pickup and dropoff locations
      if (tripData && leg === 'return') {
        console.log('Reversing locations for return leg');
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
        
        // Fetch route coordinates for return leg
        if (tripData.dropoff_lat && tripData.dropoff_lng && tripData.pickup_lat && tripData.pickup_lng) {
          fetchRoute(tripData.dropoff_lat, tripData.dropoff_lng, tripData.pickup_lat, tripData.pickup_lng);
        }
      } else {
        setTrip(tripData);
        setPassengers(tripData.passengers || []);
        
        // Fetch route coordinates when trip is loaded
        if (tripData.pickup_lat && tripData.pickup_lng && tripData.dropoff_lat && tripData.dropoff_lng) {
          fetchRoute(tripData.pickup_lat, tripData.pickup_lng, tripData.dropoff_lat, tripData.dropoff_lng);
        }
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        Alert.alert('Session Expired', 'Please log in again');
        router.replace('/');
      } else {
        Alert.alert('Error', 'Failed to load trip details');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      if (String(tripId).startsWith('mock-')) {
        Alert.alert('Success (Mock)', 'Mock trip accepted locally');
        setTrip((prev: any) => ({ ...prev, status: 'accepted' }));
        return;
      }
      await tripsAPI.acceptTrip(tripId as string, driverId);
      Alert.alert('Success', 'Trip accepted successfully');
      loadTripDetails();
    } catch (error) {
      Alert.alert('Error', 'Failed to accept trip');
    }
  };

  const handleReject = async () => {
    try {
      if (String(tripId).startsWith('mock-')) {
        Alert.alert('Success (Mock)', 'Mock trip rejected locally');
        router.back();
        return;
      }
      await tripsAPI.rejectTrip(tripId as string, driverId);
      Alert.alert('Success', 'Trip rejected');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to reject trip');
    }
  };



  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading trip details...</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Trip not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <FontAwesome5 name="arrow-left" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Details</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.card}>
          <View style={styles.passengerInfo}>
            <View style={styles.avatar}>
              <FontAwesome5 name="user" size={32} color="#6366f1" />
            </View>
            <View style={styles.passengerDetails}>
              <Text style={styles.newPassengerName}>{trip.passenger_name}</Text>
              <Text style={styles.newPassengerPhone}>{trip.passenger_phone}</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            {leg && (
              <View style={[styles.legBadge, { backgroundColor: leg === 'outbound' ? '#6366f1' : '#f59e0b', marginRight: 8 }]}>
                <Text style={styles.legText}>{leg === 'outbound' ? 'OUTBOUND' : 'RETURN'}</Text>
              </View>
            )}
            <Text style={styles.statusLabel}>Status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
              <Text style={styles.statusText}>{trip.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

      <View style={styles.card}>
        <TouchableOpacity 
          style={styles.sectionHeader} 
          onPress={() => toggleSection(setIsPassengerExpanded, !isPassengerExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <FontAwesome5 name="users" size={14} color="#6366f1" />
            </View>
            <Text style={styles.sectionTitle}>Passenger Details</Text>
          </View>
          <View style={styles.chevronContainer}>
            <FontAwesome5 name={isPassengerExpanded ? "chevron-up" : "chevron-down"} size={14} color="#94a3b8" />
          </View>
        </TouchableOpacity>
        
        {isPassengerExpanded && (
          <View style={styles.sectionContent}>
            {passengers.length > 0 ? (
              <View style={styles.passengersContainer}>
                {passengers.map((passenger, index) => (
                  <View key={index} style={styles.passengerRow}>
                    <View style={styles.passengerAvatar}>
                      <Text style={styles.passengerAvatarText}>{passenger.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.newPassengerInfo}>
                      <Text style={styles.newPassengerName}>{passenger.name}</Text>
                      <View style={styles.passengerContact}>
                        <FontAwesome5 name="phone" size={12} color="#6366f1" />
                        <Text style={styles.newPassengerPhone}>{passenger.phone}</Text>
                      </View>
                      <View style={styles.passengerLocation}>
                        <FontAwesome5 name="map-marker-alt" size={12} color="#10b981" />
                        <Text style={styles.newPassengerAddress}>{passenger.address}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noPassengers}>
                <FontAwesome5 name="users" size={32} color="#64748b" />
                <Text style={styles.noPassengersText}>No individual passenger details available</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <TouchableOpacity 
          style={styles.sectionHeader} 
          onPress={() => toggleSection(setIsRouteInfoExpanded, !isRouteInfoExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <FontAwesome5 name="route" size={14} color="#10b981" />
            </View>
            <Text style={styles.sectionTitle}>Route Information</Text>
          </View>
          <View style={styles.chevronContainer}>
            <FontAwesome5 name={isRouteInfoExpanded ? "chevron-up" : "chevron-down"} size={14} color="#94a3b8" />
          </View>
        </TouchableOpacity>

        {isRouteInfoExpanded && (
          <View style={styles.sectionContent}>
            <View style={styles.timelineContainer}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineDot, { backgroundColor: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }]} />
                <View style={styles.timelineLine} />
                <View style={[styles.timelineDot, { backgroundColor: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }]} />
              </View>
              <View style={styles.timelineRight}>
                <View style={styles.locationGroup}>
                  <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
                  <Text style={styles.locationText}>{trip.pickup_location}</Text>
                </View>
                <View style={{ height: 24 }} />
                <View style={styles.locationGroup}>
                  <Text style={styles.locationLabel}>DROPOFF LOCATION</Text>
                  <Text style={styles.locationText}>{trip.dropoff_location}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {trip.pickup_lat && trip.pickup_lng && trip.dropoff_lat && trip.dropoff_lng && (
        <View style={styles.card}>
          <TouchableOpacity 
            style={styles.sectionHeader} 
            onPress={() => toggleSection(setIsMapExpanded, !isMapExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <FontAwesome5 name="map-marked-alt" size={14} color="#ef4444" />
              </View>
              <Text style={styles.sectionTitle}>Route Map</Text>
            </View>
            <View style={styles.chevronContainer}>
              <FontAwesome5 name={isMapExpanded ? "chevron-up" : "chevron-down"} size={14} color="#94a3b8" />
            </View>
          </TouchableOpacity>
          
          {isMapExpanded && (
            <View style={[styles.sectionContent, styles.mapSectionContent]}>
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: (trip.pickup_lat + trip.dropoff_lat) / 2,
                  longitude: (trip.pickup_lng + trip.dropoff_lng) / 2,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
              >
                {/* Pickup Location Marker */}
                <Marker
                  coordinate={{
                    latitude: trip.pickup_lat,
                    longitude: trip.pickup_lng,
                  }}
                  title="Pickup Location"
                  pinColor="#22c55e"
                />
                
                {/* Passenger Pickup Points */}
                {passengers.length > 0 && passengers.map((passenger, index) => (
                  passenger.lat && passenger.lng ? (
                    <Marker
                      key={index}
                      coordinate={{
                        latitude: passenger.lat,
                        longitude: passenger.lng,
                      }}
                      title={`${passenger.name} (Passenger ${index + 1})`}
                      description={passenger.address}
                    >
                      <View style={styles.passengerMarkerContainer}>
                        <View style={styles.passengerMarkerInner}>
                          <FontAwesome5 name="user" size={14} color="#ffffff" />
                        </View>
                      </View>
                    </Marker>
                  ) : null
                ))}
                
                {/* Dropoff Location Marker */}
                <Marker
                  coordinate={{
                    latitude: trip.dropoff_lat,
                    longitude: trip.dropoff_lng,
                  }}
                  title="Dropoff Location"
                  pinColor="#ef4444"
                />
                
                {/* Route Line */}
                <Polyline
                  coordinates={routeCoordinates.length > 0 ? routeCoordinates : [
                    { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
                    { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
                  ]}
                  strokeColor="#6366f1"
                  strokeWidth={3}
                />
              </MapView>
              <TouchableOpacity style={styles.fullScreenMapBtn} onPress={() => setShowMapModal(true)}>
                <FontAwesome5 name="expand-arrows-alt" size={14} color="#818cf8" />
                <Text style={styles.fullScreenMapText}>View Full Screen Map</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.card}>
        <TouchableOpacity 
          style={styles.sectionHeader} 
          onPress={() => toggleSection(setIsTripDetailsExpanded, !isTripDetailsExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.sectionIconContainer, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
              <FontAwesome5 name="info-circle" size={14} color="#38bdf8" />
            </View>
            <Text style={styles.sectionTitle}>Trip Details</Text>
          </View>
          <View style={styles.chevronContainer}>
            <FontAwesome5 name={isTripDetailsExpanded ? "chevron-up" : "chevron-down"} size={14} color="#94a3b8" />
          </View>
        </TouchableOpacity>
        
        {isTripDetailsExpanded && (
          <View style={styles.sectionContent}>
            <View style={styles.detailRow}>
              <FontAwesome5 name="road" size={18} color="#38bdf8" />
              <Text style={styles.detailLabel}>Distance:</Text>
              <Text style={styles.detailValue}>{trip.distance ? `${trip.distance} km` : 'Not specified'}</Text>
            </View>

            <View style={styles.detailRow}>
              <FontAwesome5 name="clock" size={18} color="#38bdf8" />
              <Text style={styles.detailLabel}>Created:</Text>
              <Text style={styles.detailValue}>{new Date(trip.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
            </View>
          </View>
        )}
      </View>

      {trip.status === 'pending' && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={handleReject}>
            <Text style={styles.actionButtonText}>Reject Trip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={handleAccept}>
            <Text style={styles.actionButtonText}>Accept Trip</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>

    {/* Map Modal */}
    {showMapModal && (
      <Modal
        animationType="slide"
        transparent={true}
        visible={showMapModal}
        onRequestClose={() => setShowMapModal(false)}
      >
        <View style={styles.mapModalOverlay}>
          <View style={styles.mapModalContent}>
            <View style={styles.mapModalHeader}>
              <TouchableOpacity onPress={() => setShowMapModal(false)}>
                <FontAwesome5 name="times" size={24} color="#f8fafc" />
              </TouchableOpacity>
              <Text style={styles.mapModalTitle}>Route Map</Text>
              <View style={{ width: 24 }} />
            </View>
            
            {trip.pickup_lat && trip.pickup_lng && trip.dropoff_lat && trip.dropoff_lng && (
              <MapView
                style={styles.mapModalMap}
                initialRegion={{
                  latitude: (trip.pickup_lat + trip.dropoff_lat) / 2,
                  longitude: (trip.pickup_lng + trip.dropoff_lng) / 2,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
              >
                {/* Pickup Location Marker */}
                <Marker
                  coordinate={{
                    latitude: trip.pickup_lat,
                    longitude: trip.pickup_lng,
                  }}
                  title="Start Point"
                  description={trip.pickup_location}
                  pinColor="#22c55e"
                />
                
                {/* Passenger Pickup Points */}
              {passengers.length > 0 && passengers.map((passenger, index) => (
                passenger.lat && passenger.lng ? (
                  <Marker
                    key={index}
                    coordinate={{
                      latitude: passenger.lat,
                      longitude: passenger.lng,
                    }}
                    title={`${passenger.name} (Passenger ${index + 1})`}
                    description={`Phone: ${passenger.phone}\nAddress: ${passenger.address}`}
                  >
                    <View style={styles.passengerMarkerContainer}>
                      <View style={styles.passengerMarkerInner}>
                        <FontAwesome5 name="user" size={14} color="#ffffff" />
                      </View>
                    </View>
                  </Marker>
                ) : null
              ))}
                
                {/* Dropoff Location Marker */}
                <Marker
                  coordinate={{
                    latitude: trip.dropoff_lat,
                    longitude: trip.dropoff_lng,
                  }}
                  title="End Point"
                  description={trip.dropoff_location}
                  pinColor="#ef4444"
                />
                
                {/* Route Line */}
                <Polyline
                  coordinates={routeCoordinates.length > 0 ? routeCoordinates : [
                    { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
                    { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng },
                  ]}
                  strokeColor="#6366f1"
                  strokeWidth={3}
                />
              </MapView>
            )}
          </View>
        </View>
      </Modal>
    )}


    </View>
  );
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return '#f59e0b';
    case 'accepted': return '#10b981';
    case 'rejected': return '#ef4444';
    case 'completed': return '#6366f1';
    default: return '#64748b';
  }
};

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
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    margin: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  passengerDetails: {
    marginLeft: 16,
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  statusLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
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
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  mapSectionContent: {
    padding: 0,
    marginTop: 16,
    borderTopWidth: 0,
  },
  fullScreenMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  fullScreenMapText: {
    color: '#818cf8',
    fontWeight: '700',
    marginLeft: 8,
  },
  timelineContainer: {
    flexDirection: 'row',
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
  locationText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  map: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginLeft: 12,
    flex: 1,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
    color: '#94a3b8',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
    color: '#ef4444',
  },
  passengersContainer: {
    gap: 12,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  passengerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  passengerAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  newPassengerInfo: {
    flex: 1,
  },
  newPassengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  passengerContact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  newPassengerPhone: {
    fontSize: 13,
    color: '#6366f1',
    fontWeight: '600',
    marginLeft: 6,
  },
  passengerLocation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newPassengerAddress: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 6,
    flex: 1,
  },
  noPassengers: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noPassengersText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 12,
    textAlign: 'center',
  },
  mapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  mapModalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  mapModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  mapModalMap: {
    flex: 1,
  },
  passengerMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  passengerMarkerContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerMarkerInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

});
