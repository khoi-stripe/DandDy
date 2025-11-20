# Shared Character Sheet Component

## Overview

Created a unified, global character sheet component that is shared between the Character Builder and Character Manager. This eliminates code duplication and ensures consistency across both applications.

## Changes Made

### New File Created

**`shared-character-sheet.js`** - Global character sheet component
- Contains `CharacterSheet` object exposed on `window`
- Main `render()` function that generates character sheet HTML
- Context-aware rendering (builder vs manager)
- Handles multiple data formats (old and new)
- Modular section renderers for each part of the sheet
- Helper functions for data parsing and formatting

### Files Modified

**`character-builder/index.html`**
- Added `<script src="../shared-character-sheet.js"></script>` before components script

**`character-builder/character-builder-components.js`**
- Simplified `renderCharacterSheet()` to use shared component
- Reduced from ~200 lines to ~10 lines

**`character-manager.html`**
- Added `<script src="shared-character-sheet.js"></script>` before manager script

**`character-manager.js`**
- Updated `showCharacterSheet()` to use shared component
- Removed old `renderCharacterSheet()` method (~270 lines)
- Removed `formatModifier()` and `formatSkillName()` helper methods (now in shared component)

## Key Features

### Context-Aware Rendering

The shared component supports two contexts:

**Builder Context:**
- Portrait generation button (with remaining count)
- Rename button
- Toggle portrait view button
- Level change button
- Print button
- Simpler ability display (list format)
- No combat stats section

**Manager Context:**
- Edit/Copy/Export/Delete buttons
- Combat stats grid
- Ability scores grid
- Saving throws section
- Export info section
- Link to view original art

### Data Format Compatibility

Handles both old and new character data formats:
- `hitPoints` as number or `{current, max}` object
- `abilities` vs `abilityScores`
- `skills` vs `skillModifiers`
- Nested data (`raceData`, `classData`, `backgroundData`)
- Multiple portrait sources

### Modular Architecture

Each section is rendered by its own method:
- `_renderHeader()` - Title and action buttons
- `_renderPortrait()` - ASCII portrait and controls
- `_renderBasicInfo()` - Race, class, background, level
- `_renderCombatStats()` - HP, AC, initiative, speed, etc.
- `_renderAbilities()` - STR, DEX, CON, INT, WIS, CHA
- `_renderSavingThrows()` - Saving throw modifiers
- `_renderSkills()` - Skill proficiencies and modifiers
- `_renderRacialTraits()` - Racial traits
- `_renderEquipment()` - Equipment and class equipment
- `_renderToolProficiencies()` - Tool proficiencies
- `_renderLanguages()` - Languages and choices
- `_renderBackgroundFeature()` - Background feature
- `_renderBackstory()` - Character backstory
- `_renderExportInfo()` - Export metadata

### Portrait Handling

The component handles portrait IDs differently based on context:
- **Builder**: Uses `character-portrait` (no suffix)
- **Manager**: Uses `character-portrait-{id}` (with character ID)

Helper function `populatePortrait(character, context)` sets the ASCII text content after DOM insertion.

## Usage

### Character Builder

```javascript
const html = CharacterSheet.render(character, {
  context: 'builder',
  showPortrait: true,
  onGeneratePortrait: true,
  onRename: true,
  onTogglePortrait: true,
  onLevelChange: true,
  onPrint: true,
});
```

### Character Manager

```javascript
const html = CharacterSheet.render(character, {
  context: 'manager',
  showPortrait: true,
  onEdit: true,
  onDuplicate: true,
  onExport: true,
  onDelete: true,
});

// After inserting HTML into DOM:
CharacterSheet.populatePortrait(character, 'manager');
```

## Benefits

1. **Single Source of Truth** - Character sheet only needs to be updated in one place
2. **Consistency** - Both apps display the same information in the same format
3. **Maintainability** - Easier to add new features or fix bugs
4. **Reduced Duplication** - Eliminates ~400+ lines of duplicated code
5. **Flexibility** - Context parameter allows customization per app
6. **Data Format Agnostic** - Handles multiple character data formats automatically

## Testing Checklist

- [ ] Character Builder displays sheet correctly
- [ ] Character Builder portrait animation works
- [ ] Character Builder action buttons work (generate, rename, toggle, level, print)
- [ ] Character Manager displays sheet correctly
- [ ] Character Manager action buttons work (edit, copy, export, delete)
- [ ] Character Manager shows correct character when switching between cards
- [ ] Both apps handle characters with missing data gracefully
- [ ] Both apps handle imported characters (old format)
- [ ] Portrait display works in both apps



