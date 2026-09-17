import axios from 'axios';

// Using ngrok tunnel for development - works from anywhere
// const API_BASE_URL = 'https://unwearying-vaingloriously-cecelia.ngrok-free.dev/api';
const API_BASE_URL = 'http://192.168.31.47:8000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const session: {
  token: string | null;
  user: {
    id: string;
    name: string;
    email: string | null;
    contact_number: string;
    agency_id: string;
    role: string;
    company_id?: string;
  } | null;
} = {
  token: null,
  user: null,
};

// Dummy loadSession to avoid breaking pages
export const loadSession = async () => {
  // Session details are managed in memory during runtime
};

// Fallback for AsyncStorage if it crashes
export const activeSession: { location_id: number | null } = {
  location_id: null
};

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    session.token = token;
  } else {
    delete api.defaults.headers.common['Authorization'];
    session.token = null;
  }
};

export const authAPI = {
  login: async (data: any) => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },
  getAgencies: async () => {
    const response = await api.get('/auth/agencies');
    return response.data;
  },
  getAgenciesDetailed: async () => {
    const response = await api.get('/auth/agencies/details');
    return response.data;
  },
};

export const tripsAPI = {
  getTrips: async (status?: string, driverId?: string, agencyId?: string) => {
    if (agencyId && driverId) {
      const response = await api.get(`/trips/agency/${agencyId}/driver/${driverId}`);
      return response.data;
    }
    const params: any = {};
    if (status) params.status = status;
    if (driverId) params.driver_id = driverId;
    const response = await api.get('/trips', { params });
    return response.data;
  },
  getTripHistory: async (agencyId: string, driverId: string) => {
    const response = await api.get(`/trips/history/agency/${agencyId}/driver/${driverId}`);
    return response.data;
  },
  createTrip: async (data: any) => {
    const response = await api.post('/trips', data);
    return response.data;
  },
  acceptTrip: async (tripId: string | number, driverId: string | number) => {
    const response = await api.put(`/trips/${tripId}/driver-response`, {
      driver_response: 'accepted'
    });
    return response.data;
  },
  rejectTrip: async (tripId: string | number, driverId: string | number, reason?: string) => {
    const response = await api.put(`/trips/${tripId}/driver-response`, {
      driver_response: 'declined',
      driver_reason: reason || 'Rejected by driver'
    });
    return response.data;
  },
  acceptReturnTrip: async (tripId: string | number, driverId: string | number) => {
    const response = await api.put(`/trips/${tripId}/driver-response-return`, {
      driver_response_two_way: 'accepted'
    });
    return response.data;
  },
  updateTripRoutePoint: async (tripId: string | number, routePointData: any[]) => {
    const response = await api.put(`/trips/driver/${tripId}`, {
      route_point: routePointData
    });
    return response.data;
  },
  rejectReturnTrip: async (tripId: string | number, driverId: string | number, reason?: string) => {
    const response = await api.put(`/trips/${tripId}/driver-response-return`, {
      driver_response_two_way: 'declined',
      driver_reason_two_way: reason || 'Rejected by driver'
    });
    return response.data;
  },
  completeTrip: async (driverId: string | number, locationId: number, tripId: string | number, leg: 'outbound' | 'return') => {
    // The new API expects location_id as Form data
    const formData = new FormData();
    formData.append('location_id', locationId.toString());

    await api.put(`mobile/location/deactivate/${driverId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (leg === 'return') {
      const response = await api.put(`/trips/${tripId}/driver-response-return`, {
        driver_response_two_way: 'completed',
      });
      return response.data;
    } else {
      const response = await api.put(`/trips/${tripId}/driver-response`, {
        driver_response: 'completed',
      });
      return response.data;
    }
  },
  updateTripRoutePoints: async (tripId: string | number, routePoints: any[]) => {
    const response = await api.put(`/trips/${tripId}`, {
      route_point: routePoints
    });
    return response.data;
  },

  // Call the real API on the TMS backend
  getDriverDetails: async (driverId: string | number) => {
    try {
      const response = await api.get(`drivers/mobile/driver-details/${driverId}`);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch real driver details", error);
      // Fallback to minimal data if the API fails or doesn't exist yet
      return {
        id: driverId,
        name: session.user?.name || 'Active Driver',
        contact_number: session.user?.contact_number || '+1 (555) 0199',
        role: session.user?.role || 'Professional Driver',
        email: session.user?.email || 'driver@tms.com',
        agency_id: session.user?.agency_id || '6e7cdb44-603c-46c4-a4ca-198334c34314'
      };
    }
  },

  startLocationTracking: async (data: {
    driver_id: string | number;
    trip_id: string | number;
    agency_id: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    company_id?: string;
    start_date?: string;
    end_date?: string;
  }) => {
    const formData = new FormData();
    formData.append('driver_id', data.driver_id.toString());
    formData.append('trip_id', data.trip_id.toString());
    formData.append('agency_id', data.agency_id);
    formData.append('latitude', data.latitude.toString());
    formData.append('longitude', data.longitude.toString());
    if (data.accuracy !== undefined) formData.append('accuracy', data.accuracy.toString());
    if (data.speed !== undefined) formData.append('speed', data.speed.toString());
    if (data.company_id !== undefined) formData.append('company_id', data.company_id);
    if (data.start_date !== undefined) formData.append('start_date', data.start_date);
    if (data.end_date !== undefined) formData.append('end_date', data.end_date);

    const response = await api.post('/mobile/location', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  updateLocation: async (locationId: number, data: {
    driver_id: string | number;
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
  }) => {
    const formData = new FormData();
    formData.append('driver_id', data.driver_id.toString());
    formData.append('latitude', data.latitude.toString());
    formData.append('longitude', data.longitude.toString());
    if (data.accuracy !== undefined) formData.append('accuracy', data.accuracy.toString());
    if (data.speed !== undefined) formData.append('speed', data.speed.toString());

    const response = await api.put(`/mobile/location/${locationId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  updateLocationRoutePoints: async (data: {
    trip_id: string | number;
    location_id: number;
    driver_id: string;
    agency_id: string;
    route_point: any[];
  }) => {
    const formData = new FormData();
    formData.append('trip_id', data.trip_id.toString());
    formData.append('location_id', data.location_id.toString());
    formData.append('driver_id', data.driver_id);
    formData.append('agency_id', data.agency_id);
    formData.append('route_point', JSON.stringify(data.route_point));

    const response = await api.post('/mobile/route-points', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
