# Spell Casting Feature - Bug Fix

## Issue
Spell casting functionality was not appearing for characters created in either guided or quick mode. Characters were being created without any spell data, even when playing spellcasting classes (Wizard, Sorcerer, Warlock, Bard, Cleric, Druid).

## Root Cause
The spell casting code was fully implemented for **guided mode** but was completely missing from **quick create mode**. The `quickCreateCharacter()` function was jumping straight to completion without checking if the character was a spellcaster or selecting any spells.

## What Was Fixed

### 1. Quick Create Mode Spell Selection (NEW)
Added automatic spell selection to the quick create flow:
- Checks if the randomly selected class is a spellcaster
- Auto-selects balanced starter spells using `SPELL_DATA.getQuickModeSpells()`
- Saves cantrips, 1st level spells, spell slots, and spellcasting ability
- Shows a brief confirmation message about spell selection

### 2. Duplicate Function Removal
Removed duplicate `_renderSpells()` function in `shared-character-sheet.js` (was defined twice, identical copies)

## How Spell Selection Works

### Guided Mode (Already Working)
1. After rolling abilities, checks if class is a spellcaster
2. If yes, branches to spell selection questions:
   - `spell-style-intro` → introduction message
   - `spell-style` → choose magic style (offense/defense/control/utility)
   - `spell-element` → choose elemental preference (fire/cold/lightning/etc)
   - `spell-selection-guided` → selects spells based on preferences
3. Saves customized spell selection to character

### Quick Mode (NOW WORKING)
1. After generating backstory, checks if class is a spellcaster
2. If yes, auto-selects balanced starter spells
3. Saves default spell selection to character

## Spellcasting Classes
The following classes receive spell selection:
- **Wizard** - Intelligence-based, 3 cantrips, 6 spells in spellbook
- **Sorcerer** - Charisma-based, 4 cantrips, 2 known spells
- **Warlock** - Charisma-based, 2 cantrips, 2 known spells (pact magic)
- **Bard** - Charisma-based, 2 cantrips, 4 known spells
- **Cleric** - Wisdom-based, 3 cantrips, prepared spells
- **Druid** - Wisdom-based, 2 cantrips, prepared spells

## Character Sheet Display
Spells appear in their own section with:
- Cantrips (at-will casting)
- 1st Level Spells (with spell slot count)
- Spell details (school, description)
- Spellcasting ability notation

## Testing
To verify the fix works:
1. Create a new character in **quick mode** and select a spellcasting class
   - Spells should automatically be selected
2. Create a new character in **guided mode** and select a spellcasting class
   - You'll be asked about your magic style and preferences
   - Customized spells will be selected based on your answers
3. View the character sheet - spells should be visible in their own section
4. Save the character and view in Character Manager - spells should persist

## Note on Existing Characters
Characters created before this fix will NOT have spell data because they were created when quick mode didn't include spell selection. These characters will need to be recreated to have spells.

## Files Modified
- `character-builder/character-builder-app.js` - Added spell selection to quick create
- `shared-character-sheet.js` - Removed duplicate `_renderSpells()` function

## Date
November 22, 2025

