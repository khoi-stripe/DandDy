# ASCII Portrait Integration: Character Builder → Character Manager

## Summary
Implemented ASCII art portrait display in the Character Manager, matching the display style from the Character Builder. When users export characters, the ASCII art is now properly included and displayed in the manager.

## Changes Made

### 1. Character Builder Export Enhancement (`character-builder-app.js`)

**Location:** `buildCompleteCharacter()` function (around line 1500)

**Changes:**
- Added portrait data extraction from multiple sources (`customPortraitAscii`, `asciiPortrait`, or rendered ASCII)
- Created a normalized `portrait` object in the export format with two properties:
  - `portrait.ascii`: The ASCII art string
  - `portrait.url`: The original image URL (if available)
- This ensures backward compatibility while providing a standardized format

```javascript
// Get ASCII art from various possible sources
const portraitAscii = character.customPortraitAscii || character.asciiPortrait || asciiArt || null;

// Normalized portrait object for compatibility with character manager
portrait: portraitAscii || originalPortrait ? {
  ascii: portraitAscii,
  url: originalPortrait
} : null,
```

### 2. Character Manager Display Update (`character-manager.js`)

**Location:** `renderCharacterSheet()` function (around line 265)

**Changes:**
- Updated portrait extraction to check multiple field names for backward compatibility:
  - `portrait.ascii` (new standardized format)
  - `customPortraitAscii` (custom AI-generated portraits)
  - `asciiPortrait` (pre-generated portraits)
- Added display of ASCII portrait with optional "View Original" link
- Portrait section only appears when ASCII art is available

```javascript
// Get ASCII portrait from various possible sources
const asciiPortrait = char.portrait?.ascii || char.customPortraitAscii || char.asciiPortrait || null;
const originalPortraitUrl = char.portrait?.url || char.originalPortraitUrl || null;
```

**Display Features:**
- ASCII art is displayed directly in a div with `white-space: pre` to preserve formatting
- "View Original Art" link appears below the portrait when an original image URL is available
- **Exact match** to the Character Builder's ASCII portrait display styling
- Font size: 6px (desktop), 4px (mobile) - same as builder
- Line height: 1.2 - same as builder
- Color: cyan accent (`var(--terminal-accent)`) - same as builder
- Layout: Uses `portrait-container` wrapper with centered content - same as builder

### 3. CSS Styling (`character-manager.css`)

**Updated:** Lines 355-381, 457-459

The CSS now **exactly matches** the Character Builder's styling:
- `.portrait-container`: Flexbox container for portrait and actions, centered alignment
- `.portrait-actions`: Action buttons displayed below the portrait
- `.ascii-portrait`: Direct text rendering with `white-space: pre`, 6px font size, 1.2 line height, cyan color
- Responsive adjustments for mobile devices (4px font size)

## Backward Compatibility

The implementation supports three formats for exported characters:

1. **New Format (post-update):**
   ```json
   {
     "name": "Character Name",
     "portrait": {
       "ascii": "...ASCII art string...",
       "url": "https://..."
     }
   }
   ```

2. **Old Format with Custom AI Portrait:**
   ```json
   {
     "name": "Character Name",
     "customPortraitAscii": "...ASCII art string...",
     "originalPortraitUrl": "https://..."
   }
   ```

3. **Old Format with Pre-generated Portrait:**
   ```json
   {
     "name": "Character Name",
     "asciiPortrait": "...ASCII art string..."
   }
   ```

All three formats will correctly display ASCII art in the Character Manager.

## Testing

A test page (`test-ascii-import.html`) was created to verify:
1. Portrait extraction logic with all field name variations
2. Priority ordering (portrait.ascii > customPortraitAscii > asciiPortrait)
3. Display rendering with actual character JSON

### To Test Manually:

1. **Export from Character Builder:**
   - Create/load a character with an ASCII portrait
   - Click "Export Character"
   - Save the JSON file

2. **Import to Character Manager:**
   - Open `character-manager.html`
   - Click "📥 IMPORT"
   - Select the exported JSON file or paste the JSON
   - Click "IMPORT"

3. **Verify Display:**
   - Select the imported character from the grid
   - Verify the ASCII portrait displays in the right panel
   - If the character has an original portrait URL, verify the "View Original" button appears

## Files Modified

1. `/character-builder/character-builder-app.js` - Export functionality
2. `/character-manager.js` - Display functionality
3. `/test-ascii-import.html` - Testing tool (new file)
4. `/ASCII_PORTRAIT_INTEGRATION.md` - This documentation (new file)

## Notes

- ASCII art uses a small font size (6px desktop, 4px mobile) to fit the detailed artwork - **same as Character Builder**
- Text rendering uses `white-space: pre` to preserve exact spacing and line breaks
- Scrolling is enabled for very wide ASCII art
- Portrait styling is an **exact match** to the Character Builder for consistency
- The implementation prioritizes the new standardized format but gracefully falls back to legacy field names
- Characters without ASCII art will not show a portrait section (expected behavior)

## Future Enhancements

Potential improvements for future consideration:
- Font size adjustment slider (similar to generated_portraits/viewer.html)
- Toggle between ASCII and original image (like in Character Builder)
- Portrait editing/regeneration from the manager
- Portrait caching for faster display

