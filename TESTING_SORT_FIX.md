# Testing the Date Modified Sort Fix

## Quick Test Steps

### 1. Open the Debug Tool (Optional but Recommended)
Open `debug-sort-order.html` in your browser to see the current state:
- View SortMeta cache entries
- See each character's timestamps
- See the calculated sort order

### 2. Test in Character Manager
1. **Refresh the manager** - The fix initializes SortMeta on load
   - Open `character-manager.html`
   - Your newly created character (Elowyn Starfire) should now appear at the top

2. **Create a new character in the builder**
   - Go to the builder and create a new character
   - Save it
   - Return to the manager and refresh
   - The new character should appear at the top

3. **Edit an existing character**
   - In the manager, click "EDIT DETAILS" on any character
   - Modify backstory, equipment, skills, etc.
   - Save
   - That character should move to the top

4. **View a character (automatic portrait upgrade)**
   - View a character that might get an automatic portrait upgrade
   - Check the debug tool - SortMeta should NOT have changed
   - Character should NOT move to the top

### 3. Clear Old Data (If Issues Persist)
If you still see incorrect sort order after refreshing:
1. Open `debug-sort-order.html`
2. Click "🗑️ Clear Sort Meta Cache"
3. Refresh the manager
4. SortMeta will be rebuilt from character timestamps

## What Should Happen

### ✅ SHOULD mark as modified (appear at top):
- Creating a new character in the builder
- Editing character details (backstory, equipment, skills, tools, languages)
- Renaming a character
- Generating a custom AI portrait
- Selecting a portrait from history

### ❌ Should NOT mark as modified:
- Viewing a character
- Automatic portrait upgrades (background operations)
- Simply opening the manager
- Switching between characters

## Debug Tool Features

The `debug-sort-order.html` tool shows:
- **SortMeta Cache**: All entries in the sort metadata cache
- **Characters (Current Order)**: Shows each character with all three timestamps:
  - `createdAt`: When the character was first created
  - `updatedAt`: When the character was last modified
  - `SortMeta`: The cached sort timestamp (if exists)
  - `Effective Sort Time`: Which timestamp is being used for sorting
- **Characters (Sorted)**: The actual sort order the manager will use

### Reading the Debug Tool
- Look for characters with `MISSING` timestamps (should be none after the fix)
- Look for characters with `NONE` in SortMeta (should be none after first load)
- The "Effective Sort Time" shows which timestamp wins for sorting
- Compare the sorted order with what you see in the manager

## Troubleshooting

### Character still in wrong position after refresh?
1. Check `debug-sort-order.html` to see what timestamps are being used
2. Clear the SortMeta cache using the debug tool
3. Refresh the manager

### New characters not appearing at top?
1. Check if the character was created recently (look at `createdAt` in debug tool)
2. If the character has an old `createdAt` from being created days ago, that's working correctly
3. The "date modified" sort uses the timestamp from when the character was last changed

### Old character appearing at top?
1. Check its SortMeta entry in the debug tool
2. If it has a recent timestamp, it was recently modified
3. This could be from before the "silent update" fix was applied
4. Clear SortMeta cache to reset all timestamps from character data

