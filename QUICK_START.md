# Quick Start Guide

## Standard Port Allocation

- **Backend API**: Port `8000` - `http://localhost:8000`
- **Frontend**: Port `8080` - `http://localhost:8080`

These ports are hardcoded for consistency and security.

## Starting the Development Environment

### Option 1: Start Everything at Once (Recommended)

```bash
./start-dev.sh
```

This will:
- ✅ Start backend on port 8000
- ✅ Start frontend on port 8080
- ✅ Show you the URLs to access
- ✅ Automatically cleanup when you press Ctrl+C

### Option 2: Start Separately

**Terminal 1 - Backend:**
```bash
./start-backend.sh
```

**Terminal 2 - Frontend:**
```bash
./start-frontend.sh
```

## First Time Setup

If you haven't set up the backend yet:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

## Accessing the Application

Once both servers are running:

- **Character Manager**: http://localhost:8080/character-manager.html
- **Character Builder**: http://localhost:8080/character-builder/index.html
- **Backend API Docs**: http://localhost:8000/docs

## Stopping the Servers

- If using `start-dev.sh`: Press **Ctrl+C** once (will stop both servers)
- If running separately: Press **Ctrl+C** in each terminal

## Troubleshooting

### "Port already in use"

The scripts will automatically detect and offer to kill existing processes on the required ports.

### Backend won't start

Check `backend.log`:
```bash
tail -f backend.log
```

Common issues:
- Database schema issues (delete `backend/danddy.db` and restart)
- Missing dependencies (`pip install -r backend/requirements.txt`)

### Frontend won't start

Check `frontend.log`:
```bash
tail -f frontend.log
```

Or just run manually:
```bash
python3 -m http.server 8080
```

## Production Deployment

See [HEROKU_DEPLOYMENT.md](HEROKU_DEPLOYMENT.md) or [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md)

## Port Security

CORS is configured to **only** allow:
- `http://localhost:8080`
- `http://127.0.0.1:8080`
- Production frontend URLs (configured via environment variables)

This prevents unauthorized access from random websites.

