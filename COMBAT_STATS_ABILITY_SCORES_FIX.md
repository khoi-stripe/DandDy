# Combat Stats & Ability Scores Styling Fix

## Issue
The combat stats and ability scores in the character builder's right panel (character sheet) were:
1. Not displaying in boxes like they do in the character manager
2. Using green colors instead of teal

## Root Cause
The character-builder.css was missing the box layout styles (`.stat-box`, `.ability-box`, `.stat-grid`, `.ability-grid`) that are used by the shared character sheet component. These styles only existed in the character-manager.css.

## Solution
Added the following styles to `character-builder.css`:

### 1. Combat Stats Grid Layout (Lines 485-507)
```css
/* Combat Stats Grid */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
  margin-top: var(--spacing-sm);
}

.stat-box {
  text-align: center;
  border: 1px solid var(--terminal-dim);
  padding: var(--spacing-sm);
}

.stat-box-label {
  color: var(--terminal-dim);
  font-size: var(--font-size-small);
  margin-bottom: var(--spacing-xs);
}

.stat-box-value {
  color: var(--terminal-fg);
}
```

### 2. Ability Scores Grid Layout (Lines 509-538)
```css
/* Ability Scores Grid */
.ability-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.ability-box {
  border: 1px solid var(--terminal-dim);
  padding: var(--spacing-xs);
  text-align: center;
}

.ability-name {
  color: var(--terminal-dim);
  font-size: var(--font-size-small);
  margin-bottom: var(--spacing-xs);
}

.ability-score {
  color: var(--terminal-fg);
}

.ability-modifier {
  color: var(--terminal-fg);
  font-size: var(--font-size-small);
  display: inline;
  margin-left: 0.25em;
}
```

### 3. Updated Teal Theme Variables (Lines 1273-1278)
Updated the teal color variables to match the manager:
```css
:root {
  --panel-teal: #00CED1;  /* Bright Dark Turquoise - for highlighted elements */
  --panel-teal-dim: #20B2AA;  /* Muted Light Sea Green - for secondary text */
  --panel-teal-bg: #0d4d4a;
}
```

### 4. Added Teal Color Overrides (Lines 1280-1319)
Extended the right panel teal theme to include the new box elements:

**Text colors:**
- Added `.stat-box-value`, `.ability-score`, `.ability-modifier` to use `--panel-teal`
- Added `.stat-box-label`, `.ability-name` to use `--panel-teal-dim`

**Border colors:**
```css
.right-panel .stat-box,
.right-panel .ability-box {
  border-color: var(--panel-teal-dim) !important;
}
```

## Result
- Combat stats (HP, AC, Initiative, Speed, Prof Bonus, Hit Die) now display in a 3-column grid of boxes
- Ability scores (STR, DEX, CON, INT, WIS, CHA) now display in a 3-column grid of boxes
- All stats in the right panel use teal colors (#00CED1 for values, #20B2AA for labels)
- The builder's character sheet now matches the manager's visual formatting

## Files Modified
- `character-builder/character-builder.css` - Added box grid styles and teal color overrides

## Visual Hierarchy
- **Left Panel (Narrator):** Green (`#00ff00`)
- **Right Panel (Character Sheet):** Teal (`#00CED1`)
  - Section headers: Bright teal
  - Stat values: Bright teal
  - Stat labels: Muted teal
  - Box borders: Muted teal

## Consistency Achieved
Both the character builder and character manager now use:
- Identical box grid layouts for combat stats and ability scores
- Identical teal color scheme in the character sheet panels
- Shared character sheet component (`shared-character-sheet.js`)







