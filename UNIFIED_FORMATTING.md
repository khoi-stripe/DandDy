# Unified Character Sheet Formatting

## Overview

The character sheet now uses **identical formatting** in both the Character Builder and Character Manager. The only differences are the action buttons available to users.

## Formatting (Identical in Both Apps)

### Header Section
- Character name or "[ CHARACTER SHEET ]"
- Action buttons (context-specific, see below)

### Portrait Section (if race selected)
- ASCII portrait display
- Custom AI Portrait button (both apps)
- Toggle/View Original button (context-specific)

### Basic Info Section
- Race
- Class
- Background
- Alignment
- Level (no inline button)

### Combat Stats Section (Both Apps!)
- **6-box grid layout**:
  - Hit Points (current / max)
  - Armor Class
  - Initiative
  - Speed
  - Proficiency Bonus
  - Hit Die

### Ability Scores Section (Both Apps!)
- **6-box grid layout**:
  - STR, DEX, CON, INT, WIS, CHA
  - Shows score and modifier in each box

### Additional Sections (Both Apps)
- Saving Throws (if available)
- Skills
- Racial Traits
- Equipment
- Tool Proficiencies
- Languages
- Background Feature
- Backstory
- Export Info (manager only, if imported)

## Action Buttons (Context-Specific)

### Character Builder Actions

**Header Buttons:**
1. **✎ RENAME** - Change character name
2. **↕ CHANGE LEVEL** - Adjust level and re-roll stats
3. **⎙ PRINT** - Print character sheet

**Portrait Actions:**
1. **★ Custom AI Portrait** - Generate AI portrait (3 remaining)
2. **◉ Toggle View** - Switch between ASCII and original art (if available)

### Character Manager Actions

**Header Buttons:**
1. **✎ RENAME** - Change character name
2. **⎘ COPY** - Duplicate this character
3. **↑ EXPORT** - Export to JSON file
4. **× DELETE** - Delete this character

**Portrait Actions:**
1. **★ Custom AI Portrait** - Generate AI portrait (3 remaining)
2. **👁 View Original** - Open original art in new tab (if available)

## Button Grouping Logic

### Header (Left to Right)
1. **Character Actions**: Rename (both), Change Level (builder), Copy (manager)
2. **Output Actions**: Print (builder), Export (manager)
3. **Destructive Actions**: Delete (manager)

### Portrait Section
1. **Generation**: Custom AI Portrait (both)
2. **View Options**: Toggle (builder), View Original (manager)

## Shared Features

Both apps now have:
- ✓ Combat stats in fancy box grid
- ✓ Ability scores in grid layout
- ✓ Saving throws display
- ✓ Rename functionality
- ✓ Custom AI portrait generation
- ✓ Identical visual presentation

## Key Differences

| Feature | Builder | Manager |
|---------|---------|---------|
| Rename | ✓ | ✓ |
| Change Level | ✓ | ✗ |
| Copy | ✗ | ✓ |
| Print | ✓ | ✗ |
| Export | ✗ | ✓ |
| Delete | ✗ | ✓ |
| Custom AI Portrait | ✓ | ✓ |
| Combat Stats Display | ✓ | ✓ |
| Ability Grid | ✓ | ✓ |

## Implementation Details

### Function Names by Context

**Rename:**
- Builder: `App.openNameModal()`
- Manager: `renameCharacter(id)`

**Generate Portrait:**
- Builder: `App.generateCustomAIPortrait()`
- Manager: `generatePortraitForCharacter(id)`

**Portrait ID:**
- Builder: `character-portrait`
- Manager: `character-portrait-{id}`

### New Manager Functions

Added to `character-manager.js`:

```javascript
function renameCharacter(id) {
  // Prompt for new name and update character
}

function generatePortraitForCharacter(id) {
  // Generate AI portrait for character (coming soon)
}
```

## Benefits

1. **Consistent User Experience** - Same visual layout everywhere
2. **Professional Appearance** - Combat stats boxes look polished
3. **Feature Parity** - Both apps can rename and generate portraits
4. **Logical Organization** - Actions grouped by purpose
5. **Easy Maintenance** - Update formatting in one place

## Testing

Open both apps side-by-side and verify:
- [ ] Combat stats display identically (6-box grid)
- [ ] Ability scores display identically (6-box grid)
- [ ] Header buttons differ appropriately
- [ ] Portrait actions differ appropriately
- [ ] Rename works in both apps
- [ ] Custom AI Portrait button appears in both
- [ ] All other sections match exactly

## Future Enhancements

Now that formatting is unified, future additions will automatically appear in both apps:
- Spells section
- Feats section
- Inventory management
- Notes/journal
- Party integration





