# Route Deviation Detection and Automatic Rerouting - Implementation Guide

## Overview

This implementation adds route deviation detection and automatic rerouting capabilities to the TMS Mobile app using Google Maps Routes API. The system continuously monitors the driver's GPS location against the assigned route and automatically recalculates routes when deviations are detected.

## Features Implemented

### 1. Live GPS Tracking
- Continuous GPS tracking using `expo-location`
- High accuracy location updates every 2 seconds
- Distance interval of 3 meters between updates
- GPS accuracy filtering to avoid false positives (>50m accuracy is ignored)

### 2. Assigned Route Display
- Original route displayed in blue (#6366f1)
- When rerouted, original route shown as dashed gray line
- Current/rerouted route displayed in orange (#f59e0b) when deviating
- Preserves original pickup and dropoff locations

### 3. Route Deviation Detection
- **Threshold**: 100 meters from assigned route
- **Confirmation**: Requires 3 consecutive GPS readings above threshold
- **GPS Filtering**: Ignores readings with accuracy > 50m to avoid false alerts
- **Cooldown**: 60-second cooldown between rerouting attempts
- **Algorithm**: Uses point-to-segment distance calculation for accuracy

### 4. Automatic Rerouting
- Triggers when deviation is confirmed and cooldown has passed
- Uses Google Maps Routes API to calculate new route
- Considers remaining passengers as waypoints
- Updates route polyline and estimated arrival time
- Preserves original pickup and dropoff locations
- Notifies backend of reroute event

### 5. Admin Notification
- API endpoint: `POST /mobile/route-deviation`
- Sends deviation data including:
  - Current driver location
  - Deviation distance in meters
  - Original route coordinates
  - New route coordinates (if rerouted)
  - Timestamp
- Non-blocking failure (logs error but doesn't interrupt driver)

## Files Modified

### New Files Created

1. **`services/routeDeviation.ts`** (New)
   - Core deviation detection logic
   - Google Maps Routes API integration
   - Distance calculation utilities
   - Route deviation detector class
   - Backend notification function

### Modified Files

2. **`app/screens/live-map.tsx`**
   - Added route deviation detection state
   - Integrated deviation checking in location updates
   - Added automatic rerouting function
   - Added visual indicators for deviation
   - Added deviation alert modal
   - Updated route display to show original vs new routes

## Environment Variables

### Google Maps API Key

The Google Maps API key is currently hardcoded in `live-map.tsx`:

```typescript
const GOOGLE_MAPS_API_KEY = 'AIzaSyC3hcVreZORUipdbZryndAPXRj9a_-EEuU';
```

**Recommended**: Move to environment variable for security:

1. Create `.env` file in project root:
```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

2. Update `live-map.tsx`:
```typescript
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'fallback_key';
```

3. Add to `app.json` extra section:
```json
"extra": {
  "googleMapsApiKey": "your_api_key_here"
}
```

### Required Google Maps APIs

Enable the following APIs in Google Cloud Console:
- **Routes API** - For route calculation
- **Maps JavaScript API** - Already configured in app.json

## Backend API Requirements

### New Endpoint: Route Deviation Notification

Create endpoint in your backend to handle deviation notifications:

**Endpoint**: `POST /mobile/route-deviation`

**Request Body**:
```typescript
{
  trip_id: string | number;
  driver_id: string;
  current_latitude: number;
  current_longitude: number;
  deviation_distance_meters: number;
  original_route: Array<{latitude: number, longitude: number}>;
  new_route?: Array<{latitude: number, longitude: number}>;
  timestamp: string; // ISO 8601 format
}
```

**Suggested Backend Implementation**:
```typescript
// Example backend route handler
router.post('/mobile/route-deviation', async (req, res) => {
  try {
    const {
      trip_id,
      driver_id,
      current_latitude,
      current_longitude,
      deviation_distance_meters,
      original_route,
      new_route,
      timestamp
    } = req.body;

    // Store deviation record in database
    await RouteDeviation.create({
      trip_id,
      driver_id,
      current_latitude,
      current_longitude,
      deviation_distance_meters,
      original_route: JSON.stringify(original_route),
      new_route: new_route ? JSON.stringify(new_route) : null,
      timestamp,
      notified_admin: false
    });

    // Emit WebSocket event to admin dashboard
    io.emit('route-deviation', {
      trip_id,
      driver_id,
      deviation_distance: deviation_distance_meters,
      current_location: { lat: current_latitude, lng: current_longitude },
      original_route,
      new_route,
      timestamp
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling route deviation:', error);
    res.status(500).json({ error: 'Failed to process deviation' });
  }
});
```

### Database Schema (Optional)

Create a table to store deviation records:

```sql
CREATE TABLE route_deviations (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id),
  driver_id VARCHAR(255) REFERENCES drivers(id),
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  deviation_distance_meters DECIMAL(10, 2),
  original_route TEXT, -- JSON string
  new_route TEXT, -- JSON string (nullable)
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notified_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Configuration Constants

### Deviation Detection Settings

Located in `services/routeDeviation.ts`:

```typescript
const DEVIATION_THRESHOLD_METERS = 100; // 100 meters
const CONSECUTIVE_DEVIATIONS_REQUIRED = 3; // Require 3 consecutive readings
const REROUTE_COOLDOWN_MS = 60000; // 1 minute cooldown
```

**Customization**: Adjust these values based on your requirements:
- Increase `DEVIATION_THRESHOLD_METERS` for more lenient detection
- Increase `CONSECUTIVE_DEVIATIONS_REQUIRED` to reduce false positives
- Increase `REROUTE_COOLDOWN_MS` to reduce API usage

## Testing Instructions

### Manual Testing

1. **Start a trip** in the mobile app
2. **Navigate to Live Map** screen
3. **Intentionally deviate** from the route by >100m
4. **Observe**:
   - Deviation alert modal appears after 3 consecutive readings
   - Route line changes to orange
   - After 60 seconds, automatic rerouting triggers
   - New route is calculated and displayed
   - Original route shown as dashed gray line

### Simulation Testing

The existing simulation feature in `live-map.tsx` can be used to test:
1. Start simulation
2. Manually modify coordinates to simulate deviation
3. Observe deviation detection and rerouting

### Backend Testing

Test the backend endpoint:
```bash
curl -X POST https://your-backend.com/api/mobile/route-deviation \
  -H "Content-Type: application/json" \
  -d '{
    "trip_id": "123",
    "driver_id": "driver-uuid",
    "current_latitude": 11.0,
    "current_longitude": 77.0,
    "deviation_distance_meters": 150,
    "original_route": [{"latitude": 11.0, "longitude": 77.0}],
    "timestamp": "2026-11-04T12:00:00Z"
  }'
```

## Error Handling

### GPS Permission Errors
- Handled by `expo-location` permission request
- Shows warning if permission denied
- Gracefully continues without location tracking

### Network Failures
- Google Maps API failures fall back to OSRM routing
- Backend notification failures are logged but don't interrupt driver
- Original route is preserved if rerouting fails

### Inaccurate GPS Readings
- Readings with accuracy > 50m are ignored
- Consecutive deviation check prevents false positives
- Cooldown prevents repeated rerouting attempts

## Performance Considerations

### API Usage
- Google Maps Routes API is called only when:
  - Deviation is confirmed (3 consecutive readings)
  - Cooldown period has elapsed (60 seconds)
- This minimizes API costs and prevents rate limiting

### Battery Usage
- Location updates every 2 seconds (configurable)
- High accuracy mode only during active trip
- Deviation calculation is lightweight (math operations only)

### Memory Usage
- Route coordinates stored as arrays
- Original route preserved for comparison
- No significant memory impact

## Admin Dashboard Integration

To display deviation alerts in your admin dashboard:

### WebSocket Event Listener

```typescript
socket.on('route-deviation', (data) => {
  // Display alert to admin
  showAlert({
    title: 'Route Deviation Detected',
    message: `Driver ${data.driver_id} deviated by ${data.deviation_distance}m`,
    type: 'warning'
  });
  
  // Show on map
  updateMap({
    driverLocation: data.current_location,
    originalRoute: data.original_route,
    newRoute: data.new_route
  });
});
```

### Deviation History View

Create a view to show deviation history:
```typescript
// Fetch deviations for a trip
const deviations = await RouteDeviation.findAll({
  where: { trip_id: tripId },
  order: [['timestamp', 'DESC']]
});

// Display in table or timeline
```

## Troubleshooting

### Issue: False deviation alerts
**Solution**: 
- Increase `DEVIATION_THRESHOLD_METERS`
- Increase `CONSECUTIVE_DEVIATIONS_REQUIRED`
- Check GPS accuracy in area

### Issue: Rerouting not triggering
**Solution**:
- Check Google Maps API key is valid
- Verify Routes API is enabled in Google Cloud Console
- Check cooldown period (60 seconds)
- Check network connectivity

### Issue: Backend notifications not received
**Solution**:
- Verify backend endpoint exists
- Check CORS configuration
- Check WebSocket connection
- Review server logs for errors

### Issue: Original route not preserved
**Solution**:
- Ensure `originalRouteCoordinates` state is set on initial route load
- Check that route comparison logic is working
- Verify state persistence across reroutes

## Security Considerations

1. **API Key Security**
   - Move API key to environment variables
   - Never commit API keys to version control
   - Use API key restrictions in Google Cloud Console

2. **Data Privacy**
   - Driver location data is sensitive
   - Ensure backend endpoint is authenticated
   - Consider data retention policies for deviation records

3. **Rate Limiting**
   - Implement rate limiting on backend endpoint
   - Google Maps API has usage limits
   - Monitor API usage in Google Cloud Console

## Future Enhancements

Potential improvements for future iterations:

1. **Smart Rerouting**
   - Consider traffic conditions
   - Avoid toll roads if configured
   - Multiple route options

2. **Driver Feedback**
   - Allow driver to accept/reject reroute
   - Manual reroute request button
   - Route preference settings

3. **Advanced Analytics**
   - Deviation frequency tracking
   - Driver behavior analysis
   - Route optimization suggestions

4. **Offline Support**
   - Cache route data
   - Offline deviation detection
   - Sync when connection restored

## Support

For issues or questions:
- Check backend logs for API errors
- Review Google Cloud Console for API usage
- Verify GPS accuracy in test location
- Check network connectivity

## Summary

This implementation provides a robust route deviation detection and automatic rerouting system that:
- ✅ Continuously tracks driver GPS location
- ✅ Detects deviations with configurable threshold
- ✅ Automatically reroutes using Google Maps API
- ✅ Notifies admin of deviations
- ✅ Preserves original route for comparison
- ✅ Handles errors gracefully
- ✅ Minimizes API usage with cooldown periods
- ✅ Filters inaccurate GPS readings
- ✅ Provides visual feedback to drivers
