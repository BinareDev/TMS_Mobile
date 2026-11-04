/**
 * Route Deviation Detection and Automatic Rerouting Service
 * 
 * This service handles:
 * 1. Calculating distance from driver to assigned route
 * 2. Detecting route deviations (100m threshold)
 * 3. Automatic rerouting using OSRM with multiple servers
 * 4. Notifying backend of deviations
 */

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface DeviationStatus {
  isDeviating: boolean;
  distanceFromRoute: number; // in meters
  consecutiveDeviations: number;
  lastRerouteTime?: number;
}

export interface RerouteResult {
  newRoute: RoutePoint[];
  originalRoute: RoutePoint[];
  deviationDistance: number;
  estimatedDuration?: number;
  estimatedDistance?: number;
}

export type LatLng = [number, number];

export interface OsrmRoute {
  geometry: { coordinates: [number, number][] };
  distance: number;
  duration: number;
}

const DEVIATION_THRESHOLD_METERS = 100; // 100 meters
const CONSECUTIVE_DEVIATIONS_REQUIRED = 3; // Require 3 consecutive readings to confirm deviation
const REROUTE_COOLDOWN_MS = 60000; // Don't reroute more than once per minute

const OSRM_SERVERS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];

/**
 * Request OSRM route with fallback servers
 */
export async function requestOsrmLeg(from: LatLng, to: LatLng): Promise<OsrmRoute[]> {
  const coordinates = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  let lastError: unknown;

  for (const server of OSRM_SERVERS) {
    try {
      const response = await fetch(
        `${server}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=2&steps=false`,
        { method: 'GET' }
      );
      if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
      const data = await response.json();
      if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
        throw new Error(data.message || `OSRM returned ${data.code || 'no routes'}`);
      }
      return data.routes as OsrmRoute[];
    } catch (error) {
      lastError = error;
      console.warn(`Routing server failed: ${server}`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to calculate route');
}

/**
 * Convert OSRM geometry to LatLng array
 */
export function osrmGeometryToLatLng(route: OsrmRoute): LatLng[] {
  return route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng);
}

/**
 * Join route parts, removing duplicate points at junctions
 */
export function joinRouteParts(parts: LatLng[][]): LatLng[] {
  const joined: LatLng[] = [];
  parts.forEach(part => {
    if (!part?.length) return;
    joined.push(...(joined.length ? part.slice(1) : part));
  });
  return joined;
}

/**
 * Calculate itinerary routes through all ordered stops
 * Returns primary route and alternatives
 */
export async function calculateItineraryRoutes(stops: LatLng[]): Promise<{
  primary: LatLng[];
  alternatives: LatLng[][];
  legRoutes: OsrmRoute[][];
}> {
  if (stops.length < 2) throw new Error('At least a start and destination are required');

  const legRoutes: OsrmRoute[][] = [];
  for (let index = 0; index < stops.length - 1; index++) {
    const routes = await requestOsrmLeg(stops[index], stops[index + 1]);
    legRoutes.push(routes);
  }

  const primaryParts = legRoutes.map(routes => osrmGeometryToLatLng(routes[0]));
  const primary = joinRouteParts(primaryParts);

  const alternatives: LatLng[][] = [];
  for (let legIndex = 0; legIndex < legRoutes.length && alternatives.length < 2; legIndex++) {
    if (legRoutes[legIndex].length < 2) continue;
    const alternativeParts = legRoutes.map((routes, index) =>
      osrmGeometryToLatLng(index === legIndex ? routes[1] : routes[0])
    );
    alternatives.push(joinRouteParts(alternativeParts));
  }

  return { primary, alternatives, legRoutes };
}

/**
 * Calculate distance from point to route segment in meters
 */
export function distanceToRouteSegmentMeters(point: LatLng, start: LatLng, end: LatLng): number {
  const earthRadius = 6371000;
  const referenceLat = point[0] * Math.PI / 180;
  const project = ([lat, lng]: LatLng) => ({
    x: lng * Math.PI / 180 * earthRadius * Math.cos(referenceLat),
    y: lat * Math.PI / 180 * earthRadius,
  });
  const p = project(point);
  const a = project(start);
  const b = project(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Calculate minimum distance from point to route in meters
 */
export function distanceFromRouteMeters(point: LatLng, route: LatLng[]): number {
  if (route.length < 2) return Infinity;
  let nearest = Infinity;
  for (let index = 0; index < route.length - 1; index++) {
    nearest = Math.min(nearest, distanceToRouteSegmentMeters(point, route[index], route[index + 1]));
  }
  return nearest;
}

/**
 * Calculate distance between two points using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Find the nearest point on a polyline to a given location
 */
export function findNearestPointOnRoute(
  driverLat: number,
  driverLon: number,
  route: RoutePoint[]
): RoutePoint | null {
  if (!route || route.length === 0) return null;

  let nearestPoint = route[0];
  let minDistance = Infinity;

  for (const point of route) {
    const distance = calculateDistance(
      driverLat,
      driverLon,
      point.latitude,
      point.longitude
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = point;
    }
  }

  return nearestPoint;
}

/**
 * Calculate distance from driver to the route polyline
 * This is more accurate than just finding nearest point
 */
export function calculateDistanceToRoute(
  driverLat: number,
  driverLon: number,
  route: RoutePoint[]
): number {
  if (!route || route.length < 2) return 0;

  let minDistance = Infinity;

  // Check distance to each segment of the route
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];

    const distance = distanceToSegment(
      driverLat,
      driverLon,
      p1.latitude,
      p1.longitude,
      p2.latitude,
      p2.longitude
    );

    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * Calculate distance from point to line segment
 */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;

  return Math.sqrt(dx * dx + dy * dy) * 111320; // Convert degrees to meters (approximate)
}

/**
 * Check if driver is deviating from route
 */
export class RouteDeviationDetector {
  private consecutiveDeviations: number = 0;
  private lastRerouteTime: number = 0;
  private deviationNotified: boolean = false;

  /**
   * Check for route deviation
   */
  checkDeviation(
    driverLat: number,
    driverLon: number,
    route: RoutePoint[],
    gpsAccuracy?: number
  ): DeviationStatus {
    // If GPS accuracy is poor (> 50m), skip this check
    if (gpsAccuracy && gpsAccuracy > 50) {
      this.consecutiveDeviations = 0;
      return {
        isDeviating: false,
        distanceFromRoute: 0,
        consecutiveDeviations: 0,
      };
    }

    const distanceToRoute = calculateDistanceToRoute(
      driverLat,
      driverLon,
      route
    );

    const isDeviating = distanceToRoute > DEVIATION_THRESHOLD_METERS;

    if (isDeviating) {
      this.consecutiveDeviations++;
    } else {
      this.consecutiveDeviations = 0;
      this.deviationNotified = false;
    }

    return {
      isDeviating: this.consecutiveDeviations >= CONSECUTIVE_DEVIATIONS_REQUIRED,
      distanceFromRoute: distanceToRoute,
      consecutiveDeviations: this.consecutiveDeviations,
      lastRerouteTime: this.lastRerouteTime,
    };
  }

  /**
   * Check if rerouting is allowed (cooldown period)
   */
  canReroute(): boolean {
    const now = Date.now();
    return now - this.lastRerouteTime > REROUTE_COOLDOWN_MS;
  }

  /**
   * Mark that a reroute has occurred
   */
  markReroute(): void {
    this.lastRerouteTime = Date.now();
    this.consecutiveDeviations = 0;
  }

  /**
   * Check if deviation has been notified to admin
   */
  isDeviationNotified(): boolean {
    return this.deviationNotified;
  }

  /**
   * Mark deviation as notified
   */
  markDeviationNotified(): void {
    this.deviationNotified = true;
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.consecutiveDeviations = 0;
    this.lastRerouteTime = 0;
    this.deviationNotified = false;
  }
}

/**
 * Fetch new route using Google Maps Routes API
 */
export async function fetchGoogleMapsRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string,
  waypoints?: { lat: number; lng: number }[]
): Promise<RerouteResult> {
  try {
    const url = new URL('https://routes.googleapis.com/directions/v2:computeRoutes');
    
    const body = {
      origin: {
        location: {
          latLng: {
            latitude: origin.lat,
            longitude: origin.lng,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.lat,
            longitude: destination.lng,
          },
        },
      },
      intermediates: waypoints?.map(wp => ({
        location: {
          latLng: {
            latitude: wp.lat,
            longitude: wp.lng,
          },
        },
      })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
      },
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found');
    }

    const route = data.routes[0];
    
    // Decode polyline
    const decodedPolyline = decodePolyline(route.polyline.encodedPolyline);

    return {
      newRoute: decodedPolyline,
      originalRoute: [], // Will be filled by caller
      deviationDistance: 0, // Will be filled by caller
      estimatedDuration: route.duration?.seconds,
      estimatedDistance: route.distanceMeters,
    };
  } catch (error) {
    console.error('Error fetching Google Maps route:', error);
    throw error;
  }
}

/**
 * Decode Google Maps encoded polyline
 */
function decodePolyline(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

/**
 * Notify backend of route deviation
 */
export async function notifyDeviation(
  tripId: string | number,
  driverId: string,
  api: any,
  deviationData: {
    currentLat: number;
    currentLng: number;
    deviationDistance: number;
    originalRoute: RoutePoint[];
    newRoute?: RoutePoint[];
  }
): Promise<void> {
  try {
    await api.post('/mobile/route-deviation', {
      trip_id: tripId,
      driver_id: driverId,
      current_latitude: deviationData.currentLat,
      current_longitude: deviationData.currentLng,
      deviation_distance_meters: deviationData.deviationDistance,
      original_route: deviationData.originalRoute,
      new_route: deviationData.newRoute,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to notify backend of deviation:', error);
    // Don't throw - this is a non-critical notification
  }
}
