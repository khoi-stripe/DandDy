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

### JournalEntry
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| character_id | Character ID | FK |
| campaign_id | Campaign ID | FK (optional - for standalone entries) |
| user_id | User ID | FK |
| title | String | e.g., "The Amber Temple" |
| content | Text | The journal entry text |
| entry_date | Date | When the session happened (can backdate) |
| created_at | Timestamp | When entry was created |
| updated_at | Timestamp | Last edit |

### CharacterUpdate (optional stats change linked to journal entry)
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| journal_entry_id | JournalEntry ID | FK |
| character_id | Character ID | FK |
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
│                                  │ ┌────────────────────────────┐   │
│  [ Existing character sheet ]    │ │ CAMPAIGN AREA              │   │
│                                  │ │                            │   │
│  - Portrait                      │ │ CURSE OF STRAHD            │   │
│  - Stats                         │ │ Invite: STRAHD-8K2X [Copy] │   │
│  - Combat                        │ │                            │   │
│  - Skills                        │ │ PARTY (4)                  │   │
│  - Spells                        │ │ • Thorin (you) - Dwarf 5   │   │
│  - etc.                          │ │ • Lyra - Elf Wizard 5      │   │
│                                  │ │ • Zook - Gnome Rogue 5     │   │
│                                  │ │ • Aria - Human Cleric 5    │   │
│                                  │ │                            │   │
│                                  │ │ [Leave Campaign]           │   │
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

### Campaign Panel Structure

The campaign panel is divided into two sections:

**Top: Campaign Area**
- Campaign name and status
- Invite code with copy button
- Party members list (name, race, class, level)
- Actions: Leave Campaign, Invite (for creator: manage/delete)
- If no campaign: "Join Campaign" / "Create Campaign" buttons

**Bottom: Journal**
- Reverse chronological list (newest first)
- Each entry shows: date, title, preview of content
- "Add Entry" button at top
- Entries are expandable and editable

### Journal Entry Modal
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

### Character Update Prompt (after saving journal entry)
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

## Character Sheet Changes

### Campaign Badge
- Show campaign name badge on character card in the grid view

### Expanded Character Sheet View
The character sheet can expand to full-screen view:
- **Left side:** Character sheet (as it is today)
- **Right side:** Campaign panel (two sections)
  - **Campaign Area:** name, invite code, party members, actions
  - **Journal:** chronological adventure entries

This keeps the app **character-centric** - campaigns are accessed through your character, not as a separate section.

### Leaving a Campaign
- Character can be removed from campaign
- Journal entries are preserved (but no longer linked to campaign)
- Character becomes available to join another campaign

---

## Journal Features

Core journal functionality:
- Reverse chronological display (newest first)
- Entries can be backdated for missed sessions
- Entries are editable after creation
- Optional character stat updates on each entry

Future enhancements:
- Shared journal visibility to campaign members
- Export adventure log as PDF/markdown
- Tags/categories for entries

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

## Implementation Phases

### Phase 1: Campaign Organization (MVP)
- [x] Campaign model + CRUD endpoints
- [x] Invite code generation + join flow
- [x] Expanded character sheet view
- [x] Campaign panel UI (placeholder)
- [x] Create/Join campaign modals

### Phase 2: Journal System
- [ ] Journal entry model + CRUD endpoints
- [ ] Campaign panel: campaign area section
- [ ] Campaign panel: journal section
- [ ] Add/edit journal entry modal
- [ ] Character update prompt (optional)
- [ ] Display journal entries (reverse chronological)

### Phase 3: Polish & Extras
- [ ] Party member display with character info
- [ ] Shared journal visibility
- [ ] Adventure log export
- [ ] Mobile optimizations

---

## Notes / Ideas

_Add your thoughts here as you flesh out the design..._

*(Expanded character sheet idea has been integrated into the design above)*

