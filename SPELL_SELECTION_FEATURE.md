# Spell Selection Feature

## Overview
Added comprehensive spell selection during character creation for all spellcasting classes (Wizard, Sorcerer, Warlock, Bard, Cleric, Druid). The system supports both **Quick Mode** (auto-select) and **Guided Mode** (roleplay-based recommendations).

## What Was Implemented

### 1. Spell Database (`character-builder-spells.js`)
Created a comprehensive spell library with:
- **Spellcasting class configurations**: Defines cantrips known, spells known, prepared spells, and spell slots for each class at level 1
- **Cantrips by class**: 3-7 cantrips per class with descriptions and tags
- **1st level spells by class**: 5-10 spells per class with school, description, and gameplay tags
- **Helper functions**:
  - `getQuickModeSpells()`: Auto-selects balanced starter spells
  - `getGuidedSpells()`: Suggests spells based on player preferences (style + element)
  - `isSpellcaster()`: Checks if a class can cast spells

### 2. Character State Management
Updated `character-builder-state.js` to track:
- `spellcastingAbility`: 'int', 'wis', or 'cha'
- `cantrips`: Array of cantrip objects
- `spellsKnown`: Array of 1st level spell objects
- `spellsPrepared`: Array of prepared spell names (for Clerics/Druids)
- `spellSlots`: Dictionary of available spell slots by level

### 3. Question Flow Updates
Added new questions to `character-builder-questions.js`:

**For Quick Mode:**
- Automatic spell selection after ability scores
- Shows selected spells with narrator commentary

**For Guided Mode:**
- `spell-style-intro`: Narrator introduction to spell selection
- `spell-style`: Choose magical approach (offense/defense/control/utility)
- `spell-element`: Choose elemental specialty (fire/cold/lightning/necrotic/radiant/versatile)
- `spell-selection-guided`: Auto-suggests spells based on preferences

### 4. Spell Selection Handler
Added `showSpellSelection()` to `character-builder-app.js`:
- Handles both quick and guided modes
- Provides personalized narrator commentary based on choices
- Shows spell summaries (cantrips + 1st level spells)
- Saves spells to character state

### 5. Character Sheet Display
Updated `shared-character-sheet.js` to render spells:
- `_renderSpells()`: Displays cantrips and 1st level spells with descriptions
- Shows spell slots and spellcasting ability
- Distinguishes between "known" and "prepared" spells
- Organized by spell level with proper formatting

## Spell System Details

### Spellcasting Classes Configuration

| Class | Ability | Cantrips | 1st Level Spells | Spell Slots | System |
|-------|---------|----------|------------------|-------------|--------|
| **Wizard** | Intelligence | 3 | 6 (in spellbook) | 2 | Prepared (INT + level) |
| **Sorcerer** | Charisma | 4 | 2 | 2 | Known |
| **Warlock** | Charisma | 2 | 2 | 1 (Pact Magic) | Known |
| **Bard** | Charisma | 2 | 4 | 2 | Known |
| **Cleric** | Wisdom | 3 | Prepared from all | 2 | Prepared (WIS + level) |
| **Druid** | Wisdom | 2 | Prepared from all | 2 | Prepared (WIS + level) |

### Quick Mode Selections

Each class gets a balanced starter set:

**Wizard:**
- Cantrips: Fire Bolt, Mage Hand, Light
- Spells: Magic Missile, Shield, Mage Armor, Detect Magic, Identify, Sleep

**Sorcerer:**
- Cantrips: Fire Bolt, Ray of Frost, Mage Hand, Prestidigitation
- Spells: Magic Missile, Shield

**Warlock:**
- Cantrips: Eldritch Blast, Mage Hand
- Spells: Hex, Armor of Agathys

**Bard:**
- Cantrips: Vicious Mockery, Minor Illusion
- Spells: Healing Word, Cure Wounds, Charm Person, Disguise Self

**Cleric:**
- Cantrips: Sacred Flame, Guidance, Spare the Dying
- Prepared: Cure Wounds, Healing Word, Bless

**Druid:**
- Cantrips: Produce Flame, Guidance
- Prepared: Cure Wounds, Entangle, Faerie Fire

### Guided Mode Logic

Spells are tagged with categories:
- **Damage types**: fire, cold, lightning, necrotic, radiant, force, psychic, thunder
- **Roles**: offense, defense, control, utility, healing, support
- **Functions**: buff, debuff, crowd-control, protection, detection, social

The system filters spells based on:
1. **Style preference**: offense/defense/control/utility
2. **Element preference**: fire/cold/lightning/necrotic/radiant/versatile

Narrator provides personalized commentary:
- Offense: "Ah, a blaster. How... predictable..."
- Defense: "The cautious type, I see..."
- Control: "A tactician. Interesting..."
- Utility: "Utility over flash. Practical..."

## Future Enhancements (Option 3)

The foundation is in place for manual spell selection in the character manager:
- Full spell lists are available in `SPELL_DATA`
- Character state supports spell arrays
- UI can be extended with a spell picker modal
- Spells can be edited/updated after character creation

### Suggested Implementation for Manager:
1. Add "Edit Spells" button in character sheet
2. Create modal with spell list filtered by class
3. Allow selection up to class limits
4. Show spell descriptions on hover/click
5. Save updated spell lists to character

## Files Modified

### New Files:
- `character-builder/character-builder-spells.js` - Spell database and logic

### Updated Files:
- `character-builder/character-builder-state.js` - Added spell state fields
- `character-builder/character-builder-questions.js` - Added spell selection questions
- `character-builder/character-builder-app.js` - Added `showSpellSelection()` handler
- `character-builder/index.html` - Included spells.js script
- `shared-character-sheet.js` - Added `_renderSpells()` display
- `backend/schemas/character.py` - Already had spell fields (no changes needed)

## Testing Checklist

- [ ] Create a Wizard in Quick Mode - should get 3 cantrips + 6 spells
- [ ] Create a Wizard in Guided Mode - should ask style/element preferences
- [ ] Create a Cleric - should show "prepared" spells
- [ ] Create a Fighter - should skip spell selection entirely
- [ ] Verify spells display on character sheet
- [ ] Verify spell descriptions show correctly
- [ ] Check that narrator commentary varies by style choice
- [ ] Print character sheet - spells should be visible
- [ ] Export/import character - spells should persist

## API Integration

The spell data is stored in the character object and will automatically sync with the backend:
- Backend schema already supports: `spells_known`, `spells_prepared`, `spell_slots`, `spellcasting_ability`
- Cloud storage will preserve spell selections
- Character manager will display spells on imported characters

## Notes

- Cantrips are at-will (no spell slots needed)
- 1st level spells show slot count
- Clerics/Druids use "prepared" system (can change daily)
- Wizards/Sorcerers/Warlocks/Bards use "known" system (fixed at level up)
- All spells include school of magic and descriptions
- Spell slots are currently level 1 only (will scale with level changes)

