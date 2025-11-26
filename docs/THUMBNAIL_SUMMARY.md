# ASCII Art Thumbnails - Quick Summary

## What's New

Character cards now show **ASCII art thumbnails** for visual character identification!

## Visual Comparison

### BEFORE
```
┌────────────────────────────────────┐
│                                    │
│  Elladan Songweaver                │
│  Elf Bard • Lvl 5                  │
│                                    │
└────────────────────────────────────┘
```

### AFTER
```
┌────────────────────────────────────┐
│ ╔════════════════════════════════╗ │
│ ║     ASCII ART THUMBNAIL        ║ │
│ ║   Full width, vertically       ║ │
│ ║   cropped portrait             ║ │
│ ╚════════════════════════════════╝ │
├────────────────────────────────────┤
│  Elladan Songweaver                │
│  Elf Bard • Lvl 5                  │
└────────────────────────────────────┘
```

## Key Features

✅ **Full-width thumbnails** - 100% card width, 120px height on desktop, 100px on mobile
✅ **Stacked layout** - Image on top, details below
✅ **Auto-cropped** - Vertical center crop, full width preserved
✅ **Tiny font** - 2.4px font size for compact display
✅ **Same styling** - Matches builder's cyan color scheme
✅ **Smart layout** - Vertical stack with border separator
✅ **Backward compatible** - Works with old and new exports

## Technical Details

- **Crop size:** Full width (160 characters) × 50 lines (from 160×80 original)
- **Position:** Vertically centered, horizontally full width
- **Rendering:** Two-pass (HTML structure → populate text)
- **Performance:** Fast string manipulation, no image processing

## Files Changed

1. `character-manager.js` - Added cropping function and thumbnail rendering
2. `character-manager.css` - Added thumbnail styles and flexbox layout

## Try It Now!

1. Open `character-manager.html`
2. Import a character with ASCII art (like Elladan Songweaver)
3. See the thumbnail in the card!

## Notes

- Characters **without** ASCII art display text-only (no empty thumbnail)
- Thumbnails use the **full width** of the ASCII art (160 characters)
- Font is intentionally **very small** (2.4px) to fit detailed art
- Mobile devices get **shorter** thumbnails (100px vs 120px height)
- Layout is **stacked vertically** - image on top, details below

