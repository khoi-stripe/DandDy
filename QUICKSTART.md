# Quick Start Guide

Get DandDy (iOS & macOS) up and running in 5 minutes!

## Backend (Terminal)

```bash
# 1. Create database
createdb dandy_db

# 2. Set up Python environment
cd backend
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env - set DATABASE_URL and generate SECRET_KEY

# 5. Start server
uvicorn main:app --reload
```

Backend should now be running at http://localhost:8000

## iOS App (Xcode)

1. Open Xcode
2. File → New → Project → iOS App
3. Name: `DandDy`, Interface: SwiftUI, Language: Swift
4. Add all files from `DandDy/` folder to project
5. Update `Config.swift` with backend URL (http://localhost:8000)
6. Add `Info.plist` to project
7. Select iPhone simulator
8. Build and Run (⌘R)

## macOS App (Xcode)

1. Open Xcode
2. File → New → Project → macOS App
3. Name: `DandDy-macOS`, Interface: SwiftUI, Language: Swift
4. Add all files from `DandDy-macOS/` folder to project
5. Add shared files from `DandDy/` (Models, Services, ViewModels, Utilities)
   - **Important**: Don't copy, just reference them (uncheck "Copy items")
6. Select "My Mac" as target
7. Build and Run (⌘R)

See `MACOS_SETUP.md` for detailed instructions.

## First Time Use

1. **Register an account**
   - Email: test@example.com
   - Username: testplayer
   - Password: password123
   - Role: Player

2. **Create a character**
   - Tap + in Characters tab
   - Follow the creation wizard
   - Choose race, class, and abilities

3. **Start playing!**
   - View character sheet
   - Track HP in combat
   - Manage inventory and spells

## Testing Tips

**Test the API:**
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}

curl http://localhost:8000/docs
# Opens interactive API documentation
```

**Quick Database Check:**
```bash
psql dandy_db -c "SELECT * FROM users;"
psql dandy_db -c "SELECT name, race, character_class FROM characters;"
```

## Common Issues

**"Database does not exist"**
→ Run `createdb dandy_db`

**"Connection refused"**
→ Start PostgreSQL: `brew services start postgresql@14`

**iOS can't connect**
→ Make sure backend is running and URL in Config.swift is correct

**Physical device can't connect**
→ Use your Mac's IP instead of localhost:
```bash
ipconfig getifaddr en0  # Get your IP
# Update Config.swift: http://YOUR_IP:8000
```

## What's Included

### Both iOS & macOS
✅ Full character creation with D&D 5e rules  
✅ Character sheet with all stats  
✅ Combat tracking (HP, conditions, death saves)  
✅ Inventory and currency management  
✅ Spell tracking with slots  
✅ Campaign organization  
✅ Multi-user support (Player & DM roles)  
✅ Secure authentication  

### macOS Exclusive Features
✅ Three-pane layout (sidebar + list + detail)  
✅ Menu bar integration  
✅ Keyboard shortcuts (⌘N, ⌘D, etc.)  
✅ Multi-window support  
✅ Settings window (⌘,)  
✅ Context menus  

### Platform Comparison
| Feature | iOS | macOS |
|---------|-----|-------|
| Navigation | Tab bar | Sidebar |
| Layout | Single column | Three-pane |
| Input | Touch | Mouse + Keyboard |
| Windows | Single | Multiple |
| Shortcuts | None | Full keyboard support |

Happy adventuring! 🎲📱🖥️

