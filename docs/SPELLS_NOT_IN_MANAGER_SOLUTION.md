# Solution: Spells Not Showing in Manager

## Most Likely Cause

**You're viewing an old character that was created before the spell feature was added or before the fix was applied.**

Characters created:
- ✗ **Before the spell fix** - Will NOT have spells
- ✓ **After the spell fix** - Will have spells

## Quick Solution

**Create a new test character:**
1. Open the character builder
2. Select "Quick create" or "Guided mode"
3. Choose a spellcasting class (Wizard, Sorcerer, Warlock, Bard, Cleric, or Druid)
4. Complete character creation
5. Click "SAVE CHARACTER"
6. Exit to manager and view the character
7. **Spells should now appear in the character sheet**

## How to Verify Spells Are Working

### In the Builder (During Creation)
After spell selection, you should see in the character sheet on the right:
```
[ SPELLS ]

CANTRIPS (At-Will)
• Fire Bolt (Evocation)
  Hurl a mote of fire at a creature or object. 1d10 fire damage.
• Mage Hand (Conjuration)
  Create a spectral hand that can manipulate objects at range.
...

1ST LEVEL • Slots: 2
• Magic Missile (Evocation)
  Three darts of force, each dealing 1d4+1 damage (auto-hit).
...

Spellcasting Ability: Intelligence
```

### After Saving (In the Manager)
When you view the character in the manager, the same **[ SPELLS ]** section should appear.

## If New Characters Still Don't Show Spells

### Test 1: Check Browser Console
1. Open the character builder
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Create a spellcasting character
5. After spell selection, run:
```javascript
const state = CharacterState.get();
console.log('Cantrips:', state.character.cantrips);
console.log('Spells:', state.character.spellsKnown);
```

**Expected:** Arrays of spell objects should be logged

**If empty:** There's a bug in the spell selection code

### Test 2: Check After Save
1. After saving the character, run in console:
```javascript
const chars = await StorageService.getCharacters();
const myChar = chars.find(c => c.name === 'YourCharacterName');
console.log('Saved cantrips:', myChar.cantrips);
console.log('Saved spells:', myChar.spellsKnown || myChar.spellsPrepared);
```

**Expected:** Spell data should be present

**If empty:** There's a bug in the save/storage code

### Test 3: Check in Manager
1. Open character manager
2. View your character
3. Run in console:
```javascript
// If you know the character ID
const char = await CharacterStorage.getById('your-character-id');
console.log('Manager cantrips:', char.cantrips);

// Or check the currently displayed character
console.log('Current character:', window._currentCharacter);
```

**Expected:** Spell data should be present

**If empty:** There's a bug in the load/retrieval code

## Technical Details

### Spell Data Structure

Characters should have these fields when they're spellcasters:

```javascript
{
  spellcastingAbility: 'int' | 'wis' | 'cha',
  cantrips: [
    {
      id: 'fire-bolt',
      name: 'Fire Bolt',
      school: 'Evocation',
      description: '...',
      tags: ['damage', 'fire', 'offense']
    },
    // ... more cantrips
  ],
  spellsKnown: [
    // For classes that know spells (Sorcerer, Warlock, Bard)
    { id: 'magic-missile', name: 'Magic Missile', ... }
  ],
  spellsPrepared: [
    // For classes that prepare spells (Wizard, Cleric, Druid)
    { id: 'cure-wounds', name: 'Cure Wounds', ... }
  ],
  spellSlots: {
    1: 2  // 2 first-level spell slots
  }
}
```

### Where Spells Are Set

**Guided Mode:**
- After rolling abilities
- Asked about magic style (offense/defense/control/utility)
- Asked about element preference (fire/cold/lightning/etc)
- Spells selected based on preferences
- Set in `showSpellSelection()` function

**Quick Mode:**
- After generating backstory
- Spells auto-selected if class is a spellcaster
- Set in `quickCreateCharacter()` function

### Where Spells Are Displayed

**Shared Character Sheet:**
- File: `shared-character-sheet.js`
- Function: `_renderSpells(parsed)`
- Condition: `parsed.hasSpells` must be true
- Calculation: Checks if `cantrips`, `spellsKnown`, or `spellsPrepared` arrays have length > 0

## Updating Old Characters

Unfortunately, there's no automatic way to add spells to characters that were created without them. You have two options:

### Option 1: Recreate the Character (Recommended)
- Fastest and ensures all data is correct
- Use the same race/class/background choices
- Takes ~2 minutes with quick mode

### Option 2: Manual Edit (Advanced)
If you want to keep the exact same character:

1. Export the character to JSON
2. Add spell data manually to the JSON
3. Import the character back

Example spell data to add:
```json
{
  "spellcastingAbility": "int",
  "cantrips": [
    {"id": "fire-bolt", "name": "Fire Bolt", "school": "Evocation", "description": "Hurl a mote of fire at a creature or object. 1d10 fire damage.", "tags": ["damage", "fire", "offense"]},
    {"id": "mage-hand", "name": "Mage Hand", "school": "Conjuration", "description": "Create a spectral hand that can manipulate objects at range.", "tags": ["utility", "manipulation"]},
    {"id": "light", "name": "Light", "school": "Evocation", "description": "Touch an object to make it shed bright light for 1 hour.", "tags": ["utility", "light"]}
  ],
  "spellsKnown": [
    {"id": "magic-missile", "name": "Magic Missile", "school": "Evocation", "description": "Three darts of force, each dealing 1d4+1 damage (auto-hit).", "tags": ["damage", "force", "offense", "reliable"]},
    {"id": "shield", "name": "Shield", "school": "Abjuration", "description": "Reaction: +5 AC until start of your next turn.", "tags": ["defense", "protection", "reaction"]}
  ],
  "spellSlots": {
    "1": 2
  }
}
```

Refer to `character-builder/character-builder-spells.js` for the complete spell list for each class.

## Summary

- **Old characters:** Won't have spells → Create new ones
- **New characters:** Should have spells automatically
- **If new characters don't have spells:** Run diagnostic tests above and report the issue

The spell feature is fully implemented and working for new characters. The issue is likely that you're viewing characters created before the feature existed.

