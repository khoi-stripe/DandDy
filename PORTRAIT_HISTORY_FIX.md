# Portrait History - Quick Fix Guide

## The Problem

The "⧖ Portrait History" button only appears when a character has **at least one portrait version saved** in their metadata. If you don't see the button, it means the character doesn't have any portrait versions yet.

## Quick Solution

To enable portrait history for a character:

### Option 1: Generate a New Custom AI Portrait
1. Open Character Manager
2. Select a character
3. Click "★ Custom AI Portrait"
4. Enter a description and generate
5. After generation completes, the "⧖ Portrait History" button should appear

**What happens behind the scenes:**
- If the character already has a portrait (pre-generated ASCII or previous custom), it will be automatically saved as Version 1
- The new portrait will be saved as Version 2 and marked as active
- The button will now appear since there are versions in history

### Option 2: Force Regenerate for Existing Characters
If you have characters with custom AI portraits but no history button:
1. Generate a **new** custom AI portrait for that character
2. The system will automatically:
   - Save their current portrait as Version 1
   - Save the new portrait as Version 2
   - Enable the history button

## Debugging

I've added console logging to help diagnose issues. Open the browser console (F12) and look for:

### When Generating Portraits
```
🎨 PORTRAIT HISTORY CHECK
  window.PortraitHistory exists: true
  addVersion is function: true

🎨 PORTRAIT HISTORY UPDATED
  Versions count: 2
  Active version: v_1234567890_xxxxx
```

If you see "⚠️ PORTRAIT HISTORY NOT AVAILABLE!" then there's a JavaScript loading issue.

### When Viewing Characters
```
🎨 PORTRAIT HISTORY BUTTON [Character Name]
  hasHistory: true
  historyFn: openPortraitHistory('...')
  Will show button: true
  Versions: 2
```

If `hasHistory` is false or `Versions: 0`, the button won't show.

### When Clicking the Button
```
🎨 OPENING PORTRAIT HISTORY
  Character ID: xxx
  Portrait metadata: {...}
  Versions count: 2
  Versions: [...]
```

## Understanding Portrait History

### When is it enabled?
- After generating your FIRST custom AI portrait with the new system
- Previous portraits (if any) are automatically preserved

### What gets saved?
- Up to 5 most recent portrait versions
- Each version includes:
  - ASCII art
  - Original image URL (if available)
  - Generation timestamp
  - Custom prompt used

### How to use it?
1. Click "⧖ Portrait History" button
2. View all saved portrait versions
3. Use arrow keys or click to select a version
4. Click "USE SELECTED" to switch to that portrait
5. Click "Del" on any version to remove it from history

## Migration Path for Old Characters

If you have characters created before this feature was implemented:

1. **They won't have portrait history yet** - This is normal!
2. **Generate one new custom AI portrait** - This will:
   - Seed the history with their current portrait (if they have one)
   - Add the new portrait as a second version
   - Enable the history button
3. **Future portraits will automatically be added** to the history

## Technical Details

### Portrait Metadata Structure
```json
{
  "portraitMetadata": {
    "versions": [
      {
        "id": "v_1732345678901_abc12",
        "createdAt": "2025-11-22T10:30:00.000Z",
        "ascii": "ASCII art here...",
        "url": "https://example.com/image.jpg",
        "source": "custom-ai",
        "prompt": "Your description"
      }
    ],
    "activeVersionId": "v_1732345678901_abc12"
  }
}
```

### When Portrait History is Not Saved
The system will log "⚠️ PORTRAIT HISTORY NOT AVAILABLE!" if:
1. `shared-character-sheet.js` failed to load
2. `window.PortraitHistory` is undefined
3. JavaScript error occurred during initialization

Check the browser console for errors.

## Still Not Working?

If you've followed the steps above and portrait history still isn't working:

1. **Check the Console** - Look for errors or warnings
2. **Check localStorage** - Run in console:
   ```javascript
   const chars = JSON.parse(localStorage.getItem('characters') || '[]');
   console.log(chars.map(c => ({
     name: c.name,
     id: c.id,
     hasPortraitMetadata: !!c.portraitMetadata,
     versions: c.portraitMetadata?.versions?.length || 0
   })));
   ```
3. **Try the test page** - Open `test-portrait-history.html` and run the diagnostic tests
4. **Report the issue** - Include:
   - Console log output
   - Browser and version
   - Steps you took
   - Whether you're in demo mode or logged in

## Summary

**The portrait history feature IS working**, but it only shows the button after a character has portrait versions saved. Generate a new custom AI portrait for any character to enable their portrait history.

## Date
November 22, 2025

