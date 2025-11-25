# Upload Pre-Generated Portraits to R2

## Quick Start

1. **Set your R2 credentials** (same ones used by the backend):

```bash
export R2_ACCOUNT_ID="your-account-id"
export R2_ACCESS_KEY_ID="your-access-key-id"
export R2_SECRET_ACCESS_KEY="your-secret-access-key"
export R2_BUCKET_NAME="danddy-portraits"  # or your bucket name
export R2_PUBLIC_BASE_URL="https://your-account.r2.dev/danddy-portraits"  # optional
```

2. **Install boto3** (if not already installed):

```bash
pip install boto3
```

3. **Run a dry-run first** (no actual uploads):

```bash
cd /Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy/scripts
python upload_pre_generated_portraits_to_r2.py --dry-run
```

4. **Upload for real**:

```bash
python upload_pre_generated_portraits_to_r2.py
```

## What This Does

- Uploads all 117 PNG files from `generated_portraits/images/` to your R2 bucket
- Uses keys like: `portraits/pregen/elf-wizard.png`, `portraits/pregen/dwarf.png`, etc.
- Skips files that already exist (unless you use `--overwrite`)
- Shows progress for each file

## Expected Output

```
🚀 Starting upload of pre-generated portraits to R2...
📦 Bucket: danddy-portraits
📁 Prefix: portraits/pregen
🔍 Found 117 PNG files to upload

✅ Uploaded: elf-wizard.png → portraits/pregen/elf-wizard.png
✅ Uploaded: dwarf-fighter.png → portraits/pregen/dwarf-fighter.png
...

✨ Upload complete!
📊 Successfully uploaded: 117
⚠️  Failed: 0
```

## After Upload

Once uploaded, the portraits will be accessible at:
- `https://your-account.r2.dev/danddy-portraits/portraits/pregen/elf-wizard.png`
- `https://your-account.r2.dev/danddy-portraits/portraits/pregen/dwarf.png`
- etc.

The frontend is already configured to use these URLs when displaying "View Original Art" for pre-generated portraits.

## Troubleshooting

### "R2 credentials not configured"
Make sure you've exported all the required environment variables (see step 1 above).

### "No module named 'boto3'"
Run: `pip install boto3`

### "Access Denied"
Check that your R2 credentials are correct and have write permissions to the bucket.

### Files already exist
Use `--overwrite` to force re-upload:
```bash
python upload_pre_generated_portraits_to_r2.py --overwrite
```

