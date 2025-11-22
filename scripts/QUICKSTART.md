# Quick Start Guide

Get your automated D&D portrait generation up and running in minutes!

## Prerequisites

- Python 3.8+
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- ~$5 for generating all 117 portraits (or $0.40 for the sample)

## Step 1: Install Dependencies

```bash
cd scripts
pip install -r requirements.txt
```

## Step 2: Set Your API Key

```bash
export OPENAI_API_KEY='sk-your-key-here'
```

💡 **Tip:** Add this to your `~/.bashrc` or `~/.zshrc` to make it permanent.

## Step 3: Choose Your Approach

### 🧪 Option A: Test with Samples (Recommended First)

Generate just 9 portraits to test everything works:

```bash
python generate_sample.py --create-js
```

**Cost:** ~$0.40  
**Time:** ~3 minutes  
**Portraits:** 3 races + 6 race/class combos

### 🚀 Option B: Generate Everything

Generate all 117 portraits:

```bash
./generate.sh
```

Or manually:

```bash
python generate_all_portraits.py --create-js
```

**Cost:** ~$4.70  
**Time:** ~35 minutes  
**Portraits:** 9 races + 108 race/class combos

## Step 4: Check the Output

```bash
# View the generated portraits
ls -la ../generated_portraits/ascii/

# View a sample
cat ../generated_portraits/ascii/elf-wizard.txt

# Check the manifest
cat ../generated_portraits/manifest.json
```

## Step 5: Integrate with Your App

See `INTEGRATION_GUIDE.md` for detailed integration instructions.

**Quick integration:**

```bash
# Copy the portraits module
cp ../generated_portraits/portraits.js ../character-builder/

# Start a local server
cd ../character-builder
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```

Then follow the integration steps in `INTEGRATION_GUIDE.md`.

---

## Common Use Cases

### "I want to test first"

```bash
python generate_sample.py --create-js
```

Then check the `generated_portraits` folder. If it looks good, run the full generation.

### "I want to regenerate specific portraits"

Edit `generate_all_portraits.py` and modify the `RACES` and `CLASSES` lists:

```python
RACES = ["Elf"]  # Just regenerate elves
CLASSES = ["Wizard", "Rogue"]  # Just these classes
```

Then run with `--force`:

```bash
python generate_all_portraits.py --force --create-js
```

### "I want different ASCII art size"

Edit these constants in `generate_all_portraits.py`:

```python
ASCII_WIDTH = 160   # Change to your preferred width
ASCII_HEIGHT = 80   # Change to your preferred height
```

### "I want to customize the art style"

Edit the `build_prompt()` method in `generate_all_portraits.py`. For example:

```python
# For anime style
parts.append("anime style character portrait")

# For pixel art style
parts.append("pixel art character portrait retro 16-bit style")

# For realistic style
parts.append("photorealistic character portrait detailed")
```

---

## Troubleshooting

### Command not found: python

Try `python3` instead:

```bash
python3 generate_all_portraits.py
```

### ModuleNotFoundError: No module named 'PIL'

Install Pillow:

```bash
pip install Pillow
```

### OpenAI API error: Rate limit

The script already waits 5 seconds between requests. If you still hit limits:

1. Check your rate limits on OpenAI dashboard
2. Increase the delay in the script
3. Use a paid OpenAI account (higher limits)

### Some portraits failed

Check the summary at the end. Failed portraits can be regenerated:

```bash
python generate_all_portraits.py --force
```

It will skip successful ones and retry failed ones.

### CORS errors when loading portraits

You need to run a local server:

```bash
cd character-builder
python3 -m http.server 8000
```

Then open `http://localhost:8000` (not `file://`)

---

## Next Steps

1. ✅ Generate portraits (you're here!)
2. 📚 Read `INTEGRATION_GUIDE.md` for integration options
3. 🎨 Integrate into your character builder
4. 🎮 Test with your app
5. 🎉 Enjoy instant portrait loading!

---

## File Overview

```
scripts/
├── generate_all_portraits.py   # Main generator (117 portraits)
├── generate_sample.py          # Quick test (9 portraits)
├── generate.sh                 # Easy run script
├── requirements.txt            # Python dependencies
├── README.md                   # Full documentation
├── INTEGRATION_GUIDE.md        # How to use in your app
└── QUICKSTART.md              # This file!

generated_portraits/            # Created after running
├── images/                     # PNG images (1024x1024)
├── ascii/                      # ASCII art text files
├── manifest.json               # Generation metadata
└── portraits.js                # Ready-to-import module
```

---

## Questions?

- **Full details:** See `README.md`
- **Integration help:** See `INTEGRATION_GUIDE.md`
- **Issues:** Check the Troubleshooting sections

Happy generating! 🎲✨










