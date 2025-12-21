# Campaign Tracking System Design

> Expanding DandDy from character creation to campaign-based character tracking.

---

## Overview

Transform DandDy into a living character tracker that follows players throughout their campaigns. Key concepts:

- **Campaigns** group characters and players together
- **Journal entries** record adventures and optionally update character stats
- **Character-centric** - campaigns are accessed through the character sheet, not separately

---

## User Model

**Players only** - no DM role for now.

### Players Can:
- Create campaigns (lightweight - just a name/label)
- Share campaigns via invite code (great funnel for new users!)
- Invite specific users by email
- Assign their character(s) to a campaign
- A character can only belong to **one campaign at a time**
- Add journal entries to record their adventures
- Optionally update character stats when adding journal entries

> **Future consideration:** DM role with special privileges

---

## Core Flows

### 1. Campaign Creation

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

---

### 2. Joining a Campaign

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

---

### 3. Adding a Journal Entry

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

**Decisions:**
- Journal entries are the primary interaction (replaces check-in/check-out)
- Character stat updates are **optional** - can skip entirely
- Entries can be backdated for missed sessions
- Entries are editable after creation

---

## Data Model

### Campaign ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| name | String | e.g., "Curse of Strahd" |
| description | Text | Optional campaign notes |
| invite_code | String | Unique, shareable (e.g., "XYZAB-7X2K") |
| dm_id | Integer FK | Creator (can delete/manage) - named `dm_id` for backward compat |
| status | Enum | active, paused, completed, archived |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### CampaignMember ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| campaign_id | Integer FK | |
| user_id | Integer FK | |
| character_id | Integer FK | Nullable until assigned |
| is_creator | Boolean | True for campaign creator |
| status | Enum | **invited**, active, inactive, left |
| joined_at | Timestamp | |

### Session ✅ IMPLEMENTED
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

### SessionLog ✅ IMPLEMENTED
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

### JournalEntry ✅ IMPLEMENTED
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

### CharacterUpdate ✅ IMPLEMENTED
| Field | Type | Notes |
|-------|------|-------|
| id | Integer | Primary key |
| journal_entry_id | Integer FK | |
| character_id | Integer FK | |
| xp_gained | Integer | |
| gold_change | Integer | Can be negative |
| hp_change | Integer | Delta from previous |
| items_acquired | JSON | Array of item names |
| items_lost | JSON | Array of item names |
| conditions | JSON | Active status conditions |

### Status Conditions (persistent between sessions)
Focus on conditions that persist across long rests:
- Exhaustion (levels 1-6)
- Poisoned (from lasting poisons/diseases)
- Diseased
- Cursed
- Other (custom text)

> Note: Combat conditions (stunned, prone, etc.) are too transient to track here

---

## API Endpoints

### Campaign Endpoints ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/campaigns/` | Create a new campaign |
| GET | `/campaigns/` | Get all campaigns user is member of |
| GET | `/campaigns/{id}` | Get campaign with characters |
| PUT | `/campaigns/{id}` | Update campaign (creator only) |
| DELETE | `/campaigns/{id}` | Delete campaign (creator only) |
| POST | `/campaigns/join` | Join via invite code |
| POST | `/campaigns/{id}/regenerate-code` | Regenerate invite code (creator only) |

### Member Endpoints ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/campaigns/{id}/members` | Get all campaign members |
| PUT | `/campaigns/{id}/members/assign-character` | Assign character to membership |
| DELETE | `/campaigns/{id}/members/leave` | Leave campaign |

### Invitation Endpoints ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/campaigns/invitations/pending` | Get pending invitations |
| POST | `/campaigns/{id}/invite` | Invite user by email (creator only) |
| POST | `/campaigns/{id}/accept-invitation` | Accept invitation |
| DELETE | `/campaigns/{id}/decline-invitation` | Decline invitation |

### Session Endpoints ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions/start` | Start a new session |
| POST | `/sessions/{id}/end` | End session with optional log |
| POST | `/sessions/{id}/cancel` | Cancel session without log |
| GET | `/sessions/active` | Get active session for character |
| GET | `/sessions/character/{id}` | Get session history for character |
| GET | `/sessions/campaign/{id}` | Get all sessions for campaign |
| GET | `/sessions/{id}` | Get specific session |
| POST | `/sessions/{id}/log` | Add/update session log |

### Journal Endpoints ✅ IMPLEMENTED

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/journal/` | Create journal entry (with optional character_update) |
| GET | `/journal/character/{id}` | Get entries for character |
| GET | `/journal/{id}` | Get specific entry |
| PUT | `/journal/{id}` | Update entry |
| DELETE | `/journal/{id}` | Delete entry |
| POST | `/journal/{id}/character-update` | Create character update for entry |

---

## UI Design Notes

### No Separate Campaign Navigation
Campaigns are accessed through the expanded character sheet, not a separate nav item.
This reinforces the app as a **character management tool**, not a campaign manager.

### Expanded Character Sheet (Full-screen) ✅ IMPLEMENTED
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

### Campaign Panel Structure ✅ IMPLEMENTED

The campaign panel is divided into two sections:

**Top: Campaign Area**
- Campaign name and status
- Invite code with copy button
- Party members list (name, class, level)
- Overflow menu: Manage (for creator), Leave Campaign
- If no campaign: "Join Campaign" / "Create Campaign" buttons
- Shows pending invitation count

**Bottom: Journal**
- Reverse chronological list (newest first)
- Each entry shows: date, title, preview of content
- "Add Entry" button at top
- Entries are expandable and editable

### Create Campaign Modal ✅ IMPLEMENTED
- Name input (required)
- Description textarea (optional)
- Creates campaign and shows invite code

### Join Campaign Modal ✅ IMPLEMENTED
- Invite code input
- Pending invitations list (if any)
- Accept/decline invitation buttons

### Journal Entry Modal ✅ UI IMPLEMENTED (backend pending)
```
┌─────────────────────────────────────────────────┐
│ ADD JOURNAL ENTRY                          [X]  │
├─────────────────────────────────────────────────┤
│ Title         [__The Amber Temple__________]    │
│                                                 │
│ Date          [__Dec 15, 2024__] 📅             │
│                                                 │
│ What happened?                                  │
│ ┌───────────────────────────────────────────┐   │
│ │ We finally defeated the vampire spawn in │   │
│ │ the basement. Lyra almost died but I     │   │
│ │ managed to stabilize her with my last    │   │
│ │ healing potion. Found a Silver Sword in  │   │
│ │ the treasure hoard!                      │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│                        [Cancel]  [Save Entry]   │
└─────────────────────────────────────────────────┘
```

### Character Update Prompt ✅ UI IMPLEMENTED (backend pending)
```
┌─────────────────────────────────────────────────┐
│ UPDATE THORIN?                             [X]  │
│ Did anything change for your character?         │
├─────────────────────────────────────────────────┤
│ XP Gained     [____300____]                     │
│                                                 │
│ Current HP    [___42___] / 58                   │
│                                                 │
│ Gold          [+] [___150___]  (now: 1,250 gp)  │
│                                                 │
│ Items Acquired                                  │
│ [Potion of Healing, Silver Sword________]       │
│                                                 │
│ Status Conditions                               │
│ [ ] Poisoned  [ ] Exhausted (Lvl _)  [ ] Cursed │
│ [ ] Diseased  [ ] Other: [____________]         │
│                                                 │
│                  [Skip]  [Update Character]     │
└─────────────────────────────────────────────────┘
```

---

## Frontend Implementation

### Files Created/Modified

| File | Description |
|------|-------------|
| `campaign-api.js` | ✅ Full API service with all campaign, session, and journal methods |
| `character-manager.js` | ✅ Campaign panel UI, modals, all event handlers |
| `character-manager.css` | ✅ Campaign panel styles, two-section layout, journal styles |

### CampaignAPI Methods ✅ IMPLEMENTED

**Campaign Methods:**
- `getCampaigns()` - Get all user's campaigns
- `getCampaign(id)` - Get campaign with characters
- `createCampaign(data)` - Create new campaign
- `updateCampaign(id, data)` - Update campaign
- `deleteCampaign(id)` - Delete campaign
- `regenerateInviteCode(id)` - Get new invite code

**Join/Membership Methods:**
- `joinCampaign(code, characterId?)` - Join via invite code
- `getCampaignMembers(id)` - Get all members
- `assignCharacter(campaignId, characterId)` - Assign character
- `leaveCampaign(id)` - Leave campaign

**Invitation Methods:**
- `getPendingInvitations()` - Get pending invitations
- `inviteByEmail(campaignId, email)` - Send email invitation
- `acceptInvitation(campaignId, characterId?)` - Accept invitation
- `declineInvitation(campaignId)` - Decline invitation

**Session Methods:**
- `startSession(characterId, campaignId?, name?)` - Start session
- `endSession(sessionId, logData?)` - End with optional log
- `cancelSession(sessionId)` - Cancel session
- `getActiveSession(characterId)` - Check for active session
- `getCharacterSessions(characterId, limit)` - Get session history
- `getCampaignSessions(campaignId, limit)` - Get campaign sessions
- `getSession(sessionId)` - Get specific session
- `addSessionLog(sessionId, logData)` - Add/update log

**Journal Methods (API ready, backend pending):**
- `getJournalEntries(characterId, limit)` - Get entries
- `getJournalEntry(id)` - Get specific entry
- `createJournalEntry(data)` - Create entry
- `updateJournalEntry(id, data)` - Update entry
- `deleteJournalEntry(id)` - Delete entry
- `createCharacterUpdate(entryId, data)` - Create character update

---

## Resolved Questions

1. **Offline support?** Not needed - app is for before/after sessions
2. **Multiple characters in same campaign?** Yes
3. **Journal without campaign?** Yes - standalone journaling for one-shots
4. **Journal visibility?** Campaign members can see each other's entries (future)
5. **What can members see?** Full character sheets of party members
6. **Leaving campaigns?** Journal entries preserved
7. **Character death?** Let player handle manually (no special system)
8. **How to join campaign if no character yet?** Join characterless, assign later
9. **Session tracking vs Journal?** Journal-first approach - no check-in/check-out
10. **Character updates required?** Optional - can skip when adding journal entry

*All major questions resolved!*

---

## Implementation Status

### Phase 1: Campaign Organization (MVP) ✅ COMPLETE
- [x] Campaign model + CRUD endpoints
- [x] CampaignMember model + membership endpoints
- [x] Invite code generation + join flow
- [x] Email invitation system (invite, accept, decline)
- [x] Expanded character sheet view
- [x] Campaign panel UI (two-section layout)
- [x] Create/Join campaign modals
- [x] Campaign overflow menu (manage, leave)
- [x] Party member display

### Phase 1.5: Session System ✅ COMPLETE
- [x] Session model + CRUD endpoints
- [x] SessionLog model for post-session data
- [x] Start/end/cancel session flow
- [x] Session history tracking
- [x] Character stat updates via session logs

### Phase 2: Journal System ✅ COMPLETE
- [x] Frontend API methods (CampaignAPI.journal*)
- [x] Journal section UI
- [x] Add/Edit journal entry modal UI
- [x] Character update prompt modal UI
- [x] JournalEntry model
- [x] CharacterUpdate model
- [x] Journal backend endpoints (`/journal/*`)
- [x] Wire up journal UI to backend
- [x] Display journal entries list

### Phase 3: Polish & Extras
- [ ] Party member avatars/portraits
- [ ] Shared journal visibility
- [ ] Adventure log export
- [ ] Mobile optimizations
- [ ] Campaign status badges on character cards

---

## Architecture Notes

### Session vs Journal Approach

The system has both **Session** and **Journal** models:

- **Sessions** track real-time play (start → end) with structured logs
- **Journal entries** are freeform notes that can be backdated

**Current decision:** Journal-first approach for MVP. Sessions remain for advanced users who want real-time tracking, but the primary UX is through journal entries.

### Why Both?
- Sessions: Good for users who want to track play time, session numbers
- Journal: Lower friction, works for backdating, fits narrative style

The journal entry modal flows into the character update prompt, which uses the same data structure as SessionLog. This keeps things consistent while offering a simpler entry point.

---

## Notes / Ideas

_Add your thoughts here as you flesh out the design..._

**Potential improvements:**
- Campaign chat/discussion (very future)
- DM notes visible only to creator
- Quest/objective tracking
- NPC relationship tracking
- Map/location pins
