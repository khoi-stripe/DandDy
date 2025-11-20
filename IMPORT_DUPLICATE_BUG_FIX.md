# Import Duplicate Detection & Resolution

## Problem
When importing characters in the character manager, users were experiencing:
1. **Duplicate imports**: The same character would be imported multiple times
2. **ASCII art corruption**: The second import's ASCII art would appear corrupted

## Root Causes Discovered & Fixed

### Issue #1: Race Condition (FIXED)
A race condition allowed rapid button clicks to trigger imports twice.

The bug was caused by a **race condition** in the `importCharacter()` function.

### The Issue

```javascript
function importCharacter() {
    // Check if already importing
    if (isImporting) {
        return;
    }
    
    // Disable button...
    
    if (fileInput.files.length > 0) {
        isImporting = true;  // ❌ Set flag TOO LATE!
        // ... rest of import logic
    }
}
```

### The Problem Flow

1. **First Click**:
   - Check passes (`isImporting = false`)
   - Button gets disabled
   - Eventually sets `isImporting = true` (line 668)

2. **Second Click** (if it happens quickly):
   - Check passes (`isImporting = false` - **still not set!**)
   - Button gets disabled again
   - Also sets `isImporting = true`
   - Both imports execute in parallel

3. **Result**:
   - Character imported twice
   - Both FileReaders process the same file
   - Second import's ASCII art gets corrupted due to concurrent processing

## Solution

**Set the `isImporting` flag IMMEDIATELY after the check passes**, before any other operations:

```javascript
function importCharacter() {
    // Check if already importing
    if (isImporting) {
        return;
    }
    
    // ✅ Set flag IMMEDIATELY to prevent race condition
    isImporting = true;
    
    // Disable button...
    
    if (fileInput.files.length > 0) {
        // Import logic...
    } else {
        // Reset flag if no file selected
        isImporting = false;
    }
}
```

## Changes Made

1. **Moved flag assignment**: `isImporting = true` now happens immediately after the check (line 660)
2. **Added logging**: Extra console log to track when import is locked
3. **Fixed edge case**: Reset `isImporting = false` when no file is selected (line 711)

## Why This Works

By setting the flag immediately after the check:
- First click: Sets flag before second click can pass the check
- Second click: Fails the check and returns early
- No concurrent imports possible
- ASCII art processes only once

## Testing

To verify the fix works:
1. Open Character Manager
2. Click Import button
3. Select a character JSON file
4. Double-click the Import button rapidly
5. Verify only ONE character is imported
6. Verify ASCII art is NOT corrupted

## New Feature: Duplicate Detection & Resolution

### Issue #2: No Duplicate Prevention (FIXED)

The real issue was not the race condition, but that users could import the same character multiple times (e.g., importing, deleting, then re-importing the same character JSON file).

**Root Cause:**
- Character Builder and Character Manager share the same localStorage (`'dnd_characters'`)
- They use different ID prefixes (`local_` vs `char_`)
- Importing removes the old ID and generates a new one
- This meant re-importing the same character created duplicates

**Solution: Smart Duplicate Detection**

Now when importing a character:

1. **Check for existing character** by name
2. If found, show a **Duplicate Resolution Modal** with options:
   - **CANCEL**: Don't import, close modal
   - **REPLACE EXISTING**: Delete the old character and import the new one
   - **KEEP BOTH**: Import with a modified name (e.g., "Name (Copy)")

### Implementation Details

```javascript
// Duplicate detection in CharacterStorage.import()
const existing = this.getAll();
const duplicates = existing.filter(c => c.name === character.name);

if (duplicates.length > 0) {
    return { isDuplicate: true, name: character.name, existingIds: [...] };
}
```

**Replace Existing:**
```javascript
// Delete old, import new
CharacterStorage.delete(existingId);
const result = CharacterStorage.add(character);
```

**Keep Both:**
```javascript
// Auto-generate unique name
let newName = `${originalName} (Copy)`;
while (existing.some(c => c.name === newName)) {
    copyNumber++;
    newName = `${originalName} (Copy ${copyNumber})`;
}
character.name = newName;
```

## User Experience

### Before Fix
- ❌ Users could import same character multiple times
- ❌ No warning or feedback
- ❌ Ended up with duplicate characters
- ❌ Confusion about which one to keep

### After Fix
- ✅ Detects duplicates by character name
- ✅ Clear modal with 3 options
- ✅ User controls the outcome
- ✅ Visual warning with orange "REPLACE" button
- ✅ ESC key closes modal
- ✅ Click outside closes modal

## Testing

1. **Import a new character** → Should work normally
2. **Import the same character again** → Should show duplicate modal
3. **Choose "REPLACE EXISTING"** → Old deleted, new imported
4. **Import again, choose "KEEP BOTH"** → New character added as "Name (Copy)"
5. **Import again, choose "CANCEL"** → Nothing happens, modal closes

## Note

The race condition fix is still in place (setting `isImporting = true` immediately), but the real value is in the duplicate detection system which prevents accidental duplicates regardless of how they occur.
