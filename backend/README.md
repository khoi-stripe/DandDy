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

## Adventure (AI DM) - Debug Terminal

This repo includes a minimal Zork-like “AI DM” loop exposed as backend endpoints plus a simple debug HTML terminal.

### Configure narration (OpenAI first; Ollama optional)

In `backend/.env` (copy from `env.example`):
- `OPENAI_API_KEY=...`
- `NARRATION_PROVIDER=openai`
- `OPENAI_NARRATION_MODEL=gpt-4o-mini`

If you do not set `OPENAI_API_KEY`, the adventure will still run, but narration will fall back to deterministic text.

### Run locally

- Start backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Serve the frontend (so the debug page is on `http://localhost:8080` which matches backend CORS defaults).

Then open:
- `debug/adventure-terminal.html` (via the frontend server)

### How to play

1. Log in with an existing account (uses `POST /api/auth/login`).
2. Select a character and campaign (optional).
3. Click **Start Adventure**.
4. Type commands like:
   - `look`
   - `north` / `south` / `east` / `west` (or `n/s/e/w`)
   - `take torch`
   - `use healing potion`
   - `inventory`
   - `rest`
   - `attack`

The backend updates the character’s `experience_points`, `level`, and `hit_points_current` as you play.


