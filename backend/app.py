from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import requests
import threading
import time
from datetime import datetime, timedelta, timezone
import uuid
import bcrypt
from sqlalchemy import or_


app = Flask(__name__)
CORS(app)

# Database configuration - using Render PostgreSQL for everything
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://agent_managment_system_user:prHKXAv6HBWK0JkDnRuF5lossFAvPehY@dpg-dah4g5142hec73eol01g-a.singapore-postgres.render.com/agent_managment_system'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class TripSchedule(db.Model):
    __tablename__ = "trip_schedules"
    id = db.Column(db.String, primary_key=True, index=True)
    agency_id = db.Column(db.String, nullable=True, index=True)
    user_id = db.Column(db.String, nullable=False)
    company_id = db.Column(db.String, nullable=False)
    vehicle_id = db.Column(db.String, nullable=True)
    driver_id = db.Column(db.String, nullable=True)
    company_name = db.Column(db.String, nullable=False)
    company_branch = db.Column(db.Text, nullable=True)
    start_date = db.Column(db.DateTime, nullable=True)
    end_date = db.Column(db.DateTime, nullable=True)
    end_time = db.Column(db.Time, nullable=True)
    starting_point = db.Column(db.String, nullable=True)
    end_point = db.Column(db.String, nullable=True)
    way = db.Column(db.String, nullable=True)
    trip_type = db.Column(db.String, nullable=True)
    passenger_count = db.Column(db.Integer, nullable=False, default=1)
    distance_km = db.Column(db.Float, nullable=True)
    duration_min = db.Column(db.Integer, nullable=True)
    starting_lat = db.Column(db.Float, nullable=True)
    starting_lng = db.Column(db.Float, nullable=True)
    end_lat = db.Column(db.Float, nullable=True)
    end_lng = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    status_updated_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=True)
    driver_response = db.Column(db.String, nullable=True)
    driver_reason = db.Column(db.Text, nullable=True)
    driver_response_at = db.Column(db.DateTime, nullable=True)
    route_point = db.Column(db.Text, nullable=True)
    status = db.Column(db.String, nullable=True, default='scheduled')
    one_way_start_time = db.Column(db.Time, nullable=True)
    two_way_start_time = db.Column(db.Time, nullable=True)
    one_way_is_active = db.Column(db.Boolean, nullable=True)
    two_way_is_active = db.Column(db.Boolean, nullable=True)
    driver_response_two_way = db.Column(db.String, nullable=True)
    driver_reason_two_way = db.Column(db.Text, nullable=True)


class PostgresAgency(db.Model):
    __tablename__ = 'agencies'
    id = db.Column(db.String, primary_key=True)
    agency_name = db.Column(db.String, nullable=False)
    status = db.Column(db.String)


# Models
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String, primary_key=True)
    agency_id = db.Column(db.String, nullable=True)
    company_id = db.Column(db.String, nullable=True)
    name = db.Column(db.String, nullable=False)
    email = db.Column(db.String, nullable=False)
    contact_number = db.Column(db.String, nullable=True)
    password_hash = db.Column(db.String, nullable=True)
    role = db.Column(db.String, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    last_login = db.Column(db.DateTime, nullable=True)
    reset_otp = db.Column(db.String, nullable=True)
    reset_otp_expires_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=True)
    reset_password_otp = db.Column(db.String(255), nullable=True)
    reset_password_otp_expires_at = db.Column(db.DateTime, nullable=True)

# // class PushToken(db.Model):
# //     __tablename__ = 'push_tokens'
# //     id = db.Column(db.Integer, primary_key=True)
# //     user_id = db.Column(db.String(100), unique=True, nullable=False)
# //     token = db.Column(db.String(255), nullable=False)
# //     platform = db.Column(db.String(20))
# //     created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Trip(db.Model):
    __tablename__ = 'trips'
    id = db.Column(db.Integer, primary_key=True)
    passenger_name = db.Column(db.String(100), nullable=False)
    passenger_phone = db.Column(db.String(20), nullable=False)
    pickup_location = db.Column(db.String(255), nullable=False)
    pickup_lat = db.Column(db.Float)
    pickup_lng = db.Column(db.Float)
    dropoff_location = db.Column(db.String(255), nullable=False)
    dropoff_lat = db.Column(db.Float)
    dropoff_lng = db.Column(db.Float)
    status = db.Column(db.String(20), default='pending')  # pending, accepted, rejected, completed
    fare = db.Column(db.Float)
    distance = db.Column(db.Float)
    driver_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=True)  # Changed to String to match User.id
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    accepted_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)



@app.route('/api/auth/agencies', methods=['GET'])
def get_agencies():
    try:
        active_agencies = PostgresAgency.query.filter_by(status='Active').all()
        return jsonify([
            {
                'id': agency.id,
                'agency_name': agency.agency_name
            } for agency in active_agencies
        ]), 200
    except Exception as e:
        print(f"Error querying Postgres agencies: {e}")
        return jsonify([]), 200

@app.route('/api/auth/login', methods=['POST'])
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}

    phone = data.get('username')
    password = data.get('password')
    agency_id = data.get('agency_id')

    if not phone or not password:
        return jsonify({
            'error': 'Phone number and password are required'
        }), 400

    user = User.query.filter_by(contact_number=phone).first()

    if not user:
        return jsonify({
            'error': 'Invalid phone number or password'
        }), 401

    if not user.password_hash:
        return jsonify({
            'error': 'Password is not configured for this user'
        }), 401

    try:
        password_valid = bcrypt.checkpw(
            password.encode('utf-8'),
            user.password_hash.encode('utf-8')
        )
    except (ValueError, TypeError):
        return jsonify({
            'error': 'Invalid password hash'
        }), 401

    if not password_valid:
        return jsonify({
            'error': 'Invalid phone number or password'
        }), 401

    return jsonify({
        'message': 'Login successful',

        # Your frontend currently expects this
        'access_token': user.id,

        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'phone': user.contact_number,
            'agency_id': user.agency_id,
            'company_id': user.company_id,
            'role': user.role,
            'is_active': user.is_active
        }
    }), 200


# Initialize database
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
