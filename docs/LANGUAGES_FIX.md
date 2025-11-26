# Language Display Fix

## Issue

In the character builder, the Languages section sometimes appeared in the character sheet but showed no actual languages. This happened because:

1. Race data in `DND_DATA` was missing the `languages` property
2. The character sheet tried to display languages from `raceData.languages` which was `undefined`
3. Only background language choices were shown, without the base racial languages

## Fix Applied

### 1. Added Languages to All Races

Updated `character-builder-dnd-data.js` to include proper language arrays for each race:

```javascript
{
  id: 'elf',
  name: 'Elf',
  // ... other properties
  languages: ['Common', 'Elvish'],  // ← Added
}
```

**Language Assignments (per D&D 5e rules):**
- Human: Common
- Elf: Common, Elvish
- Dwarf: Common, Dwarvish
- Halfling: Common, Halfling
- Dragonborn: Common, Draconic
- Gnome: Common, Gnomish
- Half-Elf: Common, Elvish
- Half-Orc: Common, Orc
- Tiefling: Common, Infernal

### 2. Improved Language Display

Updated `shared-character-sheet.js` to display both racial languages AND additional language choices:

**Before:**
- Showed racial languages OR language choices (not both)
- Could show empty Languages section if data was malformed

**After:**
- Shows racial languages first (e.g., "• Common", "• Elvish")
- Then shows additional choices if applicable (e.g., "+ Choose 2 additional languages")
- Only displays section if there are languages or choices to show

## Example Output

### Elf Wizard with Sage Background

```
[ LANGUAGES ]
• Common
• Elvish
+ Choose 2 additional languages
```

### Dwarf Fighter with Soldier Background

```
[ LANGUAGES ]
• Common
• Dwarvish
```

### Human Cleric with Acolyte Background

```
[ LANGUAGES ]
• Common
+ Choose 2 additional languages
```

## Technical Details

The fix ensures proper data flow:

1. **Race Definition** → includes `languages: ['Common', 'Elvish']`
2. **Character Building** → copies to `raceData.languages`
3. **Character Sheet Parsing** → merges into `parsed.languages`
4. **Rendering** → displays both languages and choices together

## Files Modified

- `character-builder/character-builder-dnd-data.js` - Added languages to all 9 races
- `shared-character-sheet.js` - Improved `_renderLanguages()` to show both languages and choices

## Testing

To verify the fix works:

1. Create a new character in the builder
2. Choose any race and background
3. Complete character creation
4. Verify the Languages section shows:
   - Base racial languages (e.g., Common + racial language)
   - Additional choices from background (if applicable)

## Backward Compatibility

✅ Characters created before this fix will still work correctly
- The parsing logic checks for `character.raceData?.languages || []`
- Falls back to empty array if undefined
- No data migration needed


