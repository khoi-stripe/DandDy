# Campaign Tracking System Design

> Expanding DandDy from character creation to campaign-based session tracking.

---

## Overview

Transform DandDy into a living character tracker that follows players throughout their campaigns. Key concepts:

- **Campaigns** group characters and players together
- **Sessions** represent individual play sessions
- **Check-in/out** creates intentional moments around active play
- **Post-session prompts** ensure characters stay updated

---

## User Model

**Players only** - no DM role for now.

### Players Can:
- Create campaigns (lightweight - just a name/label)
- Share campaigns via invite code (great funnel for new users!)
- Assign their character(s) to a campaign
- A character can only belong to **one campaign at a time**
- Start/end play sessions for their characters
- Update character post-session

> **Future consideration:** DM role with special privileges

---

## Core Flows

### 1. Campaign Creation

```
Player clicks "Create Campaign"
  → Enters campaign name, description
  → System generates unique invite code (e.g., "DRAGON-HEIST-7X2K")
  → Player shares code with their group
  → Creator is automatically added as first member
```

**Decisions:**
- Creator can regenerate invite code
- Creator only can delete/archive campaign
- No campaign image/banner for MVP

---

### 2. Joining a Campaign

```
New user receives invite code
  → Code takes them to signup flow
  → After account creation, auto-joins campaign (characterless)
  → Prompts to assign or create a character

Existing user enters invite code
  → Joins campaign (characterless)
  → Assigns character later from expanded character sheet
```

**Decisions:**
- A character can only be in ONE campaign at a time
- A player CAN have multiple characters in the same campaign
- Join first, assign character later (great for onboarding new users)
- New users: invite code → signup → auto-join (conversion funnel!)

---

### 3. Starting a Session (Check-out)

```
Player opens their character → clicks "Start Session" / "Check Out"
  → Character is marked as "in session"
  → Timestamp recorded
  → Character sheet shows "IN SESSION" indicator
```

This is **self-directed** - each player manages their own session state. No need for coordinated start/end times.

**Decisions:**
- Per-character sessions (not campaign-wide)
- Session name (short label) + journal (longer notes) are separate fields
- No "quick session" vs "full session" distinction

---

### 4. During Active Play

While session is active:
- Character sheet shows "IN SESSION" indicator
- (Optional) Quick actions: take damage, spend spell slot, etc.
- (Future) Live status conditions toggle

**Open questions:**
- [Not yet ] Any special "active play" mode features?
- [Interesting, but not yet ] Mobile-optimized view for at-the-table use?

---

### 5. Ending Session / Check-in

```
Player clicks "End Session" / "Check In"
  → Post-session update modal appears
  → Player fills out:
      - Session name (short label, e.g., "The Amber Temple")
      - XP gained (number input)
      - HP changes (gained/lost, current state)
      - Gold gained/spent
      - Items acquired (text list)
      - Status conditions (poisoned, exhausted, etc.)
      - Level up? (if XP threshold crossed, prompt level-up flow)
      - Journal entry (optional textarea)
  → Changes apply to character
  → Session log is saved
```

**Open questions:**
- [All fields optional ] Required vs optional fields?
- [Yes ] Auto-detect level up based on XP?
- [ Yes] Death/resurrection tracking?
- [Yes ] "I forgot to check out" - allow backdated session entry?

---

## Data Model

### Campaign
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | e.g., "Curse of Strahd" |
| description | Text | Optional campaign notes |
| invite_code | String | Unique, shareable (e.g., "STRAHD-8K2X") |
| created_by | User ID | Creator (can delete/manage) |
| status | Enum | active, paused, completed, archived |
| created_at | Timestamp | |
| updated_at | Timestamp | |

### CampaignMember
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| campaign_id | Campaign ID | FK |
| user_id | User ID | FK |
| character_id | Character ID | FK, nullable until assigned |
| is_creator | Boolean | True for campaign creator |
| joined_at | Timestamp | |
| status | Enum | active, inactive, left |

### Session (per-character, self-directed)
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| campaign_id | Campaign ID | FK (optional - could be unattached) |
| character_id | Character ID | FK |
| user_id | User ID | FK |
| session_number | Integer | Auto-increment per character |
| name | String | Optional, e.g., "The Amber Temple" |
| started_at | Timestamp | |
| ended_at | Timestamp | Null while active |
| status | Enum | active, completed, cancelled |

### SessionLog (Post-session character updates)
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| session_id | Session ID | FK |
| character_id | Character ID | FK |
| user_id | User ID | FK |
| xp_gained | Integer | |
| gold_change | Integer | Can be negative |
| hp_before | Integer | Snapshot |
| hp_after | Integer | New value |
| items_acquired | JSON | Array of item names |
| items_lost | JSON | Array of item names |
| conditions | JSON | Active status conditions |
| journal | Text | Player's session journal |
| submitted_at | Timestamp | |

### Status Conditions (persistent between sessions)
Focus on conditions that persist across long rests:
- Exhaustion (levels 1-6)
- Poisoned (from lasting poisons/diseases)
- Diseased
- Cursed
- Other (custom text)

> Note: Combat conditions (stunned, prone, etc.) are too transient to track here

---

## UI Design Notes

### No Separate Campaign Navigation
Campaigns are accessed through the expanded character sheet, not a separate nav item.
This reinforces the app as a **character management tool**, not a campaign manager.

### Expanded Character Sheet (Full-screen)
```
┌──────────────────────────────────┬──────────────────────────────────┐
│         CHARACTER SHEET          │         CAMPAIGN PANEL           │
│           (left side)            │          (right side)            │
├──────────────────────────────────┼──────────────────────────────────┤
│                                  │ CURSE OF STRAHD                  │
│  [ Existing character sheet ]    │ Invite: STRAHD-8K2X [Copy]       │
│                                  │                                  │
│  - Portrait                      │ ─────────────────────────────    │
│  - Stats                         │ PARTY (4)                        │
│  - Combat                        │ • Thorin (you) - Dwarf Lvl 5 🟢  │
│  - Skills                        │ • Lyra - Elf Wizard Lvl 5        │
│  - Spells                        │ • Zook - Gnome Rogue Lvl 5 🟢    │
│  - etc.                          │ • Aria - Human Cleric Lvl 5      │
│                                  │   [View Sheet]                   │
│                                  │                                  │
│                                  │ ─────────────────────────────    │
│                                  │ SESSIONS                         │
│                                  │ #5 - The Amber Temple (2d ago)   │
│                                  │ #4 - Death House (1w ago)        │
│                                  │                                  │
│                                  │ [Start Session]                  │
│                                  │ ─────────────────────────────    │
│                                  │ [Leave Campaign]                 │
├──────────────────────────────────┴──────────────────────────────────┤
│                        [Return to Grid View]                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Post-Session Modal
```
┌─────────────────────────────────────────────────┐
│ SESSION COMPLETE                           [X]  │
│ How did it go, Thorin?                          │
├─────────────────────────────────────────────────┤
│ Session Name  [__The Amber Temple__________]    │
│                                                 │
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
│ Journal (optional)                              │
│ ┌───────────────────────────────────────────┐   │
│ │ We finally defeated the vampire spawn in │   │
│ │ the basement. Lyra almost died but I     │   │
│ │ managed to stabilize her with my last    │   │
│ │ healing potion...                        │   │
│ └───────────────────────────────────────────┘   │
│                                                 │
│              [Skip]  [Save & Update Character]  │
└─────────────────────────────────────────────────┘
```

---

## Character Sheet Changes

### Campaign Badge
- Show campaign name badge on character card
- Show "IN SESSION" indicator when active

### Expanded Character Sheet View
The character sheet can expand to full-screen view:
- **Left side:** Character sheet (as it is today)
- **Right side:** Campaign panel
  - Campaign name, invite code
  - Party members (full character sheets viewable!)
  - Session history for this character
  - Assign/change campaign
  - Journal entries

This keeps the app **character-centric** - campaigns are accessed through your character, not as a separate section.

### Leaving a Campaign
- Character can be removed from campaign
- Session history is preserved (archived)
- Character becomes available to join another campaign

---

## Adventure Log / Journal

If we want to expand journaling:
- Timeline view of all session entries for a character
- Shared session notes visible to campaign members
- Export adventure log as PDF/markdown?

---

## Resolved Questions

1. **Offline support?** Not needed - app is for before/after sessions, not during active play
2. **Multiple characters in same campaign?** Yes
3. **Sessions without campaign?** Yes - standalone session tracking for one-shots
4. **Session visibility?** Yes - campaign members can see each other's session notes
5. **What can members see?** Full character sheets of party members
6. **Leaving campaigns?** Session history preserved (archived)

## Open Design Questions

1. ~~**Character death?**~~ Let player handle manually (no special system)
2. ~~**How to join campaign if no character yet?**~~ Join characterless, assign later

*All major questions resolved!*

---

## Implementation Phases

### Phase 1: Campaign Organization (MVP)
- [ ] Campaign model + CRUD endpoints
- [ ] Invite code generation + join flow
- [ ] Campaign list and detail views
- [ ] Character assignment to campaigns

### Phase 2: Session Tracking
- [ ] Session model + start/end flow (per-character)
- [ ] Post-session update form
- [ ] Session history view (per character + per campaign)
- [ ] Character updates from session logs

### Phase 3: Polish & Extras
- [ ] Journaling improvements
- [ ] Shared session notes
- [ ] Adventure log export
- [ ] Mobile optimizations

---

## Notes / Ideas

_Add your thoughts here as you flesh out the design..._

*(Expanded character sheet idea has been integrated into the design above)*

