# DandDy Development Guide

## Port Standard (Hardened & Locked)

These ports are **standardized and hardcoded** for consistency and security:

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **Backend API** | `8000` | `http://localhost:8000` | FastAPI backend server |
| **Frontend** | `8080` | `http://localhost:8080` | Character Builder & Manager |

### Why These Ports?

- **8000**: Standard for FastAPI/Django backends
- **8080**: Standard alternative HTTP port, won't conflict with backend
- **Hardcoded**: No confusion about which port to use
- **CORS Secured**: Backend only accepts requests from port 8080

---

## Quick Start Commands

### Start Everything at Once (Recommended)

```bash
./start-dev.sh
```

**What it does:**
- ✅ Starts backend on port 8000
- ✅ Starts frontend on port 8080
- ✅ Auto-kills existing processes if ports are in use
- ✅ Creates log files (`backend.log`, `frontend.log`)
- ✅ Shows URLs to access
- ✅ Press **Ctrl+C** once to stop both servers

### Start Separately (Two Terminals)

**Terminal 1 - Backend:**
```bash
./start-backend.sh
```

**Terminal 2 - Frontend:**
```bash
./start-frontend.sh
```

### Manual Start (No Scripts)

**Backend:**
```bash
cd backend
source venv/bin/activate
python main.py
```

**Frontend:**
```bash
python3 -m http.server 8080
```

---

## Access Points

Once servers are running:

| What | URL |
|------|-----|
| **Character Manager** | http://localhost:8080/character-manager.html |
| **Character Builder** | http://localhost:8080/character-builder/index.html |
| **Backend API Docs** | http://localhost:8000/docs |
| **Backend Health** | http://localhost:8000/api/health |

---

## First Time Setup

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Return to project root
cd ..
```

### Frontend Setup

No setup needed! Just serve the static files.

---

## CORS Security Configuration

**Hardened CORS - Only allows:**
- ✅ `http://localhost:8080` (frontend)
- ✅ `http://127.0.0.1:8080` (same, alternate notation)
- ❌ **No wildcards** (`["*"]`)
- ❌ **No other ports or origins**

**Location:** `backend/main.py` lines 20-35

**Local Development:**
```python
allowed_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080"
]
```

**Production (Render):**
```python
# Configured origins from environment variable
allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")

# Plus localhost:8080 for testing
allowed_origins.extend([
    "http://localhost:8080",
    "http://127.0.0.1:8080"
])
```

---

## Troubleshooting

### Port Already in Use

**Scripts handle this automatically:**
- Detects if port 8000 or 8080 is in use
- Prompts to kill existing process
- Auto-cleanup on exit

**Manual fix:**
```bash
# Kill process on port 8000 (backend)
lsof -ti:8000 | xargs kill -9

# Kill process on port 8080 (frontend)
lsof -ti:8080 | xargs kill -9
```

### Backend Won't Start

**Check logs:**
```bash
tail -f backend.log
```

**Common issues:**
1. **Database schema mismatch**
   ```bash
   rm backend/danddy.db
   ./start-backend.sh
   ```

2. **Missing dependencies**
   ```bash
   cd backend
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Virtual environment not activated**
   ```bash
   cd backend
   source venv/bin/activate
   ```

### Frontend Won't Start

**Check logs:**
```bash
tail -f frontend.log
```

**Manual start:**
```bash
python3 -m http.server 8080
```

### CORS Errors in Browser

**Error message:**
```
Access to fetch at 'http://localhost:8000/api/...' from origin 
'http://localhost:XXXX' has been blocked by CORS policy
```

**Cause:** Frontend is running on wrong port (not 8080)

**Fix:** Make sure frontend is on port 8080:
```bash
./start-frontend.sh
```

Or manually:
```bash
python3 -m http.server 8080
```

---

## Database Management

### Location
- **Local:** `backend/danddy.db` (SQLite)
- **Production:** PostgreSQL on Render

### Reset Local Database

**⚠️ WARNING: This deletes all local accounts and characters!**

```bash
cd backend
rm danddy.db
cd ..
./start-backend.sh
```

Backend will auto-create a fresh database with correct schema.

### Backup Database

```bash
cd backend
cp danddy.db danddy.db.backup-$(date +%Y%m%d-%H%M%S)
```

### Restore Database

```bash
cd backend
cp danddy.db.backup-YYYYMMDD-HHMMSS danddy.db
```

---

## Production Deployment

### Environment Variables (Render)

| Variable | Value | Purpose |
|----------|-------|---------|
| `PRODUCTION` | `true` | Enables production mode |
| `ALLOWED_ORIGINS` | `https://your-site.com` | Frontend URLs (comma-separated) |
| `DATABASE_URL` | (auto) | PostgreSQL connection |

### Deploy Backend to Render

```bash
# Commit changes
git add .
git commit -m "Your changes"

# Push to GitHub (triggers Render deploy)
git push origin main
```

Render auto-deploys from GitHub (takes 2-3 minutes).

### Deploy Frontend (Static)

**Options:**
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

Update `ALLOWED_ORIGINS` in Render to include your deployed frontend URL.

---

## Development Workflow

### Starting Your Day

```bash
cd /Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy
./start-dev.sh
```

### Making Changes

1. **Edit files** (code updates)
2. **Backend changes:** Restart backend (Ctrl+C, then `./start-backend.sh`)
3. **Frontend changes:** Just refresh browser (Ctrl+Shift+R)

### Ending Your Day

Press **Ctrl+C** in the terminal running `start-dev.sh`

### Committing Changes

```bash
git add .
git commit -m "Description of changes"
git push origin main
```

---

## File Structure Reference

```
_DandDy/
├── backend/
│   ├── main.py              # FastAPI app (port 8000)
│   ├── danddy.db            # SQLite database
│   ├── models/              # Database models
│   ├── routes/              # API endpoints
│   ├── schemas/             # Pydantic schemas
│   └── requirements.txt     # Python dependencies
│
├── character-builder/
│   ├── index.html           # Builder entry point
│   ├── character-builder-*.js  # Builder modules
│   └── character-builder.css
│
├── character-manager.html   # Manager entry point
├── character-manager.js     # Manager logic
├── character-manager-api.js # Manager API calls
├── shared-character-sheet.js # Shared sheet component
│
├── start-dev.sh            # Start both servers
├── start-backend.sh        # Start backend only
├── start-frontend.sh       # Start frontend only
│
├── DEVELOPMENT_GUIDE.md    # This file
├── QUICK_START.md          # Quick reference
└── PORT_STANDARD.md        # Port allocation
```

---

## Important Notes

### Accounts & Data Separation

**Local (Localhost):**
- Database: `backend/danddy.db`
- Backend: `http://localhost:8000`
- Accounts: Stored locally
- **Deleted when you delete `danddy.db`**

**Production (Render):**
- Database: PostgreSQL on Render
- Backend: `https://danddy-api.onrender.com`
- Accounts: Stored in cloud
- **Safe and persistent**

**They are completely separate!** An account on localhost doesn't exist on production (and vice versa).

### NEVER Change Ports

The ports are **hardcoded throughout the application:**
- Backend CORS config
- Frontend API URLs
- Launch scripts
- Documentation

**Changing ports will break CORS and require updates in multiple files.**

### Always Use Launch Scripts

The scripts ensure:
- ✅ Correct ports (8000 & 8080)
- ✅ Auto-cleanup of existing processes
- ✅ Proper error handling
- ✅ Log file creation
- ✅ Clean shutdown

---

## Quick Reference Card

**Start everything:**
```bash
./start-dev.sh
```

**Access URLs:**
- Manager: http://localhost:8080/character-manager.html
- Builder: http://localhost:8080/character-builder/index.html
- API Docs: http://localhost:8000/docs

**Stop servers:**
- Press `Ctrl+C`

**Reset database:**
```bash
rm backend/danddy.db && ./start-backend.sh
```

**Check logs:**
```bash
tail -f backend.log    # Backend errors
tail -f frontend.log   # Frontend errors
```

**Ports:**
- Backend: 8000
- Frontend: 8080
- **Never change these!**

---

---

## UI Component Patterns

### Selector Menus (Dropdowns/Listboxes)

**All selector menus use `CharacterSheet.toggleSelectorMenu()`** from `shared-character-sheet.js`. This function handles:
- Positioning (viewport-aware, opens above/below based on space)
- Modal support (detaches to `<body>` to escape CSS transforms and overflow)
- Height constraints (auto-sizes to available space with scrolling)
- Theming (applies correct colors when detached from modal context)
- Accessibility (keyboard nav, focus management, ARIA)

**Canonical markup:**
```html
<div class="selector-shell">
  <button class="terminal-btn selector-trigger"
          onclick="CharacterSheet.toggleSelectorMenu(this)"
          aria-haspopup="listbox" aria-expanded="false">
    <span class="selector-trigger-label">Selected Value</span>
  </button>
  <div class="selector-menu" role="listbox" aria-hidden="true">
    <button class="selector-option" role="option" data-value="...">
      <span class="selector-option-label">Option Text</span>
    </button>
  </div>
</div>
```

### Modals with Selectors

**⚠️ NEVER set `overflow: visible` on modals.** The old pattern of using `overflow: visible` to prevent dropdown clipping breaks modal scrolling.

**The correct approach:**
1. Use standard modal markup (`.modal` > `.modal-content` > `.modal-body`)
2. Selectors inside modals work automatically - they're detached to `<body>`
3. Only override needed: `.your-modal .selector-menu { z-index: 999; }`

See `docs/OVERFLOW_BUTTON_SYSTEM.md` for detailed patterns.

---

## Summary

✅ **Ports are standardized:** Backend `8000`, Frontend `8080`  
✅ **CORS is hardened:** Only allows port 8080  
✅ **Launch scripts provided:** `start-dev.sh` starts everything  
✅ **Auto-cleanup:** Scripts handle port conflicts  
✅ **Well documented:** This guide has everything  

**Always use `./start-dev.sh` to start development!**

