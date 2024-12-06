# IRCTC Railway Management System API

A simple railway management system API built with Bun, Elysia, and PostgreSQL.

## Prerequisites

- Bun runtime
- PostgreSQL
- Node.js version 18+

## Installation

1. Install Bun (if not already installed):
```bash
curl -fsSL https://bun.sh/install | bash
```

2. Clone the repository:
```bash
git clone <repository-url>
cd irctc-api
```

3. Install dependencies:
```bash
bun install
```

4. Create a PostgreSQL database:
```bash
createdb irctc_db
```

5. Create a `.env` file in the project root:
```env
JWT_SECRET=your_secure_secret_here
ADMIN_API_KEY=your_secure_admin_key_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=irctc_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

## Running the Application

Start the server:
```bash
bun run index.ts
```

The server will run on http://localhost:3000

## API Endpoints

### 1. Register User
```bash
curl -X POST http://localhost:3000/api/register \
-H "Content-Type: application/json" \
-d '{
  "username": "admin",
  "password": "admin123",
  "isAdmin": true
}'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/login \
-H "Content-Type: application/json" \
-d '{
  "username": "admin",
  "password": "admin123"
}'
```

### 3. Add Train (Admin only)
```bash
curl -X POST http://localhost:3000/api/trains \
-H "Content-Type: application/json" \
-H "x-api-key: your_secure_admin_key_here" \
-d '{
  "trainNumber": "12345",
  "source": "Mumbai",
  "destination": "Delhi",
  "totalSeats": 50
}'
```

### 4. Check Availability
```bash
curl -X GET "http://localhost:3000/api/availability?source=Mumbai&destination=Delhi"
```

### 5. Book a Seat
```bash
export TOKEN="your_jwt_token"

curl -X POST http://localhost:3000/api/bookings \
-H "Content-Type: application/json" \
-H "Cookie: auth=$TOKEN" \
-d '{
  "trainId": 1
}'
```

### 6. Get Booking Details
```bash
curl -X GET http://localhost:3000/api/bookings/1 \
-H "Cookie: auth=$TOKEN"
```

## Features

- User registration and authentication
- JWT-based authorization
- Admin-only train management
- Real-time seat availability
- Race condition handling for concurrent bookings
- Secure password hashing
- Database transaction support

## Security Features

- Password hashing using Bun's built-in functions
- JWT-based authentication
- Admin API key protection
- HTTP-only cookies
- SQL injection protection
- Race condition handling

## API Response Formats

### Success Responses:

1. User Registration:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "isAdmin": true
  }
}
```

2. Login:
```json
{
  "success": true,
  "token": "jwt_token",
  "user": {
    "id": 1,
    "username": "admin",
    "isAdmin": true
  }
}
```

3. Train Addition:
```json
{
  "success": true,
  "train": {
    "id": 1,
    "trainNumber": "12345",
    "source": "Mumbai",
    "destination": "Delhi",
    "totalSeats": 50
  }
}
```

4. Booking:
```json
{
  "success": true,
  "booking": {
    "id": 1,
    "userId": 1,
    "trainId": 1,
    "seatNumber": 1,
    "bookingDate": "2024-12-06T..."
  }
}
```

## Error Handling

- Duplicate usernames/train numbers
- Invalid credentials
- Authentication failures
- No seats available
- Train not found
- Invalid booking details

## Notes

- The database is reinitialized each time the server starts
- Admin API key should be kept secure
- JWT tokens expire after 24 hours
- Passwords are securely hashed before storage
