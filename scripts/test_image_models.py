#!/usr/bin/env python3
"""
Quick test script to check which image model names OpenAI accepts.

Usage:
    cd backend
    source venv/bin/activate
    python ../scripts/test_image_models.py

This script tests various model name formats to see which ones are valid.
"""

import os
import sys
from pathlib import Path

# Load environment from backend/.env
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

import openai

# Check for API key
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("❌ OPENAI_API_KEY not set in backend/.env")
    sys.exit(1)

client = openai.OpenAI(api_key=api_key)

# Model names to test (various possible formats for GPT Image 1.5)
MODELS_TO_TEST = [
    # Known working models
    "dall-e-3",
    "dall-e-2", 
    "gpt-image-1",
    # Possible GPT Image 1.5 names
    "gpt-image-1.5",
    "gpt-image-1-5",
    "gpt-image-15",
    "gpt-image-1.5-preview",
    "gpt-image-1.5-turbo",
    # Other possibilities
    "gpt-4o-image",
    "gpt-4o-mini-image",
]

# Simple test prompt
TEST_PROMPT = "A simple red circle on white background"

def test_model(model_name: str) -> tuple[bool, str]:
    """
    Test if a model name is valid by attempting a minimal API call.
    Returns (success, message)
    """
    try:
        # Use smallest size to minimize cost
        response = client.images.generate(
            model=model_name,
            prompt=TEST_PROMPT,
            n=1,
            size="1024x1024",  # Most models require at least 1024x1024
        )
        
        # If we get here, the model is valid
        url = response.data[0].url if response.data else "(no url)"
        return True, f"✅ Valid! Generated image"
        
    except openai.BadRequestError as e:
        error_msg = str(e)
        if "model" in error_msg.lower() and ("invalid" in error_msg.lower() or "not found" in error_msg.lower() or "does not exist" in error_msg.lower()):
            return False, f"❌ Invalid model name"
        else:
            return False, f"⚠️  Bad request: {error_msg[:100]}"
            
    except openai.NotFoundError as e:
        return False, f"❌ Model not found"
        
    except openai.RateLimitError as e:
        return None, f"⏳ Rate limited (model might be valid)"
        
    except Exception as e:
        return None, f"⚠️  Error: {type(e).__name__}: {str(e)[:100]}"


def main():
    print("🔍 OpenAI Image Model Tester")
    print("=" * 50)
    print(f"Testing {len(MODELS_TO_TEST)} model names...\n")
    
    results = []
    
    for model in MODELS_TO_TEST:
        print(f"Testing: {model:<25}", end=" ", flush=True)
        success, message = test_model(model)
        print(message)
        results.append((model, success, message))
        
        # Small delay to avoid rate limits
        if success:
            import time
            time.sleep(1)
    
    print("\n" + "=" * 50)
    print("Summary:")
    print("-" * 50)
    
    valid = [r for r in results if r[1] is True]
    invalid = [r for r in results if r[1] is False]
    unknown = [r for r in results if r[1] is None]
    
    if valid:
        print(f"\n✅ Valid models ({len(valid)}):")
        for model, _, _ in valid:
            print(f"   - {model}")
    
    if invalid:
        print(f"\n❌ Invalid models ({len(invalid)}):")
        for model, _, _ in invalid:
            print(f"   - {model}")
    
    if unknown:
        print(f"\n⚠️  Unknown/error ({len(unknown)}):")
        for model, _, msg in unknown:
            print(f"   - {model}: {msg}")
    
    print("\n" + "=" * 50)
    print("💡 To add a new model to DandDy, update these files:")
    print("   - backend/routes/ai.py (model validation)")
    print("   - character-builder/character-builder-components.js (UI)")
    print("   - character-builder/character-builder-app.js (display names)")


if __name__ == "__main__":
    main()

