# SPELL MAPPING BUG - Complete Fix

## The Problem

Spells were not showing up in the character manager for **TWO REASONS**:

1. **Missing `cantrips` field** in both API conversion layers
2. **Wrong field names** for spells (using `character.spells` instead of `character.spellsKnown`)

## Two Separate API Files

The codebase has TWO separate API conversion layers that both had bugs:

### 1. `character-manager-api.js` (Manager/Cloud API)
Used by the character manager to sync with cloud storage

### 2. `character-builder-api.js` (Builder API)  
Used by the character builder to save characters

**Both files had the same bugs but needed separate fixes!**

## What Was Wrong

### Bug #1: Missing Cantrips Field

Neither API file was sending or receiving the `cantrips` field at all. Cantrips were being completely stripped out during save/load.

### Bug #2: Wrong Field Names

The builder API was using incorrect field names:
- Used `character.spells` but CharacterState has `character.spellsKnown`
- Used `character.preparedSpells` but CharacterState has `character.spellsPrepared`

## The Fixes

### File 1: character-manager-api.js (FIXED)

**In `_toAPIFormat()` - Line 256:**
```javascript
// BEFORE (broken)
spells_known: character.spellsKnown || [],
spells_prepared: character.spellsPrepared || [],

// AFTER (fixed) 
cantrips: character.cantrips || [],          // ← ADDED
spells_known: character.spellsKnown || [],
spells_prepared: character.spellsPrepared || [],
```

**In `_fromAPIFormat()` - Line 339:**
```javascript
// BEFORE (broken)
spellsKnown: apiChar.spells_known,
spellsPrepared: apiChar.spells_prepared,

// AFTER (fixed)
cantrips: apiChar.cantrips || [],            // ← ADDED
spellsKnown: apiChar.spells_known || [],
spellsPrepared: apiChar.spells_prepared || [],
```

### File 2: character-builder-api.js (FIXED)

**In `toBackendFormat()` - Line 134:**
```javascript
// BEFORE (broken)
spells_known: this.arrayToDict(character.spells),        // ← WRONG FIELD!
spells_prepared: character.preparedSpells || [],         // ← WRONG FIELD!

// AFTER (fixed)
cantrips: character.cantrips || [],                      // ← ADDED + FIXED
spells_known: character.spellsKnown || [],               // ← FIXED FIELD NAME
spells_prepared: character.spellsPrepared || [],         // ← FIXED FIELD NAME
```

**In `toFrontendFormat()` - Line 212:**
```javascript
// BEFORE (broken)
spells: backendChar.spells_known,                        // ← WRONG FIELD!
preparedSpells: backendChar.spells_prepared,             // ← WRONG FIELD!

// AFTER (fixed)
cantrips: backendChar.cantrips || [],                    // ← ADDED
spellsKnown: backendChar.spells_known || [],             // ← FIXED FIELD NAME
spellsPrepared: backendChar.spells_prepared || [],       // ← FIXED FIELD NAME
```

## Correct Field Names

For reference, the CharacterState uses these field names:

```javascript
character: {
  spellcastingAbility: 'int' | 'wis' | 'cha',
  cantrips: [],          // ← Array of cantrip objects
  spellsKnown: [],       // ← Array of known spell objects
  spellsPrepared: [],    // ← Array of prepared spell objects
  spellSlots: {},        // ← Object with level: count
}
```

## Backend API Format

The backend expects these snake_case field names:

```python
{
  "spellcasting_ability": "int",
  "cantrips": [],
  "spells_known": [],
  "spells_prepared": [],
  "spell_slots": {},
}
```

## Testing

### Clear Your Browser Storage First

Old characters have corrupted spell data. Clear storage before testing:

```javascript
// In browser console
localStorage.clear();
// Or just clear for this app:
localStorage.removeItem('dnd_characters');
localStorage.removeItem('dnd_characters_cache');
```

### Then Create a Fresh Character

1. **Refresh the page** after clearing storage
2. Create a **NEW** spellcasting character (Wizard, Sorcerer, Warlock, Bard, Cleric, or Druid)
3. Complete character creation
4. Click "SAVE CHARACTER"
5. Exit to Character Manager
6. View the character

**Expected Result:** You should now see:
- **[ SPELLS ]** section with cantrips listed
- All 1st level spells listed
- Spellcasting ability shown

### Verify in Console

```javascript
// After saving a spellcaster
const chars = await StorageService.getCharacters();
const wizard = chars.find(c => c.class === 'wizard');

console.log('Cantrips:', wizard.cantrips);        // Should have 3 cantrips
console.log('Spells Known:', wizard.spellsKnown);  // Should have spells
console.log('Has data?', wizard.cantrips?.length > 0); // Should be true
```

## Why This Was So Hard to Find

1. **Two separate API files** - Had to fix both
2. **Wrong field names** - Not just missing, but incorrectly named
3. **Silent failures** - No error messages, just missing data
4. **Worked in builder** - Only failed when saving/loading
5. **localStorage vs API** - Different code paths
6. **Multiple formats** - Frontend camelCase → Backend snake_case

## Impact

**All characters saved before these fixes are missing spell data.** The only solution is to:
- Delete old characters
- Create new ones after this fix

There's no way to retroactively recover the lost spell data from the database.

## Files Modified

1. ✅ `character-manager-api.js` - Added cantrips field (both directions)
2. ✅ `character-builder-api.js` - Added cantrips + fixed field names (both directions)

## Status

✅ **FULLY FIXED** - Both API conversion layers now properly handle:
- Cantrips
- Spells Known  
- Spells Prepared
- All other spell data

## Date
November 22, 2025

