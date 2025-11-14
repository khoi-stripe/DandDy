# DandDy - D&D 5e Character Manager

A comprehensive **iOS** and **macOS** application for managing Dungeons & Dragons 5th Edition characters, built with SwiftUI and a Python FastAPI backend.

## Features

### Character Management
- **Full Character Creation Wizard**
  - Choose from all D&D 5e SRD races and classes
  - Roll or manually assign ability scores
  - Select skills based on class
  - Add personality traits, backstory, and appearance
  
- **Comprehensive Character Sheet**
  - Complete ability scores with modifiers
  - Skills and saving throws with proficiency tracking
  - Combat stats (AC, Initiative, Speed, Proficiency Bonus)
  
- **Combat Tracking**
  - HP management (current, max, temporary)
  - Death saving throws
  - Conditions tracking
  - Damage and healing calculators

- **Inventory Management**
  - Track items with weight and descriptions
  - Currency management (CP, SP, EP, GP, PP)
  - Weight calculations

- **Spell Management**
  - Spell slot tracking by level
  - Known spells and prepared spells
  - Spell save DC and attack bonus

### Campaign Features
- **Multi-User Support**
  - Player and Dungeon Master roles
  - Players manage their own characters
  - DMs can view all characters in their campaigns
  
- **Campaign Organization**
  - Create and manage campaigns
  - Group characters by campaign
  - Campaign descriptions and details

### Authentication
- Secure JWT-based authentication
- Keychain storage for tokens
- Role-based access control

## Tech Stack

### iOS & macOS Apps
- **SwiftUI** - Modern declarative UI framework (iOS 16+, macOS 13+)
- **MVVM Architecture** - Clean separation of concerns
- **URLSession** - Native networking
- **Keychain** - Secure token storage
- **Combine** - Reactive programming
- **Shared Codebase** - 80%+ code shared between iOS and macOS

### Backend
- **FastAPI** - High-performance Python web framework
- **PostgreSQL** - Robust relational database
- **SQLAlchemy** - ORM for database operations
- **JWT** - Secure authentication
- **Pydantic** - Data validation

## Project Structure

```
DandDy/
├── backend/                    # Python FastAPI backend
│   ├── database/              # Database configuration
│   ├── models/                # SQLAlchemy models
│   ├── routes/                # API endpoints
│   ├── schemas/               # Pydantic schemas
│   ├── utils/                 # Utility functions
│   └── main.py                # Application entry point
│
├── DandDy/                    # iOS SwiftUI app
│   ├── Models/                # Data models (shared)
│   ├── Views/                 # iOS-specific views
│   ├── ViewModels/            # View models (shared)
│   ├── Services/              # API services (shared)
│   ├── Utilities/             # Helper utilities (shared)
│   └── DandDyApp.swift        # iOS app entry point
│
└── DandDy-macOS/              # macOS SwiftUI app
    ├── Views/                 # macOS-specific views
    ├── DandDy_macOSApp.swift  # macOS app entry point
    └── (shares Models, Services, ViewModels from DandDy/)
```

## Setup Instructions

### Backend Setup

1. **Install Python 3.10+**
   ```bash
   python --version  # Verify installation
   ```

2. **Install PostgreSQL**
   ```bash
   # macOS
   brew install postgresql
   brew services start postgresql
   
   # Create database
   createdb dandy_db
   ```

3. **Set up Python virtual environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

4. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

5. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and generate a secret key
   ```

6. **Run the backend**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   The API will be available at `http://localhost:8000`
   API documentation: `http://localhost:8000/docs`

### iOS App Setup

1. **Requirements**
   - macOS 13.0 or later
   - Xcode 15.0 or later
   - iOS 16.0+ deployment target

2. **Open the project**
   ```bash
   cd DandDy
   open DandDy.xcodeproj  # or open in Xcode
   ```

3. **Configure API endpoint**
   - Open `Config.swift`
   - Update `baseURL` with your backend URL:
     - Simulator: `http://localhost:8000`
     - Physical device: Use your Mac's local IP (e.g., `http://192.168.1.XXX:8000`)

4. **Build and run**
   - Select your target device or simulator
   - Press `Cmd+R` to build and run

### macOS App Setup

1. **Requirements**
   - macOS 13.0 or later
   - Xcode 15.0 or later

2. **Create macOS project**
   - Follow instructions in `MACOS_SETUP.md`
   - Add macOS-specific files from `DandDy-macOS/`
   - Link shared code from `DandDy/` folder

3. **Build and run**
   - Select **My Mac** as target
   - Press `Cmd+R` to build and run

See `MACOS_SETUP.md` for detailed setup instructions.

## Usage

### First Time Setup

1. **Start the backend server**
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn main:app --reload
   ```

2. **Launch the iOS app**
   - Open in Xcode and run on simulator or device

3. **Create an account**
   - Choose "Register" on the login screen
   - Enter email, username, and password
   - Select role: Player or Dungeon Master

### Creating a Character

1. Tap the **+** button in the Characters tab
2. Follow the wizard:
   - **Basic Info**: Name, race, class, background, alignment
   - **Ability Scores**: Roll or manually set ability scores
   - **Skills**: Choose skills based on your class
   - **Personality**: Add appearance, backstory, and personality traits
   - **Review**: Confirm your choices
3. Tap **Create Character**

### Managing a Campaign (DM Only)

1. Go to the **Campaigns** tab
2. Tap the **+** button to create a campaign
3. Enter campaign name and description
4. Players can add characters to your campaign
5. View all characters in the campaign detail view

### Combat

1. Open a character sheet
2. Navigate to the **Combat** tab
3. Use the HP management tools:
   - Take damage or heal
   - Add temporary HP
   - Track death saves when at 0 HP
4. Add and remove conditions

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and receive token
- `GET /auth/me` - Get current user info

### Characters
- `POST /characters/` - Create character
- `GET /characters/` - List user's characters
- `GET /characters/{id}` - Get character details
- `PUT /characters/{id}` - Update character
- `DELETE /characters/{id}` - Delete character

### Campaigns
- `POST /campaigns/` - Create campaign (DM only)
- `GET /campaigns/` - List campaigns
- `GET /campaigns/{id}` - Get campaign with characters
- `PUT /campaigns/{id}` - Update campaign (DM only)
- `DELETE /campaigns/{id}` - Delete campaign (DM only)

## D&D 5e SRD Content

The app includes data from the D&D 5e System Reference Document (SRD):
- 9 races (Dwarf, Elf, Halfling, Human, Dragonborn, Gnome, Half-Elf, Half-Orc, Tiefling)
- 12 classes (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard)
- 18 skills
- 13 backgrounds
- 15 conditions

## Future Enhancements

- [ ] AI Dungeon Master integration
- [ ] Dice rolling with animations
- [ ] Character leveling system
- [ ] Equipment and weapon management
- [ ] Spell database with descriptions
- [ ] Initiative tracker for DMs
- [ ] Character portraits and avatars
- [ ] Export/import characters
- [ ] Offline mode with sync
- [ ] Push notifications for campaign updates

## Contributing

This is a personal project, but suggestions and feedback are welcome!

## License

This project is for personal use. D&D 5e content is used under the terms of the Open Game License (OGL).

## Acknowledgments

- Wizards of the Coast for D&D 5e
- D&D 5e System Reference Document (SRD)

