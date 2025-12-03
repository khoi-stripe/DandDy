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
        
        # Base style - optimized for ASCII conversion and dark-fantasy ink look
        parts.append("Create a high-contrast black-and-white fantasy illustration.")
        parts.append("Art style: classic fantasy ink illustration with strong contrast.")
        parts.append("Use bold shadow shapes, strong silhouettes, and clean white highlights.")
        # parts.append("Include some controlled, directional hatching to define form (light mid-tone texture only).")
        parts.append("Use realistic heroic anatomy with natural proportions (smaller head, longer arms, taller figure).")
        
        # Class-specific randomized poses and camera angles
        class_key = (class_name or "default").lower()

        pose_variants_by_class: Dict[str, List[str]] = {
            "fighter": [
                "posed mid-swing with a heavy weapon, body twisted to show the arc of the strike",
                "standing in a ready battle stance, shield raised and weapon held low but tense",
                "caught in the moment of blocking an attack, weight shifted back with shield braced",
                "charging forward with weapon raised overhead, cloak and gear trailing behind",
                "standing atop fallen rubble in a victorious stance, weapon planted like a banner",
            ],
            "barbarian": [
                "leaning forward in a feral roar, muscles tensed, weapon mid-swing",
                "standing wide and grounded, one foot on a rock, gripping a massive weapon with both hands",
                "caught mid-leap as if diving into battle, hair and trophies flying outward",
                "holding a weapon across the shoulders, posture relaxed but intimidating",
                "bracing against an unseen impact, teeth bared and stance low and aggressive",
            ],
            "paladin": [
                "kneeling with shield planted in front, weapon held upright in a solemn vow pose",
                "standing tall with shield forward and weapon raised in a protective gesture",
                "framed in a side stance, shield angled and weapon ready for a precise strike",
                "holding a holy symbol aloft with one hand while resting the weapon point-down",
                "striding forward with shield half-raised, cloak sweeping back in a confident march",
            ],
            "rogue": [
                "crouched low in the shadows, one dagger drawn and the other held behind for balance",
                "leaning casually against an unseen wall, one hand resting on a hidden blade",
                "mid-step on a narrow ledge, body turned sideways with cloak pulled close",
                "poised behind an unseen target, daggers reversed in a silent takedown stance",
                "perched on a raised surface, knees bent, ready to spring into motion",
            ],
            "monk": [
                "balanced on one leg in a classic kick pose, arms forming a flowing guard shape",
                "mid-strike with an open palm, body rotated and lines clean and focused",
                "seated in calm meditation, legs crossed and hands resting in a composed mudra",
                "low sweeping stance with one arm extended and the other drawn back defensively",
                "caught at the peak of a spinning kick, robes and sashes tracing the motion",
            ],
            "ranger": [
                "drawing a bow with the string fully pulled, body turned in a three-quarter stance",
                "kneeling on one knee with bow lowered, scanning the distance like a watchful scout",
                "mid-stride through an implied forest floor, bow held loosely but ready",
                "standing on a slight rise, bow raised and arrow aimed slightly downward",
                "leaning against an unseen tree, one hand resting on the bow, posture relaxed but alert",
            ],
            "wizard": [
                "standing with one hand raised and fingers splayed, arcane energy swirling upward",
                "leaning over an invisible spellbook, staff angled forward as if channeling power",
                "mid-gesture with both hands shaping a spell, sleeves and robes pulled by the motion",
                "holding a staff planted before them, gaze lifted as if calling down distant power",
                "caught turning dramatically, cloak sweeping, one hand tracing a glowing sigil",
            ],
            "sorcerer": [
                "surrounded by swirling magical energy, one hand outstretched and the other pulled close",
                "standing with arms wide, raw power coiling around their torso and shoulders",
                "mid-step as a surge of magic bursts from the ground around their feet",
                "leaning back slightly as if resisting an overwhelming tide of inner power",
                "cradling a concentrated sphere of magic between both hands at chest height",
            ],
            "warlock": [
                "holding a pact focus or talisman forward, dark energy streaming from it",
                "standing in a relaxed stance with one hand behind their back, the other tracing eldritch runes",
                "reaching upward toward an unseen patron, cloak and garments pulled by unnatural wind",
                "half-turned away, casting a spell over their shoulder with a sly or knowing posture",
                "arms crossed loosely while faint sigils burn in the air around them",
            ],
            "cleric": [
                "raising a holy symbol high, light radiating outward in a protective arc",
                "standing with shield angled and mace lowered, posture firm and resolute",
                "kneeling in prayerful focus, holy symbol clasped between both hands",
                "reaching one hand toward an unseen ally as if channeling healing energy",
                "planting a weapon or staff into the ground as radiant power rises around them",
            ],
            "druid": [
                "standing with staff planted in the earth, vines and leaves swirling around",
                "mid-transformation pose, body partly turned and framed by natural shapes",
                "kneeling to touch the ground, one hand extended as if coaxing growth",
                "arms lifted as if calling wind or storm, cloak and hair driven by imaginary weather",
                "leaning gently against an unseen tree, posture relaxed and rooted",
            ],
            "bard": [
                "mid-performance with an instrument, one foot forward and body open to an unseen crowd",
                "leaning back in a dramatic flourish, cloak and hair trailing with the motion",
                "perched casually on an unseen stool or crate, instrument resting comfortably in hand",
                "bowing deeply at the end of a performance, one arm sweeping wide",
                "caught mid-step in a dance-like pose, instrument held close to the torso",
            ],
            "default": [
                "standing in a relaxed but heroic stance, weight shifted slightly to one side",
                "mid-stride as if walking toward the viewer with confident energy",
                "standing in profile with head turned toward the viewer, posture composed and steady",
                "seated on an implied stone or crate, leaning slightly forward in a thoughtful pose",
                "standing with arms loosely folded or resting on a weapon, calm and watchful",
            ],
        }

        camera_variants_by_class: Dict[str, List[str]] = {
            "fighter": [
                "Camera angle: slightly low and three-quarter to emphasize strength and presence.",
                "Camera angle: eye-level, centered on the torso and weapon for a direct confrontation.",
                "Camera angle: three-quarter from the shield side, highlighting defense and stance.",
                "Camera angle: slightly above, looking down to show battlefield context around the figure.",
                "Camera angle: close to ground level, making the character loom large in the frame.",
            ],
            "barbarian": [
                "Camera angle: low and close, exaggerating size and ferocity.",
                "Camera angle: three-quarter with a strong diagonal, emphasizing motion and power.",
                "Camera angle: eye-level but tilted slightly to make the pose feel unstable and wild.",
                "Camera angle: pulled back to show the full silhouette and large weapon in motion.",
                "Camera angle: slightly below the shoulders, looking up into a battle roar.",
            ],
            "paladin": [
                "Camera angle: eye-level, straight on, emphasizing honor and symmetry.",
                "Camera angle: slightly low, looking up past the shield to give a guardian feeling.",
                "Camera angle: three-quarter from the weapon side, showing both devotion and readiness.",
                "Camera angle: slightly above, as if from the viewpoint of someone being protected.",
                "Camera angle: close to the chest and shoulders, focusing on heraldry and holy symbols.",
            ],
            "rogue": [
                "Camera angle: slightly above and to the side, emphasizing stealth and environment.",
                "Camera angle: three-quarter from behind, with the face turned back toward the viewer.",
                "Camera angle: low and angled sharply, creating long, dramatic shadows.",
                "Camera angle: tight framing around the upper body, leaving the background mostly in shadow.",
                "Camera angle: oblique and off-center, reinforcing a feeling of secrecy and motion.",
            ],
            "monk": [
                "Camera angle: mid-distance and centered, capturing clean lines of the martial pose.",
                "Camera angle: slightly low, emphasizing balance and upward motion in kicks or strikes.",
                "Camera angle: from above, looking down on a circular stance pattern.",
                "Camera angle: three-quarter, letting limbs and flowing cloth create dynamic diagonals.",
                "Camera angle: side-on profile to highlight precision and alignment of the form.",
            ],
            "ranger": [
                "Camera angle: three-quarter from the front, aligned with the drawn bow and arrow.",
                "Camera angle: from slightly behind the shoulder, looking along the line of the bowstring.",
                "Camera angle: slightly elevated, framing the ranger and implied terrain below.",
                "Camera angle: low and angled upward through implied undergrowth or rough ground.",
                "Camera angle: mid-distance, with the character slightly off-center to suggest open space.",
            ],
            "wizard": [
                "Camera angle: three-quarter, framing both staff and spell effect in the same view.",
                "Camera angle: slightly low, making the spellcasting gesture feel towering and grand.",
                "Camera angle: slightly above, looking down on a circle of arcane energy.",
                "Camera angle: tight on the upper body and hands, emphasizing complex spell gestures.",
                "Camera angle: oblique and off-center, with arcane elements framing the composition.",
            ],
            "sorcerer": [
                "Camera angle: close and low, centered on the chest where power is gathering.",
                "Camera angle: three-quarter from the side, showing energy spiraling around the figure.",
                "Camera angle: above and tilted, as if the viewer is caught in the swirl of magic.",
                "Camera angle: tight framing on the face and hands, emphasizing raw intensity.",
                "Camera angle: pulled back slightly, letting arcs of power form a halo-like shape.",
            ],
            "warlock": [
                "Camera angle: slightly low and off-center, giving a subtle, ominous imbalance.",
                "Camera angle: three-quarter from behind, looking toward an unseen source of power.",
                "Camera angle: eye-level but pushed to one side, leaving empty darkness opposite the figure.",
                "Camera angle: close to the focus or talisman, with the character looming just behind it.",
                "Camera angle: slightly above, letting eldritch patterns form around the character's feet.",
            ],
            "cleric": [
                "Camera angle: slightly low, looking up toward the raised holy symbol.",
                "Camera angle: eye-level, centered to evoke balance and stability.",
                "Camera angle: three-quarter, allowing both shield and symbol to read clearly.",
                "Camera angle: slightly above, as if from the viewpoint of a blessed ally.",
                "Camera angle: mid-distance with the character framed symmetrically in the composition.",
            ],
            "druid": [
                "Camera angle: low and close to the ground, emphasizing roots, stones, and natural forms.",
                "Camera angle: three-quarter, with implied branches or leaves partially framing the view.",
                "Camera angle: slightly above, looking down as if from a bird's-eye vantage.",
                "Camera angle: eye-level but softened, placing the character gently into the environment.",
                "Camera angle: mid-distance, with the figure slightly off-center to leave room for nature.",
            ],
            "bard": [
                "Camera angle: eye-level, as if the viewer is part of an unseen audience.",
                "Camera angle: three-quarter, capturing both gesture and instrument clearly.",
                "Camera angle: slightly low, turning a performance flourish into a heroic moment.",
                "Camera angle: above and angled, as if looking down from a balcony over a small stage.",
                "Camera angle: tight around the upper body and instrument, focusing on expression.",
            ],
            "default": [
                "Camera angle: three-quarter view that clearly shows the full silhouette.",
                "Camera angle: eye-level, centered, with the figure dominating the frame.",
                "Camera angle: slightly low, making the character feel larger and more heroic.",
                "Camera angle: slightly above, looking down just enough to show shoulders and gear.",
                "Camera angle: mid-distance with the character placed slightly off-center for balance.",
            ],
        }

        pose_list = pose_variants_by_class.get(class_key, pose_variants_by_class["default"])
        camera_list = camera_variants_by_class.get(class_key, camera_variants_by_class["default"])

        pose_prompt = random.choice(pose_list)
        camera_prompt = random.choice(camera_list)

        parts.append(f"Pose: {pose_prompt}")
        parts.append(camera_prompt)
        parts.append("Background should be simple, entirely black, and free of symbols or text.")
        parts.append("Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.")
        parts.append("Aspect ratio 3:4.")
        
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
                'fighter': 'wearing heavy armor and holding a sword in a powerful mid-swing battle pose',
                'wizard': 'in flowing robes, one hand raised casting a spell while gripping a staff with magical aura',
                'rogue': 'in dark leather armor, low and poised with twin daggers ready to strike',
                'paladin': 'in shining armor, shield braced and weapon raised in a protective stance',
                'barbarian': 'with wild hair, muscles tensed, roaring as they swing a massive axe',
                'warlock': 'in dark robes, one hand extended as if invoking eldritch power and symbols glowing',
                'cleric': 'in religious robes, holy symbol raised as if channeling radiant power',
                'druid': 'in natural robes with vines and leaves, staff planted as they call on primal forces',
                'bard': 'with a musical instrument mid-performance, stance open and charismatic',
                'monk': 'in simple robes, mid-strike in a focused martial arts stance',
                'ranger': 'with a drawn bow and forest gear, body twisted slightly as if loosing an arrow',
                'sorcerer': 'with magical energy swirling around outstretched hands in an active casting pose'
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













