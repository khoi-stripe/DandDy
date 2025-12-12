# DandDy Backend API

Backend API for the D&D 5e Character Management iOS app.

## Setup

### Prerequisites

- Python 3.10+
- PostgreSQL 14+

### Installation

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up PostgreSQL database:
```bash
createdb dandy_db
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials and secret key
```

5. Run the server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and get access token
- `GET /auth/me` - Get current user info

### Characters
- `POST /characters/` - Create a new character
- `GET /characters/` - Get all characters for current user
- `GET /characters/{id}` - Get a specific character
- `PUT /characters/{id}` - Update a character
- `DELETE /characters/{id}` - Delete a character

### Campaigns
- `POST /campaigns/` - Create a new campaign (DM only)
- `GET /campaigns/` - Get all campaigns
- `GET /campaigns/{id}` - Get a specific campaign with characters
- `PUT /campaigns/{id}` - Update a campaign
- `DELETE /campaigns/{id}` - Delete a campaign

## Database Schema

### Users
- Email, username, password (hashed)
- Role: Player or DM

### Characters
- Full D&D 5e character attributes
- Ability scores, HP, AC, skills
- Inventory, spells, conditions
- Linked to user (owner) and optionally to campaign

### Campaigns
- Name, description
- Owned by DM
- Contains multiple characters

## Development

Run with auto-reload:
```bash
uvicorn main:app --reload
```

## AI Rate Limiting

The API includes smart rate limiting for AI endpoints to control costs:

- **Development Mode** (default): Unlimited requests for everyone
- **Production Mode**: Regular users limited, admins unlimited
- **User-based tracking**: More accurate than IP-based limiting
- **Admin exemption**: Admins bypass all rate limits

### Quick Setup

Make yourself an admin (recommended):
```bash
python make_admin.py your@email.com
```

For complete details, see:
- **Quick Start**: `RATE_LIMIT_QUICK_START.md`
- **Full Documentation**: `RATE_LIMITING.md`

## Testing

The API can be tested using:
- Swagger UI at `/docs`
- cURL or Postman
- iOS app client


