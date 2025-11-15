# Demo Mode - ASCII Character Portraits

## Overview

Demo mode displays dynamically-generated ASCII art portraits of D&D characters during the character creation process. As users select their race and class, the portrait updates in real-time to show a visual representation of their character.

## Features

✅ **Live Preview** - ASCII art appears as soon as race is selected  
✅ **Dynamic Updates** - Portrait changes when class is selected  
✅ **Proper Encoding** - Uses safe text handling to avoid JavaScript issues with special characters  
✅ **Responsive Layout** - Two-column layout with form on left, portrait on right  
✅ **Retro Aesthetic** - Green terminal-style text with glow effect  

## Implementation

### Files Created/Modified

1. **`web/src/lib/asciiArt.ts`** - NEW
   - Utility functions for loading ASCII art files
   - Safe character encoding handling
   - Placeholder art generation

2. **`web/src/pages/CharacterCreation.tsx`** - MODIFIED
   - Added ASCII art state management
   - Implemented two-column layout
   - Added live preview panel with retro styling
   - Auto-loads art when race/class changes

3. **`web/vite.config.ts`** - MODIFIED
   - Added filesystem permissions to serve generated_portraits from parent directory

4. **`web/generated_portraits/`** - SYMLINK
   - Symlink to `../generated_portraits/` for development

### How It Works

```
User selects Race (e.g., "Human")
    ↓
useEffect triggers on formData.race change
    ↓
loadAsciiArt("Human") called
    ↓
Fetches /generated_portraits/ascii/human.txt
    ↓
Sets asciiArt state → renders in preview panel
```

When class is selected:
```
User selects Class (e.g., "Fighter")
    ↓
useEffect triggers on formData.character_class change
    ↓
loadAsciiArt("Human", "Fighter") called
    ↓
Tries /generated_portraits/ascii/human-fighter.txt first
    ↓
Falls back to human.txt if not found
    ↓
Updates preview panel with new portrait
```

## ASCII Art Files

The ASCII portraits are located in:
```
generated_portraits/ascii/
├── human.txt              # Race-only portraits
├── elf.txt
├── dwarf.txt
├── ...
├── human-fighter.txt      # Race+class combinations
├── human-wizard.txt
├── elf-ranger.txt
└── ...
```

**Naming Convention:**
- Race only: `{race}.txt` (e.g., `human.txt`)
- Race + Class: `{race}-{class}.txt` (e.g., `human-fighter.txt`)
- All lowercase, hyphens for multi-word names

## Character Encoding

The ASCII art files contain special characters (backslashes, etc.) that could cause JavaScript issues. The implementation handles this by:

1. **Loading as plain text** - Files are fetched as `.txt` files
2. **Direct rendering** - Content is placed directly into `<pre>` tags
3. **No escaping needed** - React handles text content safely

Previous implementations used Base64 encoding, but direct text loading is simpler and works perfectly with React's text rendering.

## Styling

The ASCII preview uses:
- **Dark background** (`bg-gray-900`) for contrast
- **Green text** (`text-green-400`) for retro terminal look
- **Text shadow** for glow effect
- **Small font** (`text-[0.5rem]`) to fit the portrait
- **Monospace font** for proper ASCII alignment
- **Tight letter spacing** for compact display

## Testing

### Quick Test (Static HTML)
1. Open `web/test-ascii.html` in a browser
2. Ensure dev server is running on port 3000
3. Select different races and classes
4. Verify portraits load and display correctly

### Full Test (React App)
1. Start the dev server: `cd web && npm run dev`
2. Navigate to Character Creation page
3. Verify placeholder shows on load
4. Select a race → portrait should update immediately
5. Select a class → portrait should update to race-class combo
6. Change race → portrait updates
7. Change class → portrait updates

## Future Enhancements

Potential improvements:
- [ ] Smooth fade transition between portraits
- [ ] Zoom/pan controls for large portraits
- [ ] Color customization (different terminal colors)
- [ ] Save portrait with character
- [ ] Generate custom portraits on-demand
- [ ] Mobile-optimized portrait sizing
- [ ] Animation effects (typewriter, scan lines)

## Troubleshooting

### Portrait not loading
- Check browser console for 404 errors
- Verify `generated_portraits/ascii/` contains the .txt files
- Confirm symlink exists: `ls -la web/generated_portraits`
- Check Vite config has `fs: { allow: ['..'] }`

### Portrait displays incorrectly
- Verify font is monospace
- Check letter-spacing is negative (`-0.05em`)
- Ensure `whitespace-pre` is set on the `<pre>` tag
- Check file encoding is UTF-8

### Special characters broken
- Verify files are loaded as plain text, not parsed as JavaScript
- Check that content is in `<pre>` tag, not processed through template literals
- Ensure React is rendering as text content, not dangerouslySetInnerHTML

## Development Notes

### Port Configuration
- Web app runs on port 3000 (Vite)
- API backend runs on port 8000 (FastAPI)
- ASCII art served as static assets via Vite

### File Access
The symlink approach works for development but for production deployment:
1. Copy `generated_portraits/` into `web/public/` before building
2. Or configure server to serve the directory
3. Or bundle portraits into the app

### Performance
- ASCII files are ~10-30KB each
- Loaded on-demand (not bundled)
- Cached by browser after first load
- Minimal impact on page performance

---

**Branch:** `demo-mode`  
**Status:** ✅ Implemented and tested  
**Created:** 2025-11-14

