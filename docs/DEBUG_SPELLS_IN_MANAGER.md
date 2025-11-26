# Debug: Spells Not Showing in Manager

## Issue
Spells are not appearing in the character sheet when viewing characters in the manager, even though they show up in the builder.

## Diagnostic Steps

### 1. Check if Spell Data Exists in CharacterState

Open the browser console (F12) while in the character builder **after spell selection**:

```javascript
// Get current character state
const state = CharacterState.get();
console.log('Character data:', state.character);

// Check spell-specific fields
console.log('Spellcasting Ability:', state.character.spellcastingAbility);
console.log('Cantrips:', state.character.cantrips);
console.log('Spells Known:', state.character.spellsKnown);
console.log('Spells Prepared:', state.character.spellsPrepared);
console.log('Spell Slots:', state.character.spellSlots);
```

**Expected Results:**
- For a spellcaster, all these fields should have values
- `cantrips` should be an array of spell objects
- `spellsKnown` or `spellsPrepared` should have spell arrays
- `spellSlots` should be an object like `{1: 2}`

**If Empty:** Spells are not being saved to CharacterState (bug in spell selection code)

### 2. Check if Spell Data is Saved to Storage

After clicking "SAVE CHARACTER", check the console:

```javascript
// Check local storage
const characters = await StorageService.getCharacters();
console.log('All characters:', characters);

// Find your character
const myCharacter = characters.find(c => c.name === 'YourCharacterName');
console.log('My character:', myCharacter);

// Check spell fields
console.log('Has cantrips:', myCharacter.cantrips?.length);
console.log('Has spells:', myCharacter.spellsKnown?.length || myCharacter.spellsPrepared?.length);
```

**Expected Results:**
- Character should have spell arrays populated
- Spell data should match what was in CharacterState

**If Empty:** Spells are being lost during save (bug in StorageService or CharacterAPI)

### 3. Check Character in Manager

In the character manager, open console and check:

```javascript
// View the character being displayed
const character = /* the character you're viewing */;
console.log('Character in manager:', character);
console.log('Cantrips:', character.cantrips);
console.log('Spells Known:', character.spellsKnown);
```

**Expected Results:**
- Spell data should still be present

**If Empty:** Spells are being stripped when loading (bug in CharacterStorage.getById)

### 4. Check Shared Character Sheet Rendering

In the manager console:

```javascript
// Check what the shared sheet sees
const parsed = CharacterSheet._parseCharacterData(character);
console.log('Parsed data:', parsed);
console.log('Has spells flag:', parsed.hasSpells);
console.log('Cantrips count:', parsed.cantrips?.length);
```

**Expected Results:**
- `parsed.hasSpells` should be `true`
- `parsed.cantrips` should have spell objects

**If False:** The hasSpells detection logic is wrong

## Common Issues

### Issue: Old Characters Don't Have Spells
**Cause:** Characters created before the spell feature was added
**Fix:** Create a new character

### Issue: Spells Show in Builder but Not After Save
**Cause:** Spell data not being saved to storage
**Fix:** Check saveCharacter() function and ensure all fields are included

### Issue: Spell Data Exists But Sheet Doesn't Render Them
**Cause:** hasSpells flag calculation is wrong
**Fix:** Check _parseCharacterData() in shared-character-sheet.js

## Quick Test Script

Run this in the browser console to check everything:

```javascript
async function debugSpells() {
  console.log('=== SPELL DEBUG ===');
  
  // 1. Check CharacterState (if in builder)
  if (typeof CharacterState !== 'undefined') {
    const state = CharacterState.get();
    console.log('1. CharacterState:');
    console.log('  - Spellcasting Ability:', state.character.spellcastingAbility);
    console.log('  - Cantrips:', state.character.cantrips?.length || 0);
    console.log('  - Spells Known:', state.character.spellsKnown?.length || 0);
  }
  
  // 2. Check StorageService
  if (typeof StorageService !== 'undefined') {
    const characters = await StorageService.getCharacters();
    console.log('2. Saved Characters:', characters.length);
    characters.forEach(c => {
      console.log(`  - ${c.name}: ${c.cantrips?.length || 0} cantrips, ${c.spellsKnown?.length || c.spellsPrepared?.length || 0} spells`);
    });
  }
  
  // 3. Check CharacterStorage (if in manager)
  if (typeof CharacterStorage !== 'undefined') {
    const allChars = await CharacterStorage.getAll();
    console.log('3. Manager Characters:', allChars.length);
    allChars.forEach(c => {
      console.log(`  - ${c.name}: ${c.cantrips?.length || 0} cantrips, ${c.spellsKnown?.length || c.spellsPrepared?.length || 0} spells`);
    });
  }
}

debugSpells();
```

## Next Steps

Based on the results, the issue will be in one of these areas:
1. **Spell selection not updating CharacterState** → Fix in character-builder-app.js
2. **Save not persisting spell data** → Fix in character-builder-services.js
3. **Load not retrieving spell data** → Fix in character-manager-api.js  
4. **Sheet not detecting/rendering spells** → Fix in shared-character-sheet.js

Run the diagnostic steps above and update this document with findings.

