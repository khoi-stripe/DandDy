# Testing Spell Casting Feature

## Quick Test Steps

### Test 1: Quick Create with Spellcaster
1. Open `character-builder/index.html` in your browser
2. Press any key to start
3. Select "Quick create (let the system roll everything)"
4. Wait for character generation to complete
5. **Expected Results:**
   - If the randomly selected class is a spellcaster (Wizard, Sorcerer, Warlock, Bard, Cleric, Druid):
     - You should see a message like "Auto-selected 3 cantrips and 6 1st level spells for your Wizard"
     - The character sheet should show a **[ SPELLS ]** section
     - Cantrips and 1st level spells should be listed with descriptions

### Test 2: Guided Mode with Spellcaster
1. Open `character-builder/index.html` in your browser
2. Press any key to start
3. Select "Co-create with the narrator (guided mode)"
4. Answer the personality questions
5. Select a **spellcasting class**:
   - Wizard (Intelligence-based)
   - Sorcerer (Charisma-based)
   - Warlock (Charisma-based)
   - Bard (Charisma-based)
   - Cleric (Wisdom-based)
   - Druid (Wisdom-based)
6. After rolling abilities, you should be asked:
   - "What draws you to magic?" (offense/defense/control/utility)
   - "And if you had to pick a magical specialty..." (fire/cold/lightning/etc)
7. Spells will be selected based on your preferences
8. **Expected Results:**
   - The character sheet should show a **[ SPELLS ]** section
   - Spells should match your chosen style (e.g., fire spells if you chose fire)

### Test 3: Non-Spellcaster (Control Test)
1. Create a character with a non-spellcasting class:
   - Fighter
   - Barbarian
   - Rogue
   - Ranger
   - Monk
   - Paladin (Paladins don't get spells at level 1)
2. **Expected Results:**
   - NO spell selection questions should appear
   - NO **[ SPELLS ]** section in the character sheet
   - Character creation flows normally

### Test 4: Character Manager Integration
1. Create a spellcasting character (either mode)
2. Click "SAVE CHARACTER"
3. Click "EXIT" to go to Character Manager
4. Click on your character to view it
5. **Expected Results:**
   - The **[ SPELLS ]** section should appear
   - All cantrips and spells should be visible
   - Spellcasting ability should be shown

## Expected Spell Counts by Class

| Class | Cantrips | 1st Level Spells | Notes |
|-------|----------|------------------|-------|
| Wizard | 3 | 6 | Intelligence, Prepared spells |
| Sorcerer | 4 | 2 | Charisma, Known spells |
| Warlock | 2 | 2 | Charisma, Pact magic (1 slot) |
| Bard | 2 | 4 | Charisma, Known spells |
| Cleric | 3 | 3 (suggested) | Wisdom, Prepared spells |
| Druid | 2 | 3 (suggested) | Wisdom, Prepared spells |

## Example Spell Output

For a Wizard in quick mode, you should see something like:

```
[ SPELLS ]

CANTRIPS (At-Will)
• Fire Bolt (Evocation)
  Hurl a mote of fire at a creature or object. 1d10 fire damage.
• Mage Hand (Conjuration)
  Create a spectral hand that can manipulate objects at range.
• Light (Evocation)
  Touch an object to make it shed bright light for 1 hour.

1ST LEVEL • Slots: 2
• Magic Missile (Evocation)
  Three darts of force, each dealing 1d4+1 damage (auto-hit).
• Shield (Abjuration)
  Reaction: +5 AC until start of your next turn.
• Mage Armor (Abjuration)
  Set AC to 13 + Dex modifier for 8 hours.
• Detect Magic (Divination)
  Sense magic within 30 feet for 10 minutes (concentration).
• Identify (Divination)
  Learn properties of a magical object or spell affecting a creature.
• Sleep (Enchantment)
  Put 5d8 HP worth of creatures to sleep.

Spellcasting Ability: Intelligence
```

## Troubleshooting

### Spells not showing up?
- **Old characters**: Characters created before this fix won't have spell data. Create a new character.
- **Non-spellcaster**: Make sure you selected a spellcasting class (Wizard, Sorcerer, Warlock, Bard, Cleric, Druid)
- **Console errors**: Open browser DevTools (F12) and check the Console tab for any JavaScript errors

### Spell selection not appearing in guided mode?
- Make sure you selected a spellcasting class
- Check that you're seeing the ability roll screen first (spells come after abilities)

### Spell data looks wrong?
- Check `character-builder/character-builder-spells.js` for spell definitions
- Verify the spell data structure matches the expected format

## Browser Console Test

You can also test spell data directly in the browser console:

```javascript
// Test if SPELL_DATA is loaded
console.log(typeof SPELL_DATA); // Should output "object"

// Test if a class is a spellcaster
console.log(SPELL_DATA.isSpellcaster('wizard')); // Should output true
console.log(SPELL_DATA.isSpellcaster('fighter')); // Should output false

// Get spells for a class
console.log(SPELL_DATA.getQuickModeSpells('wizard')); // Should show cantrips and firstLevel arrays

// Check current character state
console.log(CharacterState.get().character); // Should show cantrips, spellsKnown, etc. if character is a spellcaster
```

