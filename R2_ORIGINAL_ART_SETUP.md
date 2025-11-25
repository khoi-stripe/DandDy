# R2 Original Art Storage - Setup Complete ✅

## What Was Done

I've set up the system to store and display original pre-generated portrait images from your R2 bucket. Here's what's ready:

### 1. Upload Script Created ✅
**Location:** `scripts/upload_pre_generated_portraits_to_r2.py`

This script will upload all 117 PNG files from `generated_portraits/images/` to your R2 bucket with keys like:
- `portraits/pregen/elf-wizard.png`
- `portraits/pregen/dwarf-fighter.png`
- etc.

### 2. Frontend Configuration Updated ✅
**Location:** `character-builder/character-builder-config.js`

Added `PREGENERATED_PORTRAIT_BASE_URL` config option. Once you set this to your R2 public URL, the app will automatically construct URLs for original portrait images.

### 3. Portrait Service Updated ✅
**Location:** `character-builder/character-builder-services.js`

The `AsciiArtService` now:
- Computes R2 URLs for pre-generated portraits when `PREGENERATED_PORTRAIT_BASE_URL` is configured
- Stores `originalPortraitUrl` alongside ASCII art
- Exports this URL in character JSON so it flows to the Character Manager

### 4. Helper Scripts Created ✅
- `scripts/UPLOAD_INSTRUCTIONS.md` - Detailed upload instructions
- `scripts/upload_portraits.sh` - Quick upload script with credential checking

## What You Need to Do

### Step 1: Upload the Portraits to R2

You have two options:

#### Option A: Use the helper script (recommended)
```bash
cd /Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/scripts

# Set your R2 credentials (same as backend)
export R2_ACCOUNT_ID="your-account-id"
export R2_ACCESS_KEY_ID="your-access-key"
export R2_SECRET_ACCESS_KEY="your-secret-key"
export R2_BUCKET_NAME="danddy-portraits"

# Run the upload
./upload_portraits.sh
```

#### Option B: Run the Python script directly
```bash
cd /Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/scripts

# Set credentials (as above)
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_BUCKET_NAME="..."

# Dry run first (no actual uploads)
python upload_pre_generated_portraits_to_r2.py --dry-run

# Then upload for real
python upload_pre_generated_portraits_to_r2.py
```

### Step 2: Configure the Frontend

After uploading, edit `character-builder/character-builder-config.js` and set:

```javascript
// Add this to window.CONFIG:
PREGENERATED_PORTRAIT_BASE_URL: 'https://your-account.r2.dev/danddy-portraits/portraits/pregen',
```

**Important:** Replace `your-account` with your actual R2 account ID.

If you used a custom `--prefix` when uploading, adjust the path accordingly.

### Step 3: Test It Out

1. Open the Character Builder
2. Create a character with a pre-generated portrait (e.g., Elf Wizard)
3. You should now see a "View Original Art" button that shows the PNG from R2
4. Export the character and import it into Character Manager
5. The original art link should work there too

## How It Works

### Before (ASCII only)
```
Character → ASCII art from .txt file
          → No original image available
```

### After (ASCII + Original)
```
Character → ASCII art from .txt file
          → Original PNG from R2 bucket
          → "View Original Art" button appears
          → Original URL saved in character data
```

### Data Flow
1. **Builder loads pre-generated portrait:**
   - Fetches ASCII from `generated_portraits/ascii/elf-wizard.txt`
   - Computes R2 URL: `https://your-account.r2.dev/.../portraits/pregen/elf-wizard.png`
   - Stores both in character: `asciiPortrait` + `originalPortraitUrl`

2. **Character is exported:**
   - JSON includes: `portrait: { ascii: "...", url: "https://..." }`
   - Also includes: `originalPortraitUrl: "https://..."`

3. **Manager imports character:**
   - Displays ASCII art
   - Shows "View Original Art" button (already implemented)
   - Clicking toggles between ASCII and original PNG

4. **Cloud storage:**
   - When saved to cloud, `originalPortraitUrl` goes to database
   - Retrieved characters have the URL intact
   - Works across devices

## File Structure

```
scripts/
├── upload_pre_generated_portraits_to_r2.py  # Upload script
├── upload_portraits.sh                      # Helper script
├── UPLOAD_INSTRUCTIONS.md                   # Detailed instructions
└── requirements.txt                         # Updated with boto3

character-builder/
├── character-builder-config.js              # Config with PREGENERATED_PORTRAIT_BASE_URL
└── character-builder-services.js            # Updated AsciiArtService

R2 Bucket (after upload):
danddy-portraits/
└── portraits/
    └── pregen/
        ├── elf-wizard.png
        ├── dwarf-fighter.png
        ├── human.png
        └── ... (117 total)
```

## Benefits

✅ **Original art preserved** - High-quality PNGs stored in R2  
✅ **Automatic URLs** - Frontend computes URLs automatically  
✅ **View toggle** - Users can switch between ASCII and original  
✅ **Export/import** - Original URLs flow through character data  
✅ **Cloud sync** - URLs stored in database for cross-device access  
✅ **Backward compatible** - Works with existing ASCII-only characters  

## Troubleshooting

### "R2 credentials not configured"
Make sure you've exported all required environment variables before running the upload script.

### "No module named 'boto3'"
Run: `pip install boto3` or `pip install -r scripts/requirements.txt`

### Original art not showing
1. Check that `PREGENERATED_PORTRAIT_BASE_URL` is set in config
2. Verify the URL format matches your R2 bucket setup
3. Check browser console for 404 errors
4. Ensure R2 bucket has public read access for the `portraits/pregen/` prefix

### URLs are wrong
If you used a custom `--prefix` when uploading, make sure `PREGENERATED_PORTRAIT_BASE_URL` matches:
- Upload prefix: `portraits/pregen` → Config URL: `https://...r2.dev/bucket-name/portraits/pregen`
- Upload prefix: `custom/path` → Config URL: `https://...r2.dev/bucket-name/custom/path`

## Next Steps

1. ✅ Upload portraits to R2 (see Step 1 above)
2. ✅ Configure frontend URL (see Step 2 above)
3. ✅ Test in Character Builder
4. ✅ Test in Character Manager
5. ✅ Verify cloud sync works

---

**Status:** Ready to upload! Follow the steps above to complete the setup.

**Questions?** Check `scripts/UPLOAD_INSTRUCTIONS.md` for more details.

