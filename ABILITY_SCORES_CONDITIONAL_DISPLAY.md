# Ability Scores Conditional Display Fix

## Issue
In the character builder, the ability scores section was showing immediately with default values (all 10s) before the user had actually rolled their abilities.

## Root Cause
The `hasAbilities` flag in the shared character sheet component was only checking if the abilities object had keys:
```javascript
hasAbilities: Object.keys(abilities).length > 0
```

Since the character state initializes with default ability scores of 10 for all abilities, this check always returned true.

## Solution
Updated `shared-character-sheet.js` to check if abilities have actually been rolled by looking for the `baseAbilities` property, which is set when the user goes through the ability rolling step in the builder.

### Changes Made (Lines 490-492, 572)

**Added ability population check:**
```javascript
// Check if abilities have been actually rolled/populated
// baseAbilities is set when abilities are rolled in the builder
const abilitiesPopulated = character.baseAbilities !== null && character.baseAbilities !== undefined;
```

**Updated hasAbilities flag:**
```javascript
hasAbilities: abilitiesPopulated && Object.keys(abilities).length > 0,
```

## Behavior

### Character Builder
- ✅ Ability scores section is hidden until the user rolls their abilities
- ✅ Once abilities are rolled (baseAbilities is set), the section appears
- ✅ Progressive disclosure - only show stats when they're meaningful

### Character Manager
- ✅ No change in behavior
- ✅ Imported/saved characters always have baseAbilities set, so ability scores always show
- ✅ Backward compatible with existing saved characters

## Files Modified
- `shared-character-sheet.js` - Updated ability population logic

## User Experience Improvement
Users won't see a confusing "ABILITY SCORES" section with all 10s during character creation. The section only appears once they've actually rolled their abilities, making the character sheet more progressive and less cluttered during the creation flow.







