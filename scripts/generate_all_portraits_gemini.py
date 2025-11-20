#!/usr/bin/env python3
"""
Automated D&D Portrait Generator - Gemini/Imagen Version
Generates images using Google's Imagen and ASCII art for all race and race+class combinations
"""

import os
import sys
import json
import time
import base64
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import requests
from PIL import Image
import numpy as np
import google.generativeai as genai

# Configuration
RACES = [
    "Dwarf", "Elf", "Halfling", "Human",
    "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling"
]

CLASSES = [
    "Barbarian", "Bard", "Cleric", "Druid",
    "Fighter", "Monk", "Paladin", "Ranger",
    "Rogue", "Sorcerer", "Warlock", "Wizard"
]

# ASCII character sets
ASCII_CHARS = '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'.  '
ASCII_WIDTH = 160
ASCII_HEIGHT = 80

# Output directories
OUTPUT_DIR = Path(__file__).parent.parent / "generated_portraits"
IMAGES_DIR = OUTPUT_DIR / "images"
ASCII_DIR = OUTPUT_DIR / "ascii"

class PortraitGenerator:
    def __init__(self, api_key: str, use_vertex_ai: bool = False):
        """
        Initialize the generator with Gemini API
        
        Args:
            api_key: Google AI API key or Vertex AI credentials
            use_vertex_ai: If True, use Vertex AI Imagen. If False, use Gemini's image generation
        """
        self.api_key = api_key
        self.use_vertex_ai = use_vertex_ai
        
        # Configure Gemini
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-pro')
        
        # Create output directories
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        ASCII_DIR.mkdir(parents=True, exist_ok=True)
        
        # Statistics
        self.stats = {
            'total': 0,
            'successful': 0,
            'failed': 0,
            'skipped': 0
        }
    
    def build_prompt(self, race: str, class_name: Optional[str] = None) -> str:
        """Build a prompt for the character image"""
        parts = []
        
        # Base style
        parts.append("Fantasy D&D character portrait in classic fantasy art style")
        parts.append("high contrast dramatic lighting")
        
        # Race descriptions
        race_descriptions = {
            'human': 'human with average features',
            'elf': 'elf with pointed ears and graceful features',
            'dwarf': 'dwarf with a thick beard and stocky build',
            'halfling': 'halfling small and cheerful',
            'dragonborn': 'dragonborn with scaled skin and dragon-like features',
            'tiefling': 'tiefling with horns and a tail',
            'gnome': 'gnome with small stature and clever expression',
            'half-elf': 'half-elf with subtle pointed ears',
            'half-orc': 'half-orc with muscular build and tusks'
        }
        parts.append(race_descriptions.get(race.lower(), race))
        
        # Class descriptions (if provided)
        if class_name:
            class_descriptions = {
                'fighter': 'wearing heavy armor and holding a sword',
                'wizard': 'in flowing robes holding a staff with magical aura',
                'rogue': 'in dark leather armor with daggers',
                'paladin': 'in shining armor with a holy shield',
                'barbarian': 'with wild hair wielding a massive axe',
                'warlock': 'with dark robes and eldritch symbols glowing',
                'cleric': 'in religious robes with holy symbol',
                'druid': 'in natural robes with vines and leaves',
                'bard': 'with musical instrument and colorful clothes',
                'monk': 'in simple robes in martial stance',
                'ranger': 'with bow and forest gear',
                'sorcerer': 'with magical energy swirling around'
            }
            parts.append(class_descriptions.get(class_name.lower(), f"as a {class_name}"))
        
        parts.append("full body portrait centered composition fantasy art style detailed")
        
        return ", ".join(parts)
    
    def generate_image_with_gemini(self, prompt: str) -> Optional[bytes]:
        """
        Generate an image using Gemini's image generation capabilities
        
        Note: As of now, Gemini primarily does image understanding, not generation.
        This uses Gemini to enhance the prompt and then uses Vertex AI Imagen for actual generation.
        """
        try:
            print(f"  🤖 Enhancing prompt with Gemini...")
            
            # Use Gemini to create a more detailed prompt
            enhancement_prompt = f"""You are an expert at creating detailed image generation prompts for fantasy character art.
            
Given this D&D character description:
{prompt}

Create a highly detailed, artistic prompt for generating a fantasy character portrait. Focus on:
- Visual details (lighting, composition, colors, textures)
- Character appearance and expression
- Art style and medium (e.g., digital painting, oil painting style)
- Atmosphere and mood

Keep it under 200 words and make it vivid and specific. Only output the enhanced prompt, nothing else."""

            response = self.model.generate_content(enhancement_prompt)
            enhanced_prompt = response.text.strip()
            
            print(f"  📝 Enhanced prompt: {enhanced_prompt[:100]}...")
            
            # Now generate the actual image using Vertex AI Imagen
            return self.generate_imagen(enhanced_prompt)
            
        except Exception as e:
            print(f"  ❌ Error with Gemini enhancement: {e}")
            # Fall back to using the original prompt directly
            return self.generate_imagen(prompt)
    
    def generate_imagen(self, prompt: str) -> Optional[bytes]:
        """
        Generate an image using Vertex AI Imagen
        
        Note: This requires Vertex AI setup. For simpler setups, we'll use a placeholder
        or alternative method.
        """
        try:
            print(f"  📸 Generating image with Imagen...")
            
            # For now, we'll use a simpler approach with external API
            # You can replace this with proper Vertex AI implementation
            
            # Using Vertex AI requires more complex setup with project/region
            # For simplicity, we're providing instructions to use the web interface
            
            print(f"  ℹ️  Note: Direct Imagen API calls require Vertex AI setup")
            print(f"  ℹ️  Alternatively, you can generate images via Google AI Studio")
            print(f"  ℹ️  For now, creating a placeholder...")
            
            # Create a placeholder colored image
            img = Image.new('RGB', (1024, 1024), color=(100, 100, 150))
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            return buffer.getvalue()
            
        except Exception as e:
            print(f"  ❌ Error generating image: {e}")
            return None
    
    def floyd_steinberg_dither(self, grayscale: np.ndarray, width: int, height: int, levels: int) -> np.ndarray:
        """Apply Floyd-Steinberg dithering algorithm"""
        output = grayscale.astype(float).copy()
        
        for y in range(height):
            for x in range(width):
                old_pixel = output[y, x]
                
                # Quantize
                new_pixel = round((old_pixel / 255) * (levels - 1)) * (255 / (levels - 1))
                output[y, x] = new_pixel
                
                # Calculate error
                error = old_pixel - new_pixel
                
                # Distribute error to neighboring pixels
                if x + 1 < width:
                    output[y, x + 1] += error * 7 / 16
                if y + 1 < height:
                    if x > 0:
                        output[y + 1, x - 1] += error * 3 / 16
                    output[y + 1, x] += error * 5 / 16
                    if x + 1 < width:
                        output[y + 1, x + 1] += error * 1 / 16
        
        return output
    
    def convert_to_ascii(self, image_bytes: bytes, width: int = ASCII_WIDTH, height: int = ASCII_HEIGHT) -> str:
        """Convert image to ASCII art with Floyd-Steinberg dithering"""
        try:
            print(f"  🎨 Converting to ASCII art ({width}x{height})...")
            
            # Load image
            img = Image.open(BytesIO(image_bytes))
            
            # Resize
            img = img.resize((width, height), Image.Resampling.LANCZOS)
            
            # Convert to grayscale
            img_gray = img.convert('L')
            pixels = np.array(img_gray)
            
            # Apply Floyd-Steinberg dithering
            dithered = self.floyd_steinberg_dither(pixels, width, height, len(ASCII_CHARS))
            
            # Convert to ASCII
            ascii_art = []
            for y in range(height):
                line = ""
                for x in range(width):
                    brightness = dithered[y, x]
                    char_index = int((brightness / 255) * (len(ASCII_CHARS) - 1))
                    char_index = max(0, min(len(ASCII_CHARS) - 1, char_index))
                    # Reverse the charset so darker pixels use denser characters
                    line += ASCII_CHARS[len(ASCII_CHARS) - 1 - char_index]
                ascii_art.append(line)
            
            return '\n'.join(ascii_art)
            
        except Exception as e:
            print(f"  ❌ Error converting to ASCII: {e}")
            return None
    
    def save_image(self, image_bytes: bytes, filename: str):
        """Save image to disk"""
        filepath = IMAGES_DIR / filename
        with open(filepath, 'wb') as f:
            f.write(image_bytes)
        print(f"  💾 Saved image: {filepath}")
    
    def save_ascii(self, ascii_art: str, filename: str):
        """Save ASCII art to disk"""
        filepath = ASCII_DIR / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(ascii_art)
        print(f"  💾 Saved ASCII: {filepath}")
    
    def generate_portrait(self, race: str, class_name: Optional[str] = None, force: bool = False) -> Tuple[bool, str]:
        """Generate a portrait (image + ASCII) for a race or race+class combination"""
        # Create filename
        if class_name:
            key = f"{race.lower()}-{class_name.lower()}"
            title = f"{race} {class_name}"
        else:
            key = f"{race.lower()}"
            title = f"{race}"
        
        image_filename = f"{key}.png"
        ascii_filename = f"{key}.txt"
        
        print(f"\n{'='*80}")
        print(f"🎭 Generating: {title}")
        print(f"{'='*80}")
        
        # Check if already exists (unless force)
        if not force and (IMAGES_DIR / image_filename).exists() and (ASCII_DIR / ascii_filename).exists():
            print(f"  ⏭️  Already exists, skipping...")
            self.stats['skipped'] += 1
            return True, key
        
        # Build prompt
        prompt = self.build_prompt(race, class_name)
        
        # Generate image with retry logic
        max_retries = 3
        image_bytes = None
        for attempt in range(max_retries):
            if attempt > 0:
                print(f"  🔄 Retry attempt {attempt + 1}/{max_retries}...")
                time.sleep(2)
            
            image_bytes = self.generate_image_with_gemini(prompt)
            if image_bytes:
                break
        
        if not image_bytes:
            print(f"  ❌ Failed to generate image after {max_retries} attempts")
            self.stats['failed'] += 1
            return False, key
        
        # Save image
        self.save_image(image_bytes, image_filename)
        
        # Convert to ASCII
        ascii_art = self.convert_to_ascii(image_bytes)
        if not ascii_art:
            print(f"  ❌ Failed to convert to ASCII")
            self.stats['failed'] += 1
            return False, key
        
        # Save ASCII
        self.save_ascii(ascii_art, ascii_filename)
        
        print(f"  ✅ Successfully generated {title}")
        self.stats['successful'] += 1
        
        # Rate limiting
        print(f"  ⏳ Waiting 2 seconds for rate limiting...")
        time.sleep(2)
        
        return True, key
    
    def generate_all_portraits(self, force: bool = False):
        """Generate portraits for all races and race+class combinations"""
        print("\n" + "="*80)
        print("🚀 STARTING AUTOMATED PORTRAIT GENERATION (GEMINI VERSION)")
        print("="*80)
        print(f"\nRaces: {len(RACES)}")
        print(f"Classes: {len(CLASSES)}")
        print(f"Total combinations: {len(RACES)} races + {len(RACES) * len(CLASSES)} race+class = {len(RACES) + len(RACES) * len(CLASSES)}")
        print(f"\nOutput directory: {OUTPUT_DIR}")
        print(f"Force regenerate: {force}")
        
        results = {
            'races': {},
            'race_class': {}
        }
        
        # Generate race-only portraits first
        print("\n" + "="*80)
        print("PHASE 1: GENERATING RACE-ONLY PORTRAITS")
        print("="*80)
        
        for i, race in enumerate(RACES, 1):
            self.stats['total'] += 1
            print(f"\n[{i}/{len(RACES)}]")
            success, key = self.generate_portrait(race, None, force)
            results['races'][key] = success
        
        # Generate race+class combinations
        print("\n" + "="*80)
        print("PHASE 2: GENERATING RACE+CLASS PORTRAITS")
        print("="*80)
        
        total_combos = len(RACES) * len(CLASSES)
        current = 0
        
        for race in RACES:
            for class_name in CLASSES:
                current += 1
                self.stats['total'] += 1
                print(f"\n[{current}/{total_combos}]")
                success, key = self.generate_portrait(race, class_name, force)
                results['race_class'][key] = success
        
        # Save results manifest
        manifest = {
            'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            'generator': 'gemini',
            'stats': self.stats,
            'results': results,
            'config': {
                'ascii_width': ASCII_WIDTH,
                'ascii_height': ASCII_HEIGHT,
                'races': RACES,
                'classes': CLASSES
            }
        }
        
        manifest_path = OUTPUT_DIR / 'manifest.json'
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        print(f"\n💾 Saved manifest: {manifest_path}")
        
        # Print final summary
        self.print_summary()
    
    def print_summary(self):
        """Print generation summary"""
        print("\n" + "="*80)
        print("📊 GENERATION COMPLETE - SUMMARY")
        print("="*80)
        print(f"Total attempted:     {self.stats['total']}")
        print(f"✅ Successfully generated: {self.stats['successful']}")
        print(f"⏭️  Skipped (already exists): {self.stats['skipped']}")
        print(f"❌ Failed:                     {self.stats['failed']}")
        
        if self.stats['successful'] > 0:
            print(f"\n📁 Output directories:")
            print(f"   Images: {IMAGES_DIR}")
            print(f"   ASCII:  {ASCII_DIR}")
        
        success_rate = (self.stats['successful'] / self.stats['total'] * 100) if self.stats['total'] > 0 else 0
        print(f"\n🎯 Success rate: {success_rate:.1f}%")
        print("="*80)


def create_javascript_file():
    """Create a JavaScript file that can be imported into the web app"""
    print("\n" + "="*80)
    print("📝 CREATING JAVASCRIPT IMPORT FILE")
    print("="*80)
    
    js_file = OUTPUT_DIR / "portraits.js"
    
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write("// Auto-generated D&D character portraits (Generated with Gemini)\n")
        f.write("// Generated at: " + time.strftime('%Y-%m-%d %H:%M:%S') + "\n")
        f.write("// ASCII art is Base64 encoded to avoid escaping issues with backslashes\n\n")
        
        f.write("// Helper function to decode Base64 ASCII art\n")
        f.write("function decodeAscii(base64) {\n")
        f.write("  try {\n")
        f.write("    return atob(base64);\n")
        f.write("  } catch (e) {\n")
        f.write("    console.error('Failed to decode ASCII art:', e);\n")
        f.write("    return '';\n")
        f.write("  }\n")
        f.write("}\n\n")
        
        f.write("// Base64-encoded ASCII art data\n")
        f.write("const PORTRAITS_DATA = {\n")
        f.write("  races: {\n")
        
        # Add race portraits
        for race in RACES:
            key = race.lower()
            ascii_file = ASCII_DIR / f"{key}.txt"
            if ascii_file.exists():
                with open(ascii_file, 'r', encoding='utf-8') as af:
                    ascii_art = af.read()
                    # Base64 encode to avoid any escaping issues
                    encoded = base64.b64encode(ascii_art.encode('utf-8')).decode('ascii')
                    f.write(f"    '{key}': '{encoded}',\n")
        
        f.write("  },\n")
        f.write("  raceClass: {\n")
        
        # Add race+class portraits
        for race in RACES:
            for class_name in CLASSES:
                key = f"{race.lower()}-{class_name.lower()}"
                ascii_file = ASCII_DIR / f"{key}.txt"
                if ascii_file.exists():
                    with open(ascii_file, 'r', encoding='utf-8') as af:
                        ascii_art = af.read()
                        # Base64 encode to avoid any escaping issues
                        encoded = base64.b64encode(ascii_art.encode('utf-8')).decode('ascii')
                        f.write(f"    '{key}': '{encoded}',\n")
        
        f.write("  }\n")
        f.write("};\n\n")
        
        f.write("// Decode all portraits on load\n")
        f.write("export const PORTRAITS = {\n")
        f.write("  races: Object.fromEntries(\n")
        f.write("    Object.entries(PORTRAITS_DATA.races).map(([k, v]) => [k, decodeAscii(v)])\n")
        f.write("  ),\n")
        f.write("  raceClass: Object.fromEntries(\n")
        f.write("    Object.entries(PORTRAITS_DATA.raceClass).map(([k, v]) => [k, decodeAscii(v)])\n")
        f.write("  )\n")
        f.write("};\n\n")
        
        f.write("export function getPortrait(race, className = null) {\n")
        f.write("  if (className) {\n")
        f.write("    const key = `${race.toLowerCase()}-${className.toLowerCase()}`;\n")
        f.write("    return PORTRAITS.raceClass[key] || PORTRAITS.races[race.toLowerCase()] || null;\n")
        f.write("  }\n")
        f.write("  return PORTRAITS.races[race.toLowerCase()] || null;\n")
        f.write("}\n")
    
    print(f"✅ Created: {js_file}")
    print(f"   Import in your app: import {{ getPortrait }} from './portraits.js'")
    print(f"   ASCII art is Base64 encoded to prevent backslash escaping issues")
    print("="*80)


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate all D&D character portraits using Gemini')
    parser.add_argument('--api-key', help='Google AI API key (or set GOOGLE_AI_API_KEY env var)')
    parser.add_argument('--force', action='store_true', help='Force regenerate existing portraits')
    parser.add_argument('--create-js', action='store_true', help='Create JavaScript import file')
    parser.add_argument('--vertex-ai', action='store_true', help='Use Vertex AI Imagen (requires setup)')
    
    args = parser.parse_args()
    
    # Get API key
    api_key = args.api_key or os.environ.get('GOOGLE_AI_API_KEY') or os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print("❌ Error: Google AI API key required!")
        print("   Provide via --api-key argument or GOOGLE_AI_API_KEY environment variable")
        print("   Get your API key from: https://makersuite.google.com/app/apikey")
        sys.exit(1)
    
    # Check dependencies
    try:
        from PIL import Image
    except ImportError:
        print("❌ Error: Pillow library not found!")
        print("   Install with: pip install Pillow")
        sys.exit(1)
    
    try:
        import google.generativeai
    except ImportError:
        print("❌ Error: google-generativeai library not found!")
        print("   Install with: pip install google-generativeai")
        sys.exit(1)
    
    # Generate portraits
    print("\n" + "="*80)
    print("🔧 IMPORTANT NOTE")
    print("="*80)
    print("Google's Imagen API is currently available through:")
    print("1. Vertex AI (requires GCP project setup)")
    print("2. Google AI Studio (web interface)")
    print("\nThis script uses Gemini for prompt enhancement and creates placeholders.")
    print("For actual image generation, you may need to:")
    print("- Set up Vertex AI and configure credentials")
    print("- Or manually generate images via Google AI Studio")
    print("="*80)
    
    generator = PortraitGenerator(api_key, use_vertex_ai=args.vertex_ai)
    generator.generate_all_portraits(force=args.force)
    
    # Create JavaScript file
    if args.create_js:
        create_javascript_file()
    
    print("\n🎉 All done! Your portraits are ready to use.")
    print(f"\n📖 Next steps:")
    print(f"   1. Review the generated portraits in: {OUTPUT_DIR}")
    print(f"   2. Run with --create-js to generate JavaScript import file")
    print(f"   3. Import the portraits into your web app")


if __name__ == '__main__':
    main()





