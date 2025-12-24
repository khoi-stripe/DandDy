# DandDy - Complete Design Document

> A D&D 5e character builder and manager with AI-powered portraits, campaign tracking, and collaborative features.

---

## Table of Contents

1. [Vision & Overview](#vision--overview)
2. [User Model](#user-model)
3. [Character System](#character-system)
4. [Campaign Tracking System](#campaign-tracking-system)
5. [AI Integration](#ai-integration)
6. [Frontend Architecture](#frontend-architecture)
7. [Backend Architecture](#backend-architecture)
8. [Database Design](#database-design)
9. [API Reference](#api-reference)
10. [Deployment & Infrastructure](#deployment--infrastructure)
11. [Security](#security)

---

## Vision & Overview

### What is DandDy?

DandDy is a **D&D 5e character management application** with two main components:

1. **Character Builder** - A terminal-themed, guided wizard for creating D&D 5e characters
2. **Character Manager** - A full-featured dashboard for managing characters across campaigns

### Core Philosophy

- **Character-centric** - Everything revolves around the character sheet
- **AI-enhanced** - Leverage AI for portraits, backstories, and names without making it feel automated
- **Retro aesthetic** - Terminal/monospace visual style with modern UX
- **Player-focused** - Built for players, not DMs (DM features are future considerations)

### Key Features

| Feature | Description |
|---------|-------------|
| **Guided Character Creation** | Step-by-step wizard with narrator commentary |
| **AI Portraits** | ASCII art and full images generated from character data |
| **Cloud Sync** | Characters sync across devices via user accounts |
| **Campaign Tracking** | Group characters together, track sessions, journal adventures |
| **Character Sharing** | Share characters via public links or invite collaborators |
| **Spell Management** | Full D&D 5e spell database with preparation tracking |
| **Combat Tracking** | HP, conditions, death saves, spell slots |

---

## User Model

### Account System

DandDy uses **email-based authentication** with JWT tokens.

| Field | Description |
|-------|-------------|
| `email` | Unique identifier (login credential) |
| `hashed_password` | bcrypt-hashed password |
| `role` | PLAYER, DM, or ADMIN |
| `pinned_character_ids` | JSON array of pinned character IDs for quick access |

### User Roles

| Role | Capabilities |
|------|--------------|
| **PLAYER** | Create characters, join campaigns, generate portraits |
| **DM** | (Future) Campaign management, NPC creation |
| **ADMIN** | Publish global portrait styles, bypass rate limits |

### Authentication Flow

```
1. User registers with email + password
   → Server creates account, returns JWT

2. User logs in with email + password
   → Server validates credentials, returns JWT

3. Authenticated requests include:
   Authorization: Bearer <jwt_token>

4. Password reset:
   → Email sent with time-limited reset token
   → User clicks link, enters new password
```

---

## Character System

### Character Data Model

Characters are the core entity of DandDy. Each character has:

#### Basic Information
- Name, race, class, level, background, alignment, sex
- Experience points

#### Ability Scores
- Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma

#### Combat Stats
- Hit points (max, current, temp)
- Armor class, initiative, speed
- Death save successes/failures
- Conditions (prone, blinded, etc.)

#### Proficiencies
- Saving throws (stored as array: `["str", "con"]`)
- Skills (stored as array with expertise tracking)
- Tools and languages

#### Features & Traits
- Racial traits (with full descriptions)
- Class features (level-based)
- Background feature
- Feats

#### Spellcasting
- Spellcasting ability (INT, WIS, or CHA)
- Spell save DC and attack bonus
- Spell slots (total and used)
- Cantrips, known spells, prepared spells

#### Inventory & Currency
- Equipment items
- Copper, silver, electrum, gold, platinum

#### Personality
- Personality traits, ideals, bonds, flaws
- Appearance, backstory

#### Portraits
- ASCII portrait (text-based)
- Original portrait URL (AI-generated image)
- Custom portrait count (usage tracking)
- Portrait metadata (source, generation params)

### Character Ownership & Sharing

```
┌─────────────────────────────────────────────────────────────┐
│                     CHARACTER                               │
├─────────────────────────────────────────────────────────────┤
│ owner_id ─────────────────→ OWNER (full control)            │
│                                                             │
│ collaborators[] ──────────→ EDITORS (can edit, no delete)   │
│                                                             │
│ character_shares[] ───────→ PUBLIC LINKS (read-only)        │
│                                                             │
│ campaign_id ──────────────→ CAMPAIGN MEMBERSHIP             │
└─────────────────────────────────────────────────────────────┘
```

### Character Lifecycle

```
Create (Builder)                    Import
      │                                │
      ▼                                ▼
   ┌─────────────────────────────────────┐
   │          CHARACTER (Cloud)          │
   │   - Editable in Manager             │
   │   - Tracks last_updated_by          │
   │   - Can be shared/collaborated      │
   │   - Can join campaigns              │
   └─────────────────────────────────────┘
      │                │               │
      ▼                ▼               ▼
   Export          Delete          Archive
   (JSON)       (Permanent)       (Future)
```

---

## Campaign Tracking System

### Overview

Transform DandDy into a living character tracker that follows players throughout their campaigns.

- **Campaigns** group characters and players together
- **Journal entries** record adventures and optionally update character stats
- **Character-centric** - campaigns are accessed through the character sheet, not separately

### User Model

**Players only** - no DM role for now.

#### Players Can:
- Create campaigns (lightweight - just a name/label)
- Share campaigns via invite code (great funnel for new users!)
- Invite specific users by email
- Assign their character(s) to a campaign
- A character can only belong to **one campaign at a time**
- Add journal entries to record their adventures
- Optionally update character stats when adding journal entries

### Core Flows

#### 1. Campaign Creation

```
Player clicks "Create Campaign"
  → Enters campaign name, description
  → System generates unique invite code (e.g., "XYZAB-7X2K")
  → Player shares code with their group
  → Creator is automatically added as first member
```

**Decisions:**
- Creator can regenerate invite code
- Creator only can delete/archive campaign
- No campaign image/banner for MVP

#### 2. Joining a Campaign

**Via Invite Code:**
```
New user receives invite code
  → Code takes them to signup flow
  → After account creation, auto-joins campaign (characterless)
  → Prompts to assign or create a character

Existing user enters invite code
  → Joins campaign (characterless)
  → Assigns character later from expanded character sheet
```

**Via Email Invitation:**
```
Campaign creator invites user by email
  → User sees pending invitation in Join modal
  → Accepts/declines invitation
  → On accept, joins campaign (can assign character)
```

**Decisions:**
- A character can only be in ONE campaign at a time
- A player CAN have multiple characters in the same campaign
- Join first, assign character later (great for onboarding new users)
- New users: invite code → signup → auto-join (conversion funnel!)

#### 3. Adding a Journal Entry

```
Player clicks "Add Entry" in the journal section
  → Entry modal opens with:
      - Title (e.g., "The Amber Temple")
      - Date (defaults to today, can backdate)
      - Notes (textarea for the adventure log)
  → On save, optional prompt appears:
      "Update [Character Name]'s stats?"
      - XP gained
      - Current HP
      - Gold change (+/-)
      - Items acquired/lost
      - Status conditions
  → Entry saved, character optionally updated
```

### Campaign Data Models

#### Campaign ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| name | String | e.g., "Curse of Strahd" |
| description | Text | Optional campaign notes |
| invite_code | String | Unique, shareable (e.g., "XYZAB-7X2K") |
| dm_id | Integer FK | Creator (can delete/manage) |
| status | Enum | active, paused, completed, archived |
| created_at | Timestamp | |
| updated_at | Timestamp | |

#### CampaignMember ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| campaign_id | Integer FK | |
| user_id | Integer FK | |
| character_id | Integer FK | Nullable until assigned |
| is_creator | Boolean | True for campaign creator |
| status | Enum | invited, active, inactive, left |
| joined_at | Timestamp | |

#### Session ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| campaign_id | Integer FK | Optional - for standalone tracking |
| character_id | Integer FK | |
| user_id | Integer FK | |
| session_number | Integer | Auto-increment per character |
| name | String | Optional label, e.g., "The Amber Temple" |
| started_at | Timestamp | |
| ended_at | Timestamp | Null while active |
| status | Enum | active, completed, cancelled |

#### SessionLog ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| session_id | Integer FK | Unique |
| character_id | Integer FK | |
| user_id | Integer FK | |
| xp_gained | Integer | |
| gold_change | Integer | Can be negative |
| hp_before | Integer | |
| hp_after | Integer | |
| items_acquired | JSON | Array of item names |
| items_lost | JSON | Array of item names |
| conditions | JSON | Active status conditions |
| journal | Text | Free-form notes |
| submitted_at | Timestamp | |

#### JournalEntry 🔜 PENDING
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| character_id | Integer FK | |
| campaign_id | Integer FK | Optional - for standalone entries |
| user_id | Integer FK | |
| title | String | e.g., "The Amber Temple" |
| content | Text | The journal entry text |
| entry_date | Date | When the session happened (can backdate) |
| created_at | Timestamp | When entry was created |
| updated_at | Timestamp | Last edit |

### Campaign UI Design

#### No Separate Campaign Navigation
Campaigns are accessed through the expanded character sheet, not a separate nav item.
This reinforces the app as a **character management tool**, not a campaign manager.

#### Expanded Character Sheet Layout ✅ IMPLEMENTED
```
┌──────────────────────────────────┬──────────────────────────────────┐
│         CHARACTER SHEET          │         CAMPAIGN PANEL           │
│           (left side)            │          (right side)            │
├──────────────────────────────────┼──────────────────────────────────┤
│                                  │ ┌────────────────────────────┐   │
│  [ Existing character sheet ]    │ │ CAMPAIGN AREA              │   │
│                                  │ │                            │   │
│  - Portrait                      │ │ CURSE OF STRAHD       [⋮]  │   │
│  - Stats                         │ │ Invite: XYZAB-8K2X [Copy]  │   │
│  - Combat                        │ │                            │   │
│  - Skills                        │ │ PARTY (4)                  │   │
│  - Spells                        │ │ • Thorin - Lvl 5 Fighter   │   │
│  - etc.                          │ │ • Lyra - Lvl 5 Wizard      │   │
│                                  │ │ • Zook - Lvl 5 Rogue       │   │
│                                  │ │ • Aria - Lvl 5 Cleric      │   │
│                                  │ └────────────────────────────┘   │
│                                  │                                  │
│                                  │ ┌────────────────────────────┐   │
│                                  │ │ JOURNAL          [+ Add]   │   │
│                                  │ │                            │   │
│                                  │ │ Dec 15 - The Amber Temple  │   │
│                                  │ │   We defeated the vampire  │   │
│                                  │ │   spawn in the basement... │   │
│                                  │ │                     [Edit] │   │
│                                  │ │                            │   │
│                                  │ │ Dec 8 - Death House        │   │
│                                  │ │   Our first session! We    │   │
│                                  │ │   explored the creepy...   │   │
│                                  │ │                     [Edit] │   │
│                                  │ └────────────────────────────┘   │
└──────────────────────────────────┴──────────────────────────────────┘
```

### Campaign Implementation Status

#### Phase 1: Campaign Organization (MVP) ✅ COMPLETE
- [x] Campaign model + CRUD endpoints
- [x] CampaignMember model + membership endpoints
- [x] Invite code generation + join flow
- [x] Email invitation system (invite, accept, decline)
- [x] Expanded character sheet view
- [x] Campaign panel UI (two-section layout)
- [x] Create/Join campaign modals
- [x] Campaign overflow menu (manage, leave)
- [x] Party member display

#### Phase 1.5: Session System ✅ COMPLETE
- [x] Session model + CRUD endpoints
- [x] SessionLog model for post-session data
- [x] Start/end/cancel session flow
- [x] Session history tracking
- [x] Character stat updates via session logs

#### Phase 2: Journal System 🔜 IN PROGRESS
- [x] Frontend API methods (CampaignAPI.journal*)
- [x] Journal section UI (placeholder)
- [x] Add/Edit journal entry modal UI
- [x] Character update prompt modal UI
- [ ] JournalEntry model
- [ ] CharacterUpdate model
- [ ] Journal backend endpoints (`/journal/*`)
- [ ] Wire up journal UI to backend
- [ ] Display journal entries list

#### Phase 3: Polish & Extras
- [ ] Party member avatars/portraits
- [ ] Shared journal visibility
- [ ] Adventure log export
- [ ] Mobile optimizations
- [ ] Campaign status badges on character cards

---

## AI Integration

### Portrait Generation

DandDy uses AI to generate character portraits in two formats:

#### ASCII Art Portraits
- Generated from character description
- Fits the terminal aesthetic
- Stored as text in the database
- Lightweight, instant rendering

#### Full Image Portraits
- Generated via DALL-E 3 or Flux models
- Stored in Cloudflare R2
- Higher quota limits
- Can be converted to ASCII

### AI Models Used

| Provider | Model | Purpose |
|----------|-------|---------|
| **OpenAI** | gpt-3.5-turbo | Chat, names, backstory |
| **OpenAI** | dall-e-3 | Portrait images |
| **OpenAI** | gpt-image-1 | Alternative image gen |
| **Replicate** | flux-1.1-pro | High-quality portraits |
| **Replicate** | flux-schnell | Fast, budget portraits |

### AI Features

| Feature | Endpoint | Description |
|---------|----------|-------------|
| **Name Generation** | `/ai/characters/names` | Generate thematic character names |
| **Backstory Generation** | `/ai/characters/backstory` | Create character backstory |
| **Combined Summary** | `/ai/characters/summary` | Name + backstory in one call |
| **Narrator Comments** | `/ai/narrator/comment` | Witty narrator commentary |
| **Portrait Generation** | `/ai/images/generate` | Generate character portrait |

### Rate Limiting

| Limit Type | Default | Scope |
|------------|---------|-------|
| Requests/minute | 10 | Per user/IP |
| Requests/day | 100 | Per user/IP |
| Images/day | 10 | Per user/IP |
| Character creations/day | 5 | Per user/IP |
| Character summary cooldown | 20 seconds | Per user/IP |

Admins bypass all rate limits.

---

## Frontend Architecture

### Tech Stack

| Aspect | Technology |
|--------|------------|
| **Language** | Vanilla JavaScript (ES6+) |
| **Framework** | None (intentionally framework-free) |
| **Styling** | Custom CSS with terminal/retro aesthetic |
| **Theming** | CSS custom properties (variables) |
| **Font** | Google Sans Code |
| **Build Tool** | Custom Python bundler |
| **Minification** | rjsmin |

### Entry Points

| Page | Path | Bundle |
|------|------|--------|
| Character Manager | `index.html` | `manager.bundle.js` |
| Character Builder | `character-builder/index.html` | `builder.bundle.js` |

### Key Frontend Files

```
# Global Config & Auth
danddy-config.js          # API URLs, storage keys, debug flags
danddy-auth.js            # JWT token management
danddy-storage.js         # LocalStorage abstraction

# Character Manager
character-manager.js      # Main manager UI logic
character-manager-api.js  # API service for manager
character-storage.js      # Character CRUD operations
campaign-api.js           # Campaign API service
portraits-ui.js           # Portrait selection & generation

# Shared Components
shared-character-sheet.js # Unified character sheet renderer

# Character Builder
character-builder/
├── character-builder-app.js        # Main builder orchestration
├── character-builder-components.js # UI components
├── character-builder-state.js      # State management
├── character-builder-questions.js  # Question flow logic
├── character-builder-services.js   # API calls
├── character-builder-dnd-data.js   # D&D 5e data (races, classes)
├── character-builder-spells.js     # Spell system
└── character-builder-narrators.js  # AI narrator integration

# Styles
terminal-theme.css        # Core terminal aesthetic
character-manager.css     # Manager-specific styles
portraits.css             # Portrait display styles
```

### Shared Character Sheet

The `CharacterSheet` component (`shared-character-sheet.js`) renders character data consistently across Builder and Manager:

```javascript
// Usage
const html = CharacterSheet.render(character, {
  context: 'manager',     // or 'builder'
  showPortrait: true,
  onEdit: true,           // Show edit button
  onDuplicate: true,      // Show duplicate button
  onExport: true,         // Show export button
  onDelete: true,         // Show delete button
});
```

### UI Patterns

#### Selector Menus
All dropdown menus use `CharacterSheet.toggleSelectorMenu()`:
- **Actions menus** - Stateless command lists (edit, delete)
- **Listbox menus** - Stateful selection (sort order, theme)

#### Modals
Standard modal structure with `.modal` > `.modal-content` > `.modal-body`

### Build Process

```bash
# Bundle all JS files (with minification)
python scripts/simple_bundle.py

# Bundle without minification (for debugging)
python scripts/simple_bundle.py --no-minify
```

---

## Backend Architecture

### Tech Stack

| Aspect | Technology |
|--------|------------|
| **Framework** | FastAPI |
| **Language** | Python 3.11+ |
| **ASGI Server** | Uvicorn |
| **ORM** | SQLAlchemy 2.0 |
| **Validation** | Pydantic v2 |
| **Auth** | JWT via python-jose |
| **Password Hashing** | passlib + bcrypt |
| **HTTP Client** | httpx (async) |
| **Compression** | GZip middleware |

### Route Structure

| Router | Prefix | Purpose |
|--------|--------|---------|
| `auth` | `/api` | Login, register, password reset |
| `characters` | `/api` | Character CRUD |
| `campaigns` | `/api` | Campaign management |
| `sessions` | `/api` | Session tracking |
| `users` | `/api` | User profile operations |
| `ai` | `/api/ai` | AI-powered features |
| `prompt_entries` | `/api` | Portrait style prompts |
| `shares` | `/api` | Character sharing |

### File Structure

```
backend/
├── main.py                    # FastAPI app, middleware, routers
├── database/
│   └── database.py            # SQLAlchemy engine, migrations
├── models/
│   ├── user.py                # User model
│   ├── character.py           # Character model
│   ├── campaign.py            # Campaign model
│   ├── campaign_member.py     # Campaign membership
│   ├── session.py             # Session + SessionLog
│   ├── character_share.py     # Public sharing
│   ├── character_collaborator.py  # Edit permissions
│   └── prompt_entry.py        # Portrait styles
├── routes/
│   ├── auth.py                # Authentication endpoints
│   ├── characters.py          # Character endpoints
│   ├── campaigns.py           # Campaign endpoints
│   ├── sessions.py            # Session endpoints
│   ├── ai.py                  # AI service endpoints
│   ├── users.py               # User endpoints
│   ├── prompt_entries.py      # Prompt management
│   └── shares.py              # Sharing endpoints
├── schemas/                   # Pydantic request/response schemas
├── utils/
│   ├── auth.py                # JWT utilities
│   └── email.py               # Postmark integration
└── requirements.txt
```

### Middleware

1. **CORS** - Configured for specific origins only
2. **GZip** - Compresses responses > 1KB
3. **Global Exception Handler** - Returns proper JSON errors

---

## Database Design

### Environment Configuration

| Environment | Database | Connection |
|-------------|----------|------------|
| **Development** | SQLite | `sqlite:///./danddy.db` |
| **Production** | PostgreSQL | Supabase via `DATABASE_URL` |

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      USER       │       │    CHARACTER    │       │    CAMPAIGN     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │──┐    │ id              │    ┌──│ id              │
│ email           │  │    │ owner_id ───────┼────┘  │ name            │
│ hashed_password │  │    │ campaign_id ────┼───────│ invite_code     │
│ role            │  │    │ name            │       │ dm_id ──────────┼──┐
│ pinned_ids      │  │    │ race            │       │ status          │  │
└─────────────────┘  │    │ class           │       └─────────────────┘  │
         │           │    │ level           │                │           │
         │           │    │ ... (stats)     │                │           │
         │           │    │ ... (traits)    │                │           │
         │           │    │ ... (portrait)  │                │           │
         │           │    └─────────────────┘                │           │
         │           │             │                          │           │
         │           │             │                          │           │
         │           │    ┌────────┴────────┐                │           │
         │           │    │                 │                │           │
         │           │    ▼                 ▼                ▼           │
         │    ┌──────┴─────────┐   ┌─────────────────┐   ┌─────────────┐│
         │    │ COLLABORATOR   │   │  CHAR_SHARE     │   │  MEMBER     ││
         │    ├────────────────┤   ├─────────────────┤   ├─────────────┤│
         │    │ character_id   │   │ character_id    │   │ campaign_id ││
         └────│ user_id        │   │ share_token     │   │ user_id ────┼┘
              │ permission     │   │ created_at      │   │ character_id│
              └────────────────┘   └─────────────────┘   │ is_creator  │
                                                         │ status      │
                                                         └─────────────┘
                                                                │
                                              ┌─────────────────┴───────────────────┐
                                              │                                     │
                                              ▼                                     ▼
                                    ┌─────────────────┐               ┌─────────────────┐
                                    │    SESSION      │               │   SESSION_LOG   │
                                    ├─────────────────┤               ├─────────────────┤
                                    │ id              │               │ session_id      │
                                    │ campaign_id     │               │ character_id    │
                                    │ character_id    │──────────────▶│ xp_gained       │
                                    │ user_id         │               │ gold_change     │
                                    │ session_number  │               │ items_acquired  │
                                    │ started_at      │               │ journal         │
                                    │ status          │               └─────────────────┘
                                    └─────────────────┘
```

### Database Indexes

```python
# Characters - optimized for common queries
Index("idx_characters_owner_id", "owner_id")
Index("idx_characters_campaign_id", "campaign_id")
Index("idx_characters_updated_at", "updated_at")

# Campaigns
Index("idx_campaigns_invite_code", "invite_code")
Index("idx_campaigns_dm_id", "dm_id")

# Sessions
Index("idx_sessions_campaign_id", "campaign_id")
Index("idx_sessions_character_id", "character_id")
Index("idx_sessions_user_id", "user_id")
Index("idx_sessions_started_at", "started_at")
```

### Migrations

Lightweight inline migrations in `database.py` using raw SQL:
- `ensure_timestamp_columns()` - created_at/updated_at
- `ensure_sex_column()` - character sex
- `ensure_ai_image_usage_table()` - AI quota tracking
- `ensure_combat_tracking_columns()` - conditions, death saves
- `ensure_campaign_tracking_columns()` - campaign relationships
- `ensure_character_collaborators_table()` - sharing permissions

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| POST | `/api/auth/password-reset-request` | Request reset email |
| POST | `/api/auth/password-reset` | Reset password |

### Characters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/characters/` | List user's characters |
| POST | `/api/characters/` | Create character |
| GET | `/api/characters/{id}` | Get character |
| PUT | `/api/characters/{id}` | Update character |
| DELETE | `/api/characters/{id}` | Delete character |
| POST | `/api/characters/{id}/duplicate` | Duplicate character |

### Campaigns ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/campaigns/` | Create a new campaign |
| GET | `/api/campaigns/` | Get all campaigns user is member of |
| GET | `/api/campaigns/{id}` | Get campaign with characters |
| PUT | `/api/campaigns/{id}` | Update campaign (creator only) |
| DELETE | `/api/campaigns/{id}` | Delete campaign (creator only) |
| POST | `/api/campaigns/join` | Join via invite code |
| POST | `/api/campaigns/{id}/regenerate-code` | Regenerate invite code |

### Campaign Members ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns/{id}/members` | Get all campaign members |
| PUT | `/api/campaigns/{id}/members/assign-character` | Assign character |
| DELETE | `/api/campaigns/{id}/members/leave` | Leave campaign |

### Invitations ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns/invitations/pending` | Get pending invitations |
| POST | `/api/campaigns/{id}/invite` | Invite user by email |
| POST | `/api/campaigns/{id}/accept-invitation` | Accept invitation |
| DELETE | `/api/campaigns/{id}/decline-invitation` | Decline invitation |

### Sessions ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/start` | Start a new session |
| POST | `/api/sessions/{id}/end` | End session with optional log |
| POST | `/api/sessions/{id}/cancel` | Cancel session |
| GET | `/api/sessions/active` | Get active session for character |
| GET | `/api/sessions/character/{id}` | Get session history |
| GET | `/api/sessions/campaign/{id}` | Get campaign sessions |
| POST | `/api/sessions/{id}/log` | Add/update session log |

### AI Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat/completion` | Generic chat completion |
| POST | `/api/ai/narrator/comment` | Narrator commentary |
| POST | `/api/ai/characters/names` | Generate names |
| POST | `/api/ai/characters/backstory` | Generate backstory |
| POST | `/api/ai/characters/summary` | Combined name + backstory |
| POST | `/api/ai/images/generate` | Generate portrait |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/shares/{character_id}` | Create public share link |
| GET | `/api/shares/{token}` | Get shared character (public) |
| DELETE | `/api/shares/{character_id}` | Revoke share link |

---

## Deployment & Infrastructure

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                    │
└─────────────────────────────────────────────────────────────────────┘
                │                               │
                ▼                               ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│    GitHub Pages         │       │      Render.com         │
│    (Static Frontend)    │       │    (FastAPI Backend)    │
│                         │       │                         │
│  - index.html           │──────▶│  - REST API             │
│  - manager.bundle.js    │       │  - JWT Auth             │
│  - builder.bundle.js    │       │  - GZip compression     │
│  - CSS/assets           │       │                         │
└─────────────────────────┘       └────────────┬────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
        ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
        │   Supabase          │   │   OpenAI / Replicate│   │   Cloudflare R2     │
        │   (PostgreSQL)      │   │   (AI Services)     │   │   (Portrait Storage)│
        │                     │   │                     │   │                     │
        │   - Users           │   │   - GPT-3.5         │   │   - Generated images│
        │   - Characters      │   │   - DALL-E 3        │   │   - Public URLs     │
        │   - Campaigns       │   │   - Flux models     │   │                     │
        └─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

### Environment Variables

**Required:**
```bash
SECRET_KEY=<jwt-signing-key>
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
```

**Optional:**
```bash
# Production mode
PRODUCTION=true
ALLOWED_ORIGINS=https://danddy.app

# Replicate (Flux models)
REPLICATE_API_TOKEN=r8_...

# Cloudflare R2 (portrait storage)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=...

# Postmark (email)
POSTMARK_SERVER_TOKEN=...
EMAIL_FROM=no-reply@danddy.app

# Observability
GRAFANA_LOKI_URL=...
GRAFANA_LOKI_TOKEN=...
```

### Local Development

```bash
# Start everything
./start-dev.sh

# Or separately:
./start-backend.sh   # Port 8000
./start-frontend.sh  # Port 8080
```

**URLs:**
- Character Manager: http://localhost:8080/index.html
- Character Builder: http://localhost:8080/character-builder/index.html
- API Documentation: http://localhost:8000/docs

---

## Security

### Authentication
- JWT tokens with 60-minute expiry
- bcrypt password hashing
- Time-limited password reset tokens

### CORS
- Strict origin allowlist (no wildcards)
- Production: configured origins + localhost for testing
- Development: localhost:8080 only

### API Keys
- All AI keys stored server-side only
- Frontend never touches OpenAI/Replicate credentials
- Backend proxies all AI requests

### Rate Limiting
- Per-user/IP limits on AI endpoints
- Image generation quotas
- Character creation limits
- Admins bypass all limits

### Data Access
- Characters are private by default
- Sharing requires explicit action (link or collaborator)
- Campaign data visible only to members

---

## Future Considerations

### Short-term
- [ ] Journal entry backend (Phase 2)
- [ ] Party member avatars
- [ ] Mobile responsive improvements
- [ ] Offline character viewing

### Medium-term
- [ ] DM role with campaign management
- [ ] NPC creation and tracking
- [ ] Quest/objective system
- [ ] Map integration

### Long-term
- [ ] Campaign chat/discussion
- [ ] Virtual tabletop integration
- [ ] Mobile native app
- [ ] API for third-party tools

---

*Last updated: December 2024*






