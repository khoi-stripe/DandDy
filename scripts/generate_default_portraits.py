#!/usr/bin/env python3
"""
Generate default AI portraits for all race/class combinations.

This script generates high fantasy portraits using GPT Image 1 and uploads
them to Cloudflare R2 for use as default character portraits.

Usage:
    cd backend
    source venv/bin/activate
    python ../scripts/generate_default_portraits.py

Options:
    --dry-run       Show what would be generated without making API calls
    --race RACE     Generate only for specific race (e.g., --race elf)
    --class CLASS   Generate only for specific class (e.g., --class wizard)
    --resume        Skip already-generated portraits (checks manifest)
"""

import os
import sys
import json
import time
import argparse
import uuid
from pathlib import Path
from datetime import datetime

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

import openai
import boto3
import httpx

# Configuration
RACES = [
    "dwarf",
    "elf", 
    "halfling",
    "human",
    "dragonborn",
    "gnome",
    "half-elf",
    "half-orc",
    "tiefling",
]

CLASSES = [
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
]

# Race-specific visual descriptions for better prompts
RACE_DESCRIPTIONS = {
    "dwarf": "a dwarf with a beard",
    "elf": "an elf with pointed ears",
    "halfling": "a halfling with curly hair",
    "human": "a human",
    "dragonborn": "a dragonborn with scales",
    "gnome": "a gnome",
    "half-elf": "a half-elf",
    "half-orc": "a half-orc",
    "tiefling": "a tiefling with small horns",
}

# Class-specific visual elements
CLASS_DESCRIPTIONS = {
    "barbarian": "wearing furs, holding an axe",
    "bard": "wearing colorful clothes, holding a lute",
    "cleric": "wearing robes with a holy symbol",
    "druid": "wearing natural clothing with leaves",
    "fighter": "wearing armor, holding a sword",
    "monk": "wearing simple robes in a martial stance",
    "paladin": "wearing plate armor with a shield",
    "ranger": "wearing a cloak, holding a bow",
    "rogue": "wearing leather armor, holding daggers",
    "sorcerer": "with magical energy around their hands",
    "warlock": "wearing dark robes with arcane symbols",
    "wizard": "wearing robes, holding a staff and spellbook",
}

# Output configuration
OUTPUT_DIR = Path(__file__).parent.parent / "generated_portraits" / "images"
MANIFEST_PATH = Path(__file__).parent.parent / "default-portraits-manifest.json"


def get_r2_client():
    """Create R2 client from environment variables."""
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    
    if not all([account_id, access_key, secret_key]):
        print("⚠️  R2 credentials not configured. Images will be saved locally only.")
        return None
    
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


def build_prompt(race: str, class_type: str) -> str:
    """Build a classic high fantasy portrait prompt using the admin-defined style."""
    race_desc = RACE_DESCRIPTIONS.get(race, f"a {race}")
    class_desc = CLASS_DESCRIPTIONS.get(class_type, f"as a {class_type}")
    
    # Classic High-Fantasy style from portrait-prompts.js
    style_lines = [
        "Illustrated in a highly detailed heroic-fantasy realist style rendered entirely in black and white.",
        "Figures should appear idealized and powerful, with smooth, sculpted shading that clearly defines anatomy, posture, and form.",
        "Use soft grayscale gradients to create lifelike highlights and deep, cinematic shadows across skin, armor, fabric, and environmental shapes.",
        "Lighting should feel dramatic and directional, producing strong contrast and a sense of polished, reflective surfaces.",
        "Metal, stone, and ornamental elements may display bright white specular highlights against darker shadow planes, giving the scene a dimensional, sculptural presence.",
        "Aspect ratio 3:4.",
    ]
    
    prompt = f"""Fantasy RPG character portrait: {race_desc} {class_type}, {class_desc}.

{' '.join(style_lines)}"""

    return prompt


def generate_image(prompt: str, model: str = "gpt-image-1", quality: str = "medium") -> tuple[str | None, bytes]:
    """
    Generate an image using OpenAI's API.
    
    Returns: (image_url_or_none, image_bytes)
    """
    import base64
    
    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    response = client.images.generate(
        model=model,
        prompt=prompt,
        n=1,
        size="1024x1024",
        quality=quality,
    )
    
    first_image = response.data[0]
    
    # Check for URL first (DALL-E 3 style)
    image_url = getattr(first_image, "url", None)
    if image_url:
        # Download the image bytes
        with httpx.Client(timeout=60.0) as http_client:
            img_response = http_client.get(image_url)
            img_response.raise_for_status()
            image_bytes = img_response.content
        return image_url, image_bytes
    
    # Check for base64 data (GPT Image 1 style)
    b64_data = getattr(first_image, "b64_json", None)
    if b64_data:
        image_bytes = base64.b64decode(b64_data)
        return None, image_bytes
    
    raise ValueError("OpenAI response contained neither URL nor base64 data")


def upload_to_r2(r2_client, image_bytes: bytes, key: str) -> str:
    """Upload image to R2 and return public URL."""
    bucket_name = os.getenv("R2_BUCKET_NAME")
    public_base = os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")
    
    r2_client.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=image_bytes,
        ContentType="image/png",
    )
    
    if public_base:
        return f"{public_base}/{key}"
    else:
        account_id = os.getenv("R2_ACCOUNT_ID")
        return f"https://{account_id}.r2.cloudflarestorage.com/{bucket_name}/{key}"


def save_locally(image_bytes: bytes, race: str, class_type: str) -> str:
    """Save image locally as fallback."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{race}-{class_type}.png"
    filepath = OUTPUT_DIR / filename
    filepath.write_bytes(image_bytes)
    return str(filepath)


def load_manifest() -> dict:
    """Load existing manifest or return empty structure."""
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text())
    return {
        "generated_at": None,
        "model": "gpt-image-1",
        "quality": "medium",
        "style": "classic_high_fantasy",
        "portraits": {},
    }


def save_manifest(manifest: dict):
    """Save manifest to disk."""
    manifest["generated_at"] = datetime.now().isoformat()
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Generate default character portraits")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated")
    parser.add_argument("--race", type=str, help="Generate only for specific race")
    parser.add_argument("--class", dest="class_type", type=str, help="Generate only for specific class")
    parser.add_argument("--resume", action="store_true", help="Skip already-generated portraits")
    args = parser.parse_args()
    
    # Filter races/classes if specified
    races = [args.race.lower()] if args.race else RACES
    classes = [args.class_type.lower()] if args.class_type else CLASSES
    
    # Validate inputs
    for race in races:
        if race not in RACES:
            print(f"❌ Unknown race: {race}")
            print(f"   Valid races: {', '.join(RACES)}")
            sys.exit(1)
    
    for cls in classes:
        if cls not in CLASSES:
            print(f"❌ Unknown class: {cls}")
            print(f"   Valid classes: {', '.join(CLASSES)}")
            sys.exit(1)
    
    # Load manifest for resume support
    manifest = load_manifest()
    
    # Calculate total
    total = len(races) * len(classes)
    print(f"🎨 Default Portrait Generator")
    print(f"   Model: gpt-image-1")
    print(f"   Quality: medium")
    print(f"   Style: Classic High Fantasy")
    print(f"   Total combinations: {total}")
    print()
    
    if args.dry_run:
        print("📋 DRY RUN - Would generate:")
        for race in races:
            for cls in classes:
                key = f"{race}-{cls}"
                status = "✓ exists" if key in manifest.get("portraits", {}) else "⏳ pending"
                print(f"   {key}: {status}")
                prompt = build_prompt(race, cls)
                print(f"      Prompt: {prompt[:100]}...")
        print()
        print("Run without --dry-run to generate images.")
        return
    
    # Check API key
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set in environment")
        sys.exit(1)
    
    # Setup R2 client
    r2_client = get_r2_client()
    
    # Generate portraits
    generated = 0
    skipped = 0
    failed = 0
    
    for i, race in enumerate(races):
        for j, cls in enumerate(classes):
            key = f"{race}-{cls}"
            current = i * len(classes) + j + 1
            
            # Check if already generated (resume mode)
            if args.resume and key in manifest.get("portraits", {}):
                print(f"[{current}/{total}] ⏭️  Skipping {key} (already exists)")
                skipped += 1
                continue
            
            print(f"[{current}/{total}] 🎨 Generating {key}...")
            
            try:
                # Build prompt
                prompt = build_prompt(race, cls)
                print(f"   Prompt: {prompt[:80]}...")
                
                # Generate image
                start_time = time.time()
                image_url, image_bytes = generate_image(prompt)
                duration = time.time() - start_time
                print(f"   ✅ Generated in {duration:.1f}s")
                
                # Upload to R2 or save locally
                if r2_client:
                    r2_key = f"defaults/{key}.png"
                    final_url = upload_to_r2(r2_client, image_bytes, r2_key)
                    print(f"   ☁️  Uploaded to R2: {final_url}")
                else:
                    local_path = save_locally(image_bytes, race, cls)
                    final_url = f"generated_portraits/images/{key}.png"
                    print(f"   💾 Saved locally: {local_path}")
                
                # Update manifest
                manifest.setdefault("portraits", {})[key] = {
                    "url": final_url,
                    "prompt": prompt,
                    "generated_at": datetime.now().isoformat(),
                }
                
                # Save manifest after each successful generation (for resume support)
                save_manifest(manifest)
                
                generated += 1
                
                # Rate limiting - be nice to the API
                if current < total:
                    print(f"   ⏳ Waiting 2s before next request...")
                    time.sleep(2)
                
            except Exception as e:
                print(f"   ❌ Failed: {e}")
                failed += 1
                # Continue with next portrait
                continue
    
    # Final summary
    print()
    print("=" * 50)
    print(f"🏁 Generation Complete!")
    print(f"   ✅ Generated: {generated}")
    print(f"   ⏭️  Skipped: {skipped}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📄 Manifest: {MANIFEST_PATH}")
    
    if failed > 0:
        print()
        print("💡 Tip: Run with --resume to retry failed portraits")


if __name__ == "__main__":
    main()

