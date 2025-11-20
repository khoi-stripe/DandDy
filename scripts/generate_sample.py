#!/usr/bin/env python3
"""
Quick test script - Generate a few sample portraits for testing
Useful for testing the integration without spending time/money on all 117 portraits
"""

import sys
import os

# Set sample configurations
SAMPLE_RACES = ["Elf", "Dwarf", "Human"]
SAMPLE_CLASSES = ["Wizard", "Fighter"]

# Import the main script
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

# Temporarily replace the full lists with samples
import generate_all_portraits
generate_all_portraits.RACES = SAMPLE_RACES
generate_all_portraits.CLASSES = SAMPLE_CLASSES

print("=" * 80)
print("🧪 SAMPLE PORTRAIT GENERATOR")
print("=" * 80)
print("\nThis will generate a small sample for testing:")
print(f"  • {len(SAMPLE_RACES)} races: {', '.join(SAMPLE_RACES)}")
print(f"  • {len(SAMPLE_CLASSES)} classes: {', '.join(SAMPLE_CLASSES)}")
print(f"  • Total: {len(SAMPLE_RACES) + len(SAMPLE_RACES) * len(SAMPLE_CLASSES)} portraits")
print(f"\nEstimated cost: ~$0.{len(SAMPLE_RACES) + len(SAMPLE_RACES) * len(SAMPLE_CLASSES) * 4}0")
print(f"Estimated time: ~{(len(SAMPLE_RACES) + len(SAMPLE_RACES) * len(SAMPLE_CLASSES)) * 15 // 60} minutes")
print("\n")

# Run the main function
if __name__ == '__main__':
    generate_all_portraits.main()






