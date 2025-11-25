# CRITICAL BUG FIX: Cantrips Missing from Manager

## Issue
Spells were showing in the character builder but not in the character manager. Investigation revealed that **cantrips were being completely stripped out** when characters were saved.

## Root Cause

The `character-manager-api.js` file contains conversion functions to translate between the frontend character format and the backend API format:
- `_toAPIFormat()` - Converts frontend → API
- `_fromAPIFormat()` - Converts API → frontend

**The bug:** Both functions were **missing the `cantrips` field entirely**.

### Before (Broken)
```javascript
// In _toAPIFormat - Missing cantrips!
spells_known: character.spellsKnown || [],
spells_prepared: character.spellsPrepared || [],

// In _fromAPIFormat - Missing cantrips!
spellsKnown: apiChar.spells_known,
spellsPrepared: apiChar.spells_prepared,
```

### After (Fixed)
```javascript
// In _toAPIFormat - Added cantrips
cantrips: character.cantrips || [],
spells_known: character.spellsKnown || [],
spells_prepared: character.spellsPrepared || [],

// In _fromAPIFormat - Added cantrips
cantrips: apiChar.cantrips || [],
spellsKnown: apiChar.spells_known || [],
spellsPrepared: apiChar.spells_prepared || [],
```

## What Was Happening

1. **In Builder:** Character created with cantrips → Displayed correctly ✓
2. **On Save:** Cantrips field stripped out during API conversion ✗
3. **In Manager:** Character loaded without cantrips → No spells shown ✗

## Impact

- **All spellcasting characters** saved before this fix are missing their cantrips
- **1st level spells** (spellsKnown/spellsPrepared) were saved correctly
- **Only cantrips** were affected

## Fix Applied

Added `cantrips` field to both conversion functions in `character-manager-api.js`:
- Line 262: Added to `_toAPIFormat()` 
- Line 344: Added to `_fromAPIFormat()`

## Testing

### For New Characters
1. Create a spellcasting character (Wizard, Sorcerer, etc.)
2. Save the character
3. View in manager
4. **Expected:** All spells (cantrips + 1st level) should now appear

### For Existing Characters

**Unfortunately, characters saved before this fix will still be missing cantrips** because:
1. The cantrips were never saved to the database
2. There's no way to retroactively recover lost data
3. Characters need to be recreated

**Options:**
- **Recreate the character** (recommended - takes 2 minutes)
- **Manually edit** the character JSON to add cantrips back

## Why This Bug Was Hard to Find

1. **Cantrips appeared in the builder** - Made it seem like everything was working
2. **1st level spells were saved correctly** - Only cantrips had the bug
3. **No error messages** - The code silently dropped the cantrips field
4. **Split codebase** - Builder and manager use different storage code

## Related Files

- `character-manager-api.js` - Where the bug was (FIXED)
- `shared-character-sheet.js` - Renders spells (already correct)
- `character-builder-app.js` - Sets spell data (already correct)
- `character-builder-spells.js` - Spell definitions (already correct)

## Verification

After this fix, you can verify it's working with browser console:

```javascript
// After saving a spellcaster character
const chars = await CharacterStorage.getAll();
const myChar = chars[0]; // or find by name
console.log('Cantrips:', myChar.cantrips); // Should show array of cantrip objects
console.log('Spells Known:', myChar.spellsKnown); // Should show array of spell objects
```

Both should have data for spellcasting classes.

## Date
November 22, 2025

## Status
✅ **FIXED** - Cantrips are now properly saved and loaded

