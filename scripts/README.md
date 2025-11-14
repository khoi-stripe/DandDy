# Automated D&D Portrait Generator

This script fully automates the process of generating character portraits for all race and class combinations in your D&D app.

## What It Does

1. **Generates all permutations** - Creates portraits for:
   - 9 race-only portraits (Dwarf, Elf, Halfling, Human, Dragonborn, Gnome, Half-Elf, Half-Orc, Tiefling)
   - 108 race+class combination portraits (9 races × 12 classes)
   - **Total: 117 portraits**

2. **Uses DALL-E 3** - Generates high-quality fantasy art images with custom prompts for each combination

3. **Converts to ASCII art** - Automatically converts each image to 160×80 character ASCII art using Floyd-Steinberg dithering

4. **Stores everything** - Saves both images and ASCII art to organized directories

## Installation

1. Install Python dependencies:
```bash
cd scripts
pip install -r requirements.txt
```

2. Get your OpenAI API key from https://platform.openai.com/api-keys

## Usage

### Basic Usage

```bash
# Set your API key as environment variable (recommended)
export OPENAI_API_KEY='sk-your-key-here'

# Run the generator
python generate_all_portraits.py
```

### Alternative: Pass API key directly

```bash
python generate_all_portraits.py --api-key 'sk-your-key-here'
```

### Options

- `--api-key KEY` - Provide OpenAI API key directly (or use OPENAI_API_KEY env var)
- `--force` - Force regenerate existing portraits (by default, skips already generated ones)
- `--create-js` - Create a JavaScript file that can be imported into the web app

### Full Example

```bash
# Generate all portraits and create JavaScript import file
export OPENAI_API_KEY='sk-your-key-here'
python generate_all_portraits.py --create-js
```

## Output Structure

```
generated_portraits/
├── images/              # PNG images from DALL-E
│   ├── dwarf.png
│   ├── dwarf-barbarian.png
│   ├── elf.png
│   ├── elf-wizard.png
│   └── ...
├── ascii/               # ASCII art text files
│   ├── dwarf.txt
│   ├── dwarf-barbarian.txt
│   ├── elf.txt
│   ├── elf-wizard.txt
│   └── ...
├── manifest.json        # Generation metadata and stats
└── portraits.js         # JavaScript import file (if --create-js used)
```

## Cost Estimate

- DALL-E 3 Standard: $0.040 per image
- Total images: 117
- **Estimated cost: ~$4.68**

## Time Estimate

- Each image takes ~10-15 seconds to generate
- 5 second rate limiting delay between requests
- **Total time: ~30-45 minutes** for all 117 portraits

## Rate Limiting

The script includes:
- Automatic 5-second delays between requests
- Retry logic (3 attempts per image)
- Progress tracking with detailed console output

## Encoding Fix for Backslashes

**⚠️ Important:** ASCII art contains backslash characters (`\`) which can break JavaScript strings.

**✅ Solution:** The script now uses **Base64 encoding** to safely embed ASCII art in JavaScript.

- ASCII art is stored as `.txt` files (human-readable)
- When creating `portraits.js`, art is Base64 encoded
- JavaScript decodes using `atob()` at runtime
- No more backslash escaping issues!

**See:** `ASCII_ENCODING_FIX.md` for full details or `ENCODING_QUICKREF.md` for quick reference.

## Integration with Your App

### Option 1: Use the JavaScript file (Recommended)

After running with `--create-js`:

```javascript
// In your app
import { getPortrait } from './generated_portraits/portraits.js';

// Get race-only portrait
const elfPortrait = getPortrait('elf');

// Get race+class portrait
const elfWizardPortrait = getPortrait('elf', 'wizard');

// The backslashes and special characters display perfectly!
```

### Option 2: Load ASCII files directly

```javascript
// Fetch a portrait
const response = await fetch('/generated_portraits/ascii/elf-wizard.txt');
const asciiArt = await response.text();
```

### Option 3: Inline in your existing code

Copy the ASCII art from the `.txt` files into your existing `AsciiArtService` or `DEMO_PORTRAITS` object.

## Troubleshooting

### "No module named 'PIL'"
```bash
pip install Pillow
```

### "OpenAI API key required"
Make sure you've set the `OPENAI_API_KEY` environment variable or pass it with `--api-key`

### API rate limit errors
The script already includes 5-second delays. If you still hit limits:
1. Check your OpenAI account rate limits
2. Increase the delay in the code if needed
3. Run in batches using `--force` after pausing

### Some portraits failed
The script will continue even if some fail. Check the summary at the end for failed portraits and re-run with `--force` to retry just those.

## Advanced Usage

### Generate only specific combinations

Edit the `RACES` and `CLASSES` lists in the script to generate only what you need:

```python
# Generate only elves
RACES = ["Elf"]
CLASSES = ["Wizard", "Ranger", "Rogue"]
```

### Customize ASCII art size

Edit these constants:

```python
ASCII_WIDTH = 160  # Change to desired width
ASCII_HEIGHT = 80  # Change to desired height
```

### Customize prompts

Edit the `build_prompt()` method to adjust the DALL-E prompts for different art styles.

## Resume After Interruption

The script automatically skips already-generated portraits, so you can safely interrupt and resume:

```bash
# Run until interrupted (Ctrl+C)
python generate_all_portraits.py

# Later, run again - it will skip existing portraits
python generate_all_portraits.py
```

## Manifest File

After generation, check `generated_portraits/manifest.json` for:
- Generation timestamp
- Success/failure statistics
- List of all generated portraits
- Configuration used

## Next Steps

1. **Review the portraits** - Check the generated images and ASCII art
2. **Integrate into your app** - Use one of the integration methods above
3. **Update your UI** - Replace the placeholder ASCII art with the generated versions

Happy adventuring! 🎲✨


