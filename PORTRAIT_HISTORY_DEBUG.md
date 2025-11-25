# Portrait History Debug Guide

## Issue
Portrait history isn't working as expected.

## Changes Made

I've added extensive console logging to help diagnose the issue:

### 1. Portrait Generation Logging (`character-manager.js`)
When generating a custom AI portrait, the console will now show:
- Whether `window.PortraitHistory` exists
- Whether `addVersion` function is available
- The number of versions after adding
- The active version ID
- Warning if PortraitHistory is not available

### 2. Portrait History Modal Logging (`character-manager.js`)
When opening the portrait history modal, the console will show:
- Character ID being opened
- Portrait metadata
- Number of versions found
- Array of all versions

### 3. Button Rendering Logging (`shared-character-sheet.js`)
When rendering the character sheet, the console will show:
- Whether `hasHistory` is true
- The `historyFn` value
- Whether the button will be shown
- Number of versions

## How to Test

### Step 1: Check Console Logs
1. Open `character-manager.html` in a browser
2. Open the browser console (F12)
3. Load a character or generate a custom AI portrait
4. Look for these log messages:
   - `🎨 PORTRAIT HISTORY CHECK` - Shows if PortraitHistory is available
   - `🎨 PORTRAIT HISTORY BUTTON` - Shows if the button will render
   - `🎨 OPENING PORTRAIT HISTORY` - Shows when modal is opened

### Step 2: Generate a Custom AI Portrait
1. Select a character with race and class
2. Click "★ Custom AI Portrait"
3. Enter a description and generate
4. Check console for:
   ```
   🎨 PORTRAIT HISTORY CHECK
     window.PortraitHistory exists: true
     addVersion is function: true
   
   🎨 PORTRAIT HISTORY UPDATED
     Versions count: 1 (or 2 if character had previous portrait)
     Active version: v_1234567890_xxxxx
   ```
5. After generation, check if "⧖ Portrait History" button appears

### Step 3: Check Portrait History Button
1. After generating at least one custom AI portrait, the "⧖ Portrait History" button should appear below the portrait
2. If it doesn't appear, check console for:
   ```
   🎨 PORTRAIT HISTORY BUTTON [Character Name]
     hasHistory: false  <-- This should be true
     historyFn: openPortraitHistory('...')
     Will show button: false  <-- This should be true
     Versions: 0  <-- This should be > 0
   ```

### Step 4: Click Portrait History Button
1. Click the "⧖ Portrait History" button
2. Check console for:
   ```
   🎨 OPENING PORTRAIT HISTORY
     Character ID: xxx
     Portrait metadata: { versions: [...], activeVersionId: ... }
     Versions count: 1
     Versions: [...]
   ```
3. Modal should open showing portrait versions

## Diagnostic Test Page

I've also created `test-portrait-history.html` which provides:
1. Check if PortraitHistory exists
2. Check localStorage characters
3. Test PortraitHistory.addVersion function
4. Check character portrait metadata

Open this file in a browser and click the test buttons to diagnose issues.

## Common Issues

### Issue 1: Button Not Showing
**Symptom:** "⧖ Portrait History" button doesn't appear after generating portraits

**Possible Causes:**
1. `PortraitHistory` not loaded (check console for red error messages)
2. Portrait versions not being saved (check `🎨 PORTRAIT HISTORY UPDATED` log)
3. Character has `customPortraitAscii` but no `portraitMetadata.versions`

**Solution:**
- Generate a NEW custom AI portrait - the code will seed the history with existing portraits
- Check console logs to see where the flow is breaking

### Issue 2: Modal Is Empty
**Symptom:** Button appears but modal shows "No saved portraits yet"

**Possible Causes:**
1. `portraitMetadata.versions` is an empty array
2. Portrait metadata not persisting to storage

**Solution:**
- Check `🎨 OPENING PORTRAIT HISTORY` log for versions count
- Check localStorage: `localStorage.getItem('characters')` and search for `portraitMetadata`

### Issue 3: PortraitHistory Not Available
**Symptom:** Console shows "⚠️ PORTRAIT HISTORY NOT AVAILABLE!"

**Possible Causes:**
1. `shared-character-sheet.js` not loaded
2. Script loading order issue
3. JavaScript error preventing PortraitHistory definition

**Solution:**
- Check browser console for JavaScript errors before portrait generation
- Verify `shared-character-sheet.js` is in the HTML file
- Check that PortraitHistory is defined: `console.log(window.PortraitHistory)`

## Expected Behavior

After generating your FIRST custom AI portrait:
1. The portrait history will have 1-2 versions:
   - Version 1: Previous portrait (if character had one) - seeded automatically
   - Version 2: Newly generated portrait (marked as active)

After generating SUBSEQUENT custom AI portraits:
1. Each new portrait is added to the history
2. Maximum of 5 versions are kept (oldest are removed)
3. The newest portrait is always marked as active

## Next Steps

1. Open character manager in browser
2. Open console (F12)
3. Follow Step 1-4 above
4. Report back with:
   - Console log messages
   - Whether button appears
   - Whether modal opens
   - Any error messages

## Date
November 22, 2025

