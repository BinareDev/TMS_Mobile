# Travel Management System for Cab Drivers

A comprehensive travel management system built with React Native (Expo), Python (Flask), and PostgreSQL. This application is designed specifically for cab drivers to manage trips, view maps, and receive notifications.

## Features

- **Authentication**: Driver login and signup with vehicle details
- **Trip Management**: View available trips, accept/reject trips, complete trips
- **Map Integration**: Real-time location tracking and route visualization
- **Notifications**: In-app notifications for trip requests and updates
- **Dashboard**: Overview of available trips, notifications, and quick actions

## Tech Stack

### Frontend
- React Native (Expo)
- Expo Router for navigation
- React Native Maps for map functionality
- Expo Location for GPS tracking
- Axios for API communication

### Backend
- Python Flask
- SQLite database (for easy development)
- Flask-SQLAlchemy for ORM
- Flask-CORS for cross-origin requests

## Prerequisites

- Node.js (v18 or higher)
- Python (v3.8 or higher)
- Expo CLI
- Android Studio / Xcode (for mobile development)

## Setup Instructions

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the backend server**
   ```bash
   python app.py
   ```
   The API will be available at `http://localhost:5000`

   **Note:** The backend uses SQLite by default. The database file `travel_management.db` will be created automatically.

### Frontend Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the Expo development server**
   ```bash
   npx expo start
   ```

3. **Run on your preferred platform**
   - Press `a` for Android emulator
   - Press `i` for iOS simulator
   - Scan QR code with Expo Go app for physical device

## API Endpoints

### Authentication
- `POST /api/signup` - Create new driver account
- `POST /api/login` - Login driver

### Trips
- `GET /api/trips` - Get all trips (filter by status and driver_id)
- `POST /api/trips` - Create new trip
- `POST /api/trips/<id>/accept` - Accept a trip
- `POST /api/trips/<id>/reject` - Reject a trip
- `POST /api/trips/<id>/complete` - Complete a trip

### Notifications
- `GET /api/notifications/<user_id>` - Get user notifications
- `POST /api/notifications/<id>/read` - Mark notification as read

## App Screens

1. **Login Screen** (`app/(tabs)/index.tsx`)
   - Driver authentication
   - Links to signup page

2. **Signup Screen** (`app/signup.tsx`)
   - Driver registration
   - Vehicle and license details

3. **Dashboard** (`app/screens/dashboard.tsx`)
   - Overview of trips and notifications
   - Quick access to all features

4. **Trips Screen** (`app/screens/trips.tsx`)
   - List of available/accepted/completed trips
   - Accept/reject functionality
   - Status filtering

5. **Trip Details** (`app/screens/trip-details.tsx`)
   - Detailed trip information
   - Route map visualization
   - Passenger details

6. **Map Screen** (`app/screens/map.tsx`)
   - Real-time location tracking
   - Current location display

7. **Notifications** (`app/screens/notifications.tsx`)
   - List of all notifications
   - Mark as read functionality
   - Trip request alerts

## Database Schema

### Users Table
- id, name, email, password, phone
- vehicle_number, license_number
- is_driver, created_at

### Trips Table
- id, passenger_name, passenger_phone
- pickup_location, pickup_lat, pickup_lng
- dropoff_location, dropoff_lat, dropoff_lng
- status, fare, distance
- driver_id, created_at, accepted_at, completed_at

### Notifications Table
- id, user_id, title, message
- type, is_read, trip_id
- created_at

## Usage

1. **Start the backend server** (from backend directory)
   ```bash
   python app.py
   ```

2. **Start the frontend** (from project root)
   ```bash
   npx expo start
   ```

3. **Create a driver account**
   - Open the app
   - Click "Sign up"
   - Fill in driver details

4. **Login and start using**
   - Login with your credentials
   - View available trips on dashboard
   - Accept/reject trips
   - View notifications
   - Track location on map

## Development Notes

- The backend runs on port 5000
- The frontend uses Expo Router for navigation
- Location permissions are required for map functionality
- In production, use proper authentication tokens (JWT)
- Consider using AsyncStorage for persistent login sessions

## Troubleshooting

**Backend connection issues:**
- Ensure PostgreSQL is running
- Check DATABASE_URL in backend/app.py
- Verify backend server is running on port 5000

**Map not displaying:**
- Ensure location permissions are granted
- Check Google Maps API key configuration (if needed)
- Verify expo-location and react-native-maps are installed

**Build errors:**
- Run `npm install` to ensure all dependencies are installed
- Clear Expo cache: `npx expo start -c`
- Check Node.js version compatibility

## License

This project is for demonstration purposes.
