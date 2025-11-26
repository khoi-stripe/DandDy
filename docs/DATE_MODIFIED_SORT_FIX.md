# Date Modified Sort Fix

## Problems Identified

### Problem 1: Automatic Background Operations
Characters were being marked as "modified" due to automatic background operations (portrait upgrades), not just user-initiated edits.

### Problem 2: Builder/Manager SortMeta Mismatch
The builder and manager share the same localStorage (`'dnd_characters'`), but SortMeta was only being updated in the manager. This caused:
- Characters created in the **builder** had no SortMeta entry → used their `createdAt` timestamp
- Characters updated in the **manager** had SortMeta entries → used those timestamps
- Result: Old updated characters appeared more recent than newly created ones

## Goal
Ensure that ONLY user-initiated edits mark a character as modified:
- Editing backstory, name, equipment, etc.
- Generating custom AI portraits
- Selecting portrait versions from history
- Renaming characters

Automatic background operations (like portrait upgrades) should NOT mark characters as modified.

## Solutions

### 1. Added Silent Update Mode (Problem 1 Fix)
Modified `CharacterStorage.update()` in `character-manager.js` to accept an optional `options` parameter:
- `{ silent: false }` (default) - Normal updates that mark character as modified
- `{ silent: true }` - Silent updates that don't update the timestamp

**Key changes:**
- When `silent: true`, the update doesn't call `SortMeta.touch(id)`
- When `silent: true`, the `updatedAt` timestamp isn't updated
- All existing update calls default to non-silent mode (backward compatible)

### 2. Updated Portrait Upgrade Logic (Problem 1 Fix)
Modified `_applyUpgradedPortrait()` in `shared-character-sheet.js`:
- Now uses `{ silent: true }` when calling `CharacterStorage.update()`
- Automatic portrait upgrades no longer mark characters as modified
- The portrait is still saved and cached properly

### 3. Initialize SortMeta for Builder-Created Characters (Problem 2 Fix)
Added `SortMeta.initializeFrom()` method that initializes SortMeta entries using existing character timestamps (doesn't create new timestamps).

When loading characters in `AppState.loadCharacters()`:
- Check each character for a SortMeta entry
- If missing, initialize it from the character's `updatedAt` or `createdAt` timestamp
- This ensures characters created in the builder get proper sort order

**Key insight:** Characters created in the builder now get SortMeta entries that reflect their actual creation time, not the time they were first loaded in the manager.

### 4. Verified User-Initiated Updates
All user-initiated operations continue to use regular (non-silent) mode:
- **Edit Details** (`saveEditDetails`) - Skills, equipment, tools, languages, backstory
- **Rename Character** (`renameCharacter`) - Character name changes
- **Generate Portrait** (`confirmGeneratePortrait`) - Custom AI portrait generation
- **Use Portrait Version** (`usePortraitVersion`) - Selecting from portrait history
- **Delete Portrait Version** (`deletePortraitVersion`) - Removing portrait versions

## How It Works

### Date Modified Tracking
The system uses a two-tier approach:

1. **SortMeta** (localStorage cache)
   - Stores timestamp when `SortMeta.touch(id)` is called
   - Provides instant sort order updates
   - Used as primary sort key

2. **Character.updatedAt** (character object)
   - Updated when character is modified (unless silent mode)
   - Fallback when SortMeta isn't available
   - Syncs with cloud storage

### Sort Priority
When sorting by "date modified", the system uses:
```javascript
SortMeta.getUpdatedAt(id) || character.updatedAt || character.createdAt || 0
```

Newest timestamps appear first (descending order).

## Testing
To verify the fix:

1. **Automatic Portrait Upgrade (should NOT mark as modified)**
   - View a character that has only a race-level portrait
   - The system automatically upgrades to race+class portrait
   - Character should NOT move to top of "date modified" list

2. **User Edits (SHOULD mark as modified)**
   - Edit character backstory, equipment, or other details
   - Character should move to top of "date modified" list
   - Generate a custom AI portrait
   - Character should move to top of "date modified" list
   - Rename a character
   - Character should move to top of "date modified" list

## Files Modified
- `character-manager.js` 
  - Added silent mode to `CharacterStorage.update()` and `_localUpdate()`
  - Added `SortMeta.initializeFrom()` method
  - Updated `AppState.loadCharacters()` to initialize SortMeta for new characters
- `shared-character-sheet.js` - Updated `_applyUpgradedPortrait()` to use silent mode
- `debug-sort-order.html` - New debug tool to inspect timestamps and sort order

## Backward Compatibility
✅ All existing code continues to work without changes
✅ Default behavior is non-silent (marks as modified)
✅ Only portrait upgrades use the new silent mode

