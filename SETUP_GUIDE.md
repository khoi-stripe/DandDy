# DandDy Setup Guide

This guide will walk you through setting up the DandDy D&D Character Manager from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:

### For Backend:
- **Python 3.10 or later** - [Download Python](https://www.python.org/downloads/)
- **PostgreSQL 14 or later** - [Download PostgreSQL](https://www.postgresql.org/download/)

### For iOS App:
- **macOS 13.0 or later**
- **Xcode 15.0 or later** - [Download from Mac App Store](https://apps.apple.com/us/app/xcode/id497799835)
- **iOS 16.0+ device or simulator**

## Backend Setup (Step-by-Step)

### 1. Install PostgreSQL

**On macOS (using Homebrew):**
```bash
# Install Homebrew if you haven't already
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PostgreSQL
brew install postgresql@14

# Start PostgreSQL service
brew services start postgresql@14
```

**On macOS (using Postgres.app):**
- Download from [Postgres.app](https://postgresapp.com/)
- Install and launch the application
- Initialize a new PostgreSQL server

### 2. Create Database

```bash
# Create the database
createdb dandy_db

# Verify database was created
psql -l | grep dandy_db
```

### 3. Set Up Python Environment

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Verify activation (should show path to venv)
which python
```

### 4. Install Python Dependencies

```bash
# Make sure you're in the backend directory with venv activated
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Generate a secure secret key
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Edit `.env` file with your configuration:
```env
DATABASE_URL=postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/dandy_db
SECRET_KEY=YOUR_GENERATED_SECRET_KEY_HERE
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

**To find your PostgreSQL username:**
```bash
whoami  # Usually your system username for local PostgreSQL
```

**Default PostgreSQL settings (Postgres.app or Homebrew):**
- Username: Your system username
- Password: (usually blank for local development)
- Host: localhost
- Port: 5432

Example for user "khoi":
```env
DATABASE_URL=postgresql://khoi:@localhost:5432/dandy_db
```

### 6. Initialize Database Tables

The tables will be created automatically when you first run the app, but you can verify:

```bash
# Start the server
uvicorn main:app --reload

# In another terminal, check if it's working
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

### 7. Verify Backend Installation

Open your browser and go to:
- API: http://localhost:8000
- Interactive API Docs: http://localhost:8000/docs
- Alternative Docs: http://localhost:8000/redoc

## iOS App Setup (Step-by-Step)

### 1. Install Xcode

1. Open the **Mac App Store**
2. Search for **Xcode**
3. Click **Get** or **Install**
4. Wait for download and installation (it's large, ~7GB)

### 2. Configure Project for iOS

Since there's no Xcode project file yet, you'll need to create one:

1. **Open Xcode**
2. **Create a new Xcode project:**
   - File → New → Project
   - Choose **iOS** → **App**
   - Click **Next**

3. **Configure project settings:**
   - Product Name: `DandDy`
   - Team: Select your Apple ID (or None for simulator only)
   - Organization Identifier: `com.yourname.dandy`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: **None**
   - Click **Next**

4. **Save in the DandDy folder**

5. **Add existing files to project:**
   - Right-click on DandDy folder in Xcode
   - Add Files to "DandDy"...
   - Select all folders: Models, Views, ViewModels, Services, Utilities
   - Make sure "Copy items if needed" is checked
   - Add Config.swift, ContentView.swift, DandDyApp.swift

### 3. Configure API Connection

1. Open `Config.swift`
2. Update the `baseURL`:

**For iOS Simulator:**
```swift
static let baseURL = "http://localhost:8000"
```

**For Physical Device:**
First, find your Mac's IP address:
```bash
ipconfig getifaddr en0  # For WiFi
# or
ipconfig getifaddr en1  # For Ethernet
```

Then update Config.swift:
```swift
static let baseURL = "http://192.168.1.XXX:8000"  // Use your actual IP
```

### 4. Configure Info.plist for Network Access

The Info.plist file is already configured to allow local network connections for development.

### 5. Build and Run

1. **Select a target:**
   - Top bar of Xcode: Choose a simulator (e.g., "iPhone 15 Pro")
   - Or connect your iOS device and select it

2. **Run the app:**
   - Click the ▶️ Play button
   - Or press `Cmd+R`

3. **First build will take a few minutes**

## Testing the Setup

### 1. Start the Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

### 2. Launch the iOS App

- In Xcode, press `Cmd+R`
- The app should launch in the simulator

### 3. Create Your First Account

1. On the login screen, tap **"Don't have an account? Register"**
2. Fill in:
   - Email: `test@example.com`
   - Username: `testuser`
   - Password: `password123`
   - Role: **Player**
3. Tap **Register**

### 4. Create Your First Character

1. Go to the **Characters** tab
2. Tap the **+** button
3. Follow the character creation wizard
4. Complete all steps and create your character

### 5. Verify Backend Database

```bash
# Connect to database
psql dandy_db

# View users
SELECT * FROM users;

# View characters
SELECT id, name, race, character_class, level FROM characters;

# Exit psql
\q
```

## Troubleshooting

### Backend Issues

**Problem: "Database does not exist"**
```bash
createdb dandy_db
```

**Problem: "Connection refused to localhost:5432"**
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Start if not running
brew services start postgresql@14
```

**Problem: "ModuleNotFoundError"**
```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### iOS Issues

**Problem: "Cannot connect to backend"**
- Make sure backend is running (`uvicorn main:app --reload`)
- Check `Config.swift` has correct URL
- For physical device, use Mac's IP address, not localhost

**Problem: "Build failed"**
- Clean build folder: `Cmd+Shift+K`
- Rebuild: `Cmd+B`

**Problem: "Code signing error"**
- Select your Apple ID in project settings → Signing & Capabilities
- Or select "Automatically manage signing"

**Problem: "The app installs but crashes on launch"**
- Check Xcode console for error messages
- Verify Info.plist is properly configured
- Make sure all files are added to the target

### Database Issues

**Problem: "Can't connect to database"**
Check your connection string in `.env`:
```bash
# Test connection
psql "postgresql://username@localhost:5432/dandy_db"
```

**Problem: "Authentication failed"**
Update `.env` with correct credentials:
```env
DATABASE_URL=postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/dandy_db
```

## Next Steps

Once everything is set up:

1. **Create a campaign** (if you're a DM)
2. **Create multiple characters** to test features
3. **Try combat tracking** - damage, healing, death saves
4. **Experiment with spells and inventory**
5. **Invite friends** to create accounts and join your campaign

## Development Tips

### Backend Development

```bash
# Run with auto-reload for development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# View logs in real-time
# Logs appear in terminal where you run uvicorn

# Test API endpoints
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"test","password":"test123","role":"player"}'
```

### iOS Development

- Use `Cmd+R` to build and run
- Use `Cmd+.` to stop the app
- Use `Cmd+Shift+K` to clean build folder
- View console output in Xcode's debug area (bottom panel)

### Database Management

```bash
# View all tables
psql dandy_db -c "\dt"

# View table structure
psql dandy_db -c "\d characters"

# Clear all data (useful for testing)
psql dandy_db -c "TRUNCATE users, characters, campaigns CASCADE"
```

## Getting Help

If you encounter issues:

1. Check the error messages in:
   - Xcode console (iOS)
   - Terminal where uvicorn is running (Backend)
   - PostgreSQL logs

2. Verify all services are running:
   - PostgreSQL
   - Backend API
   - iOS app

3. Review this setup guide for missing steps

Enjoy using DandDy for your D&D adventures! 🎲⚔️🐉


