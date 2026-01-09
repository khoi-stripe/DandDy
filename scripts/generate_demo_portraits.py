#!/usr/bin/env python3
"""
Generate demo character portraits in Boris Vallejo style.

Usage:
    export OPENAI_API_KEY='sk-your-key-here'
    python scripts/generate_demo_portraits.py

This generates portraits for the 3 demo characters:
- Lyra Starwhisper (Elf Wizard)
- Thorgrim Ironforge (Dwarf Fighter)
- Zephyr Nightshade (Tiefling Rogue)
"""

import os
import sys
import time
import base64
import requests
from pathlib import Path
from typing import Optional

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "generated_portraits"
IMAGES_DIR = OUTPUT_DIR / "images"
ASCII_DIR = OUTPUT_DIR / "ascii"

# Ensure directories exist
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
ASCII_DIR.mkdir(parents=True, exist_ok=True)

# Demo characters to generate
DEMO_CHARACTERS = [
    {
        "name": "elf-wizard",
        "title": "Lyra Starwhisper - Elf Wizard",
        "prompt": """Create a dramatic fantasy portrait in the style of Boris Vallejo - epic oil painting with rich colors and dramatic lighting.

Subject: A graceful female elf wizard with an ethereal, otherworldly beauty.
- Tall and slender with elegant pointed ears
- Long flowing silver-white hair with arcane energy crackling through it
- Intelligent, luminous violet eyes that glow with inner power
- Wearing elaborate midnight blue and silver wizard robes with celestial patterns
- Holding a crystal orb pulsing with magical energy
- Surrounded by swirling arcane runes and starlight

Style: Boris Vallejo fantasy oil painting - hyper-detailed, dramatic chiaroscuro lighting, rich saturated colors, idealized heroic proportions, painterly brushstrokes visible.

Pose: Standing with one hand raised channeling magic, the other cradling her arcane focus, robes billowing in magical wind.

Background: Deep cosmic void with distant stars and nebulae, creating an epic mystical atmosphere.

Camera: Three-quarter view, slightly low angle to emphasize power and grace."""
    },
    {
        "name": "dwarf-fighter",
        "title": "Thorgrim Ironforge - Dwarf Fighter",
        "prompt": """Create a dramatic fantasy portrait in the style of Boris Vallejo - epic oil painting with rich colors and dramatic lighting.

Subject: A powerfully built male dwarf warrior with the bearing of a seasoned veteran.
- Broad, muscular frame with barrel chest and thick arms
- Long braided red-brown beard decorated with iron rings and battle trophies
- Weathered, battle-scarred face with fierce determined eyes
- Wearing gleaming plate armor etched with dwarven runes and clan symbols
- Holding a massive battleaxe with ornate dwarven craftsmanship
- Shield strapped to back bearing the Ironforge clan crest

Style: Boris Vallejo fantasy oil painting - hyper-detailed, dramatic chiaroscuro lighting, rich warm earth tones and metallic highlights, idealized heroic proportions, painterly brushstrokes visible.

Pose: Standing in a powerful warrior stance, battleaxe gripped in both hands, ready for combat, weight planted solidly.

Background: Inside a grand dwarven forge hall with glowing embers and ancient stone pillars, dramatic firelight.

Camera: Slightly low angle, three-quarter view to emphasize his powerful build and warrior presence."""
    },
    {
        "name": "tiefling-rogue",
        "title": "Zephyr Nightshade - Tiefling Rogue",
        "prompt": """Create a dramatic fantasy portrait in the style of Boris Vallejo - epic oil painting with rich colors and dramatic lighting.

Subject: A sleek, androgynous tiefling rogue with an air of dangerous elegance.
- Lithe, athletic build with graceful proportions
- Deep crimson skin with subtle darker markings
- Elegant curved horns sweeping back from the forehead
- Sharp, intelligent golden eyes with a mischievous glint
- Long dark hair partially obscuring one eye
- Wearing form-fitting black leather armor with silver buckles
- Twin daggers at the hip, one partially drawn

Style: Boris Vallejo fantasy oil painting - hyper-detailed, dramatic chiaroscuro lighting with deep shadows and vibrant highlights, rich jewel tones (crimson, gold, black), idealized heroic proportions, painterly brushstrokes visible.

Pose: Crouched in a dynamic stalking pose, emerging from shadow, one dagger drawn and gleaming, expression confident and cunning.

Background: Moonlit city rooftops with Gothic architecture, dramatic shadows and silver moonlight creating striking contrast.

Camera: Three-quarter view from slightly above, capturing both the lithe form and the dangerous readiness."""
    }
]


class DemoPortraitGenerator:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.stats = {"successful": 0, "failed": 0}

    def generate_dalle_image(self, prompt: str) -> Optional[bytes]:
        """Generate an image using DALL-E 3"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "quality": "hd",
                "response_format": "b64_json"
            }
            
            print("  🎨 Calling DALL-E 3 API...")
            response = requests.post(
                "https://api.openai.com/v1/images/generations",
                headers=headers,
                json=data,
                timeout=120
            )
            
            if response.status_code != 200:
                print(f"  ❌ API Error: {response.status_code}")
                print(f"     {response.text[:200]}")
                return None
            
            result = response.json()
            image_b64 = result["data"][0]["b64_json"]
            image_bytes = base64.b64decode(image_b64)
            
            print("  ✅ Image generated successfully!")
            return image_bytes
            
        except Exception as e:
            print(f"  ❌ Error generating image: {e}")
            return None

    def convert_to_ascii(self, image_bytes: bytes, width: int = 160, height: int = 80) -> str:
        """Convert image to ASCII art"""
        try:
            from PIL import Image
            import io
            
            # Load image
            img = Image.open(io.BytesIO(image_bytes))
            
            # Convert to grayscale
            img = img.convert('L')
            
            # Resize to target dimensions
            img = img.resize((width, height), Image.Resampling.LANCZOS)
            
            # ASCII characters from dark to light
            ascii_chars = ' .:-=+*#%@'
            
            # Convert pixels to ASCII
            pixels = list(img.getdata())
            ascii_art = ''
            for i, pixel in enumerate(pixels):
                # Map pixel (0-255) to character index
                char_idx = int(pixel / 256 * len(ascii_chars))
                char_idx = min(char_idx, len(ascii_chars) - 1)
                ascii_art += ascii_chars[char_idx]
                if (i + 1) % width == 0:
                    ascii_art += '\n'
            
            return ascii_art
            
        except Exception as e:
            print(f"  ❌ Error converting to ASCII: {e}")
            return ""

    def generate_portrait(self, character: dict, force: bool = False) -> bool:
        """Generate a portrait for a demo character"""
        name = character["name"]
        title = character["title"]
        prompt = character["prompt"]
        
        image_filename = f"{name}.png"
        ascii_filename = f"{name}.txt"
        
        print(f"\n{'='*80}")
        print(f"🎭 Generating: {title}")
        print(f"{'='*80}")
        
        # Check if already exists (unless force)
        if not force and (IMAGES_DIR / image_filename).exists():
            print(f"  ⏭️  Already exists. Use --force to regenerate.")
            return True
        
        # Generate image with retry
        max_retries = 3
        image_bytes = None
        
        for attempt in range(max_retries):
            if attempt > 0:
                print(f"  🔄 Retry attempt {attempt + 1}/{max_retries}...")
                time.sleep(5)
            
            image_bytes = self.generate_dalle_image(prompt)
            if image_bytes:
                break
        
        if not image_bytes:
            print(f"  ❌ Failed to generate image after {max_retries} attempts")
            self.stats["failed"] += 1
            return False
        
        # Save image
        image_path = IMAGES_DIR / image_filename
        with open(image_path, 'wb') as f:
            f.write(image_bytes)
        print(f"  💾 Saved image: {image_path}")
        
        # Convert to ASCII and save
        ascii_art = self.convert_to_ascii(image_bytes)
        if ascii_art:
            ascii_path = ASCII_DIR / ascii_filename
            with open(ascii_path, 'w', encoding='utf-8') as f:
                f.write(ascii_art)
            print(f"  💾 Saved ASCII: {ascii_path}")
        
        self.stats["successful"] += 1
        return True

    def generate_all(self, force: bool = False):
        """Generate all demo character portraits"""
        print("\n" + "="*80)
        print("🎨 DEMO CHARACTER PORTRAIT GENERATOR")
        print("    Style: Boris Vallejo Fantasy Oil Painting")
        print("="*80)
        
        for character in DEMO_CHARACTERS:
            self.generate_portrait(character, force=force)
            time.sleep(2)  # Rate limiting
        
        print("\n" + "="*80)
        print("📊 GENERATION COMPLETE")
        print(f"   ✅ Successful: {self.stats['successful']}")
        print(f"   ❌ Failed: {self.stats['failed']}")
        print("="*80)


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate demo character portraits in Boris Vallejo style')
    parser.add_argument('--api-key', help='OpenAI API key (or set OPENAI_API_KEY env var)')
    parser.add_argument('--force', action='store_true', help='Force regenerate existing portraits')
    
    args = parser.parse_args()
    
    # Get API key
    api_key = args.api_key or os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("❌ Error: OpenAI API key required!")
        print("   Provide via --api-key argument or OPENAI_API_KEY environment variable")
        sys.exit(1)
    
    # Check for PIL
    try:
        from PIL import Image
    except ImportError:
        print("❌ Error: Pillow library not found!")
        print("   Install with: pip install Pillow")
        sys.exit(1)
    
    # Generate portraits
    generator = DemoPortraitGenerator(api_key)
    generator.generate_all(force=args.force)
    
    print("\n🎉 Done! Your Boris Vallejo style portraits are ready.")
    print(f"   Images: {IMAGES_DIR}")
    print(f"   ASCII:  {ASCII_DIR}")


if __name__ == '__main__':
    main()



































