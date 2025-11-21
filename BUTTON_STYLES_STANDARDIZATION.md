# Button Styles Standardization

## Overview
Standardized all button classes across the Character Manager and Shared Character Sheet to use consistent `terminal-btn` naming convention.

## Changes Made

### 1. Character Manager HTML (`character-manager.html`)
**Before:**
- Header buttons: `button-primary`
- Empty state button: `button-primary`
- Modal buttons: `terminal-btn`, `terminal-btn-primary`, `terminal-btn-warning`

**After:**
- All buttons now use: `terminal-btn` + modifiers (`terminal-btn-primary`, `terminal-btn-warning`, `terminal-btn-small`)

**Specific Changes:**
- Header "IMPORT" button: `button-primary` → `terminal-btn terminal-btn-primary`
- Header "NEW CHARACTER" button: `button-primary` → `terminal-btn terminal-btn-primary`
- Empty state "CREATE CHARACTER" button: `button-primary` → `terminal-btn terminal-btn-primary`

### 2. Shared Character Sheet (`shared-character-sheet.js`)
**Before:**
- All sheet action buttons: `button-secondary`

**After:**
- All sheet action buttons: `terminal-btn terminal-btn-small`

**Buttons Updated:**
- ✎ RENAME
- ↕ CHANGE LEVEL
- ⎙ PRINT
- ✎ EDIT DETAILS
- × DELETE
- ★ Custom AI Portrait
- ◉ Toggle View
- 👁 View Original

### 3. Terminal Theme CSS (`terminal-theme.css`)
**Added selector for new button classes:**
- Updated `.character-sheet .sheet-title-buttons` to include `.terminal-btn-small` alongside `.button-secondary` for backward compatibility

## Button Class Naming Convention

### Standard Classes
- **`terminal-btn`** - Default button (green border, transparent background)
- **`terminal-btn-primary`** - Primary action button (teal filled background)
- **`terminal-btn-small`** - Small/secondary button (dim border, for less prominent actions)
- **`terminal-btn-warning`** - Warning action button (orange border, for destructive actions like overwrite)
- **`terminal-btn-danger`** - Danger button (red border, for delete actions)

### Legacy Classes (Still Supported)
- **`button-primary`** - Alias for `terminal-btn` (kept for backward compatibility)
- **`button-secondary`** - Alias for `terminal-btn-small` (kept for backward compatibility)

## Benefits
1. **Consistency**: All buttons use the same naming convention
2. **Clarity**: `terminal-btn-*` naming makes it clear these are terminal-themed buttons
3. **Maintainability**: Easier to understand and maintain button styles
4. **Backward Compatibility**: Legacy class names still work (aliases in CSS)

## Modal Button Patterns

### Standard Modal Footer
```html
<div class="modal-footer">
    <button class="terminal-btn" onclick="closeModal()">CANCEL</button>
    <button class="terminal-btn terminal-btn-primary" onclick="confirmAction()">CONFIRM</button>
</div>
```

### Warning Action Modal
```html
<div class="modal-footer">
    <button class="terminal-btn" onclick="closeModal()">CANCEL</button>
    <button class="terminal-btn terminal-btn-warning" onclick="overwrite()">REPLACE</button>
    <button class="terminal-btn terminal-btn-primary" onclick="keepBoth()">KEEP BOTH</button>
</div>
```

## Character Sheet Button Patterns

### Sheet Header Actions
```html
<button class="terminal-btn terminal-btn-small" onclick="action()">
    ICON LABEL
</button>
```

### Portrait Actions
```html
<button class="terminal-btn terminal-btn-small" onclick="generatePortrait()">
    ★ Custom AI Portrait (3)
</button>
```

## Testing Checklist
- [x] Header buttons display correctly
- [x] Empty state button displays correctly
- [x] Modal buttons display correctly with hover states
- [x] Character sheet action buttons display correctly
- [x] Portrait action buttons display correctly
- [x] All buttons maintain teal theme inside character sheet
- [x] All buttons maintain green theme in main UI
- [x] Disabled states work correctly
- [x] No linter errors

## Notes
- The character sheet automatically applies teal theme overrides to all button types
- Modal buttons automatically get teal styling via `.modal .terminal-btn-*` selectors
- Main UI buttons keep the default green terminal theme
- All button classes are fully responsive and work on mobile

