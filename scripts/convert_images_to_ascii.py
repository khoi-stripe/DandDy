#!/usr/bin/env python3
"""
Convert existing PNG images to ASCII art
Re-processes images in generated_portraits/images/ to ASCII files
"""

import os
import sys
from pathlib import Path
from PIL import Image
import numpy as np

# ASCII character sets (reversed so black=light, white=dense)
ASCII_CHARS = '  .`\'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$'
ASCII_WIDTH = 160
ASCII_HEIGHT = 80

# Directories
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "generated_portraits"
IMAGES_DIR = OUTPUT_DIR / "images"
ASCII_DIR = OUTPUT_DIR / "ascii"

def floyd_steinberg_dither(pixels, width, height, levels):
    """Apply Floyd-Steinberg dithering to grayscale image"""
    output = np.copy(pixels)
    
    for y in range(height):
        for x in range(width):
            old_pixel = output[y, x]
            new_pixel = round(old_pixel * (levels - 1) / 255) * (255 / (levels - 1))
            output[y, x] = new_pixel
            quant_error = old_pixel - new_pixel
            
            if x + 1 < width:
                output[y, x + 1] += quant_error * 7 / 16
            if y + 1 < height:
                if x > 0:
                    output[y + 1, x - 1] += quant_error * 3 / 16
                output[y + 1, x] += quant_error * 5 / 16
                if x + 1 < width:
                    output[y + 1, x + 1] += quant_error * 1 / 16
    
    return output

def convert_to_ascii(image_path: Path, width: int = ASCII_WIDTH, height: int = ASCII_HEIGHT) -> str:
    """Convert image to ASCII art with Floyd-Steinberg dithering"""
    try:
        # Load image
        img = Image.open(image_path)
        
        # Resize and convert to grayscale
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        img = img.convert('L')
        pixels = np.array(img, dtype=np.float32)
        
        # Apply Floyd-Steinberg dithering
        dithered = floyd_steinberg_dither(pixels, width, height, len(ASCII_CHARS))
        
        # Convert to ASCII
        ascii_art = []
        for y in range(height):
            line = ""
            for x in range(width):
                brightness = int(dithered[y, x])
                char_index = int(brightness / 256 * len(ASCII_CHARS))
                char_index = max(0, min(len(ASCII_CHARS) - 1, char_index))
                line += ASCII_CHARS[char_index]
            ascii_art.append(line)
        
        return '\n'.join(ascii_art)
        
    except Exception as e:
        print(f"  ❌ Error converting to ASCII: {e}")
        return None

def save_ascii(ascii_art: str, filename: str):
    """Save ASCII art to disk"""
    filepath = ASCII_DIR / filename
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(ascii_art)
    print(f"  💾 Saved ASCII: {filename}")

def main():
    print("🎨 Converting images to ASCII art...")
    print(f"📂 Images directory: {IMAGES_DIR}")
    print(f"📂 ASCII directory: {ASCII_DIR}")
    print()
    
    # Ensure output directory exists
    ASCII_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get all PNG files
    png_files = list(IMAGES_DIR.glob("*.png"))
    
    if not png_files:
        print("❌ No PNG files found in images directory!")
        return
    
    print(f"Found {len(png_files)} PNG files to convert")
    print()
    
    converted = 0
    failed = 0
    
    for png_file in sorted(png_files):
        print(f"Converting: {png_file.name}")
        
        # Convert to ASCII
        ascii_art = convert_to_ascii(png_file)
        
        if ascii_art:
            # Save ASCII art with .txt extension
            ascii_filename = png_file.stem + ".txt"
            save_ascii(ascii_art, ascii_filename)
            converted += 1
        else:
            print(f"  ❌ Failed to convert {png_file.name}")
            failed += 1
        
        print()
    
    print("=" * 60)
    print("✅ Conversion complete!")
    print(f"  Converted: {converted}")
    print(f"  Failed: {failed}")
    print("=" * 60)

if __name__ == "__main__":
    main()

