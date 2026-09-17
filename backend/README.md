# Travel Management System - Backend

## Setup Instructions

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python app.py
```

The API will be available at `http://localhost:5000`

**Note:** This project uses SQLite for easier development. The database file `travel_management.db` will be created automatically in the backend directory. If you want to use PostgreSQL instead, set the `DATABASE_URL` environment variable.

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
