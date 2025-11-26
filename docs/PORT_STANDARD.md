# Port Standard for DandDy

## Local Development Ports

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **Backend API** | `8000` | `http://localhost:8000` | FastAPI backend server |
| **Frontend** | `8080` | `http://localhost:8080` | Character Builder & Manager |

## Production

| Service | URL | Purpose |
|---------|-----|---------|
| **Backend API** | `https://danddy-api.onrender.com` | Deployed FastAPI backend |
| **Frontend** | (Configure as needed) | Deployed static site |

## Quick Start Commands

### Start Backend (Port 8000)
```bash
cd backend
source venv/bin/activate
python main.py
```

### Start Frontend (Port 8080)
```bash
# From project root
python3 -m http.server 8080
```

## Why These Ports?

- **8000**: Standard for FastAPI/Django backends
- **8080**: Standard alternative HTTP port, won't conflict with backend

## CORS Configuration

Backend allows requests from:
- `http://localhost:8080` (local frontend)
- `http://127.0.0.1:8080` (local frontend alternative)
- Production frontend URLs (configure in Render environment)

