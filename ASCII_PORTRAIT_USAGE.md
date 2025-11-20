# How to Use ASCII Portraits in Character Manager

## Quick Start

### Exporting Characters with ASCII Art

1. **Open the Character Builder** (`character-builder/index.html`)
2. **Create or load a character** with an ASCII portrait
   - The portrait appears automatically as you build your character
   - You can generate custom AI portraits using the "✨ Custom AI Portrait" button
3. **Export the character**:
   - Click the "💾 Export Character" button at the top
   - The JSON file will include the ASCII art automatically
   - Save the file to your computer

### Importing Characters into the Manager

1. **Open the Character Manager** (`character-manager.html`)
2. **Import your character**:
   - Click the "📥 IMPORT" button in the header
   - Either:
     - **Upload file:** Click "Choose File" and select your exported JSON
     - **Paste JSON:** Copy the JSON contents and paste into the textarea
   - Click "IMPORT"
3. **View the character**:
   - Click on the character card in the left panel
   - The ASCII portrait will display at the top of the character sheet
   - If available, click "👁 View Original" to see the original AI-generated image

## What's Included in Exports

When you export a character from the Character Builder, the following portrait data is automatically included:

### ASCII Art
- **Custom AI-generated portraits** (created with the "✨ Custom AI Portrait" button)
- **Pre-generated portraits** (race/class combinations)
- **Template portraits** (fallback ASCII art)

### Original Image URL
- Link to the original AI-generated image (if created with custom AI portrait feature)
- Accessible via the "👁 View Original" button in the Character Manager

## Display Features

### In the Character Sheet
- **Exact Builder Match:** ASCII art display matches the Character Builder styling precisely
- **Font Size:** 6px (desktop), 4px (mobile) - same as builder
- **Cyan Color:** Terminal accent color for high contrast
- **Scrollable:** Horizontal scrolling available for wide portraits
- **Optional original link:** "View Original Art" link appears below portrait when image URL is available

### Backward Compatibility
Your old exported characters will still work! The Character Manager recognizes:
- New format: `portrait.ascii` and `portrait.url`
- Old format: `customPortraitAscii` and `originalPortraitUrl`
- Pre-generated format: `asciiPortrait`

## Examples

### Example 1: Character with Custom AI Portrait
```json
{
  "name": "Elladan Songweaver",
  "race": "elf",
  "class": "bard",
  "portrait": {
    "ascii": "...detailed ASCII art...",
    "url": "https://oaidalleapi..."
  }
}
```
**Result:** Shows ASCII art + "View Original" button

### Example 2: Character with Pre-generated Portrait
```json
{
  "name": "Brom Stonecleaver",
  "race": "dwarf",
  "class": "fighter",
  "portrait": {
    "ascii": "...ASCII art..."
  }
}
```
**Result:** Shows ASCII art only (no original image)

### Example 3: Old Format Character
```json
{
  "name": "Legacy Character",
  "customPortraitAscii": "...ASCII art...",
  "originalPortraitUrl": "https://..."
}
```
**Result:** Still works! Shows ASCII art + "View Original" button

## Troubleshooting

### "No portrait showing up"
- **Check the export:** Open the JSON file and look for `portrait.ascii`, `customPortraitAscii`, or `asciiPortrait`
- **Re-export:** If the field is missing, re-export from the Character Builder
- **Expected behavior:** Characters without ASCII art won't show a portrait section

### "ASCII art looks weird"
- **Font size:** The art is intentionally small (6px) to show detail, same as the Character Builder
- **Scrolling:** Use horizontal scroll if the art is cut off
- **Browser compatibility:** Works best in modern browsers (Chrome, Firefox, Safari, Edge)

### "Original image link doesn't work"
- **Expired URL:** AI-generated image URLs expire after 24-48 hours
- **Expected behavior:** This is normal for DALL-E generated images
- **Solution:** The ASCII art is permanent and won't expire

## Testing

Use the included test page to verify your setup:

```bash
# Open in your browser
open test-ascii-import.html
```

**Test features:**
1. Run extraction logic tests (verifies all format variations work)
2. Load and display actual character JSON (paste Elladan Songweaver JSON to see ASCII art)

## Technical Details

### ASCII Art Specifications
- **Font:** Monospace
- **Size:** 6px (desktop), 4px (mobile) - **same as Character Builder**
- **Line height:** 1.2 - **same as Character Builder**
- **Color:** Cyan (`var(--terminal-accent)`) - **same as Character Builder**
- **Character set:** Extended ASCII including: ` .,'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$`
- **Typical dimensions:** 160 characters wide × 80 lines tall

### Export Format Priority
1. `portrait.ascii` (preferred - new standardized format)
2. `customPortraitAscii` (legacy - custom AI portraits)
3. `asciiPortrait` (legacy - pre-generated portraits)

The Character Manager checks in this order and uses the first available value.

## Related Files

- **Character Builder:** `character-builder/index.html`
- **Character Manager:** `character-manager.html`
- **Test Page:** `test-ascii-import.html`
- **Documentation:** `ASCII_PORTRAIT_INTEGRATION.md`
- **CSS Styles:** `character-manager.css` (lines 355-370)
- **View All Portraits:** `generated_portraits/viewer.html`

