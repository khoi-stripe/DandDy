#!/usr/bin/env python3
"""
Generate two test images from the same prompt at different quality levels.

This is a small, self‑contained helper script so you can quickly compare
OpenAI's image quality settings using the existing D&D portraits tooling
conventions (env var, simple Requests client, etc.).

It will:
  - Call the Images API twice with the same prompt
  - Once with quality="standard"  (treated here as "medium")
  - Once with quality="hd"        (treated here as "high")
  - Download both images to an output folder so you can compare them.

Usage examples:

  # Read API key from OPENAI_API_KEY and prompt from the CLI
  python scripts/generate_quality_pair.py \\
      --prompt "A heroic tiefling warlock in classic ink illustration style"

  # Explicit API key + custom output directory
  python scripts/generate_quality_pair.py \\
      --api-key sk-... \\
      --prompt "A dwarven paladin in shining armor" \\
      --output-dir ./generated_portraits/quality_tests
"""

import argparse
import os
from pathlib import Path
from typing import Optional

import requests


IMAGES_API_URL = "https://api.openai.com/v1/images/generations"


def generate_image(
    api_key: str,
    prompt: str,
    quality: str,
    model: str,
    size: str,
    output_path: Path,
) -> Optional[Path]:
    """Call the OpenAI Images API and download a single image."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print(f"\n=== Requesting image: quality={quality!r}, model={model}, size={size} ===")
    print(f"Prompt (first 120 chars): {prompt[:120]!r}")

    resp = requests.post(
        IMAGES_API_URL,
        headers=headers,
        json={
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": size,
            # For DALL‑E 3 and gpt-image-1 the documented quality values are
            # "standard" and "hd". We map these to "medium" vs "high" in the CLI.
            "quality": quality,
        },
        timeout=60,
    )

    if resp.status_code != 200:
        try:
            data = resp.json()
        except Exception:
            data = {"error": {"message": resp.text}}
        msg = data.get("error", {}).get("message", str(resp.status_code))
        print(f"❌ Image generation failed (HTTP {resp.status_code}): {msg}")
        return None

    data = resp.json()
    try:
        image_url = data["data"][0]["url"]
    except (KeyError, IndexError) as exc:
        print(f"❌ Unexpected response format, could not find image URL: {exc}")
        return None

    print(f"⬇️  Downloading image from {image_url}")
    img_resp = requests.get(image_url, timeout=60)
    if img_resp.status_code != 200:
        print(f"❌ Failed to download image (HTTP {img_resp.status_code})")
        return None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(img_resp.content)
    print(f"✅ Saved image: {output_path}")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate two images from the same prompt at medium vs high quality."
    )
    parser.add_argument(
        "--api-key",
        help="OpenAI API key (otherwise read from OPENAI_API_KEY).",
    )
    parser.add_argument(
        "--prompt",
        required=True,
        help="Text prompt to send to the image model.",
    )
    parser.add_argument(
        "--model",
        default="dall-e-3",
        help='Image model to use (default: "dall-e-3"). '
        'You can also try "gpt-image-1" if your account has access.',
    )
    parser.add_argument(
        "--size",
        default="1024x1024",
        help='Image size (default: "1024x1024").',
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("generated_portraits/quality_tests"),
        help="Directory where the two images will be saved.",
    )

    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        parser.error(
            "OPENAI_API_KEY environment variable not set and --api-key not provided."
        )

    out_dir: Path = args.output_dir

    # Map friendly labels to actual API quality values.
    # The Images API currently supports: "low", "medium", "high", "auto".
    # Here we compare "medium" vs "high".
    tests = [
        ("medium", "medium"),
        ("high", "high"),
    ]

    for label, quality_value in tests:
        filename = f"test_{label}_quality_{quality_value}.png"
        output_path = out_dir / filename
        generate_image(
            api_key=api_key,
            prompt=args.prompt,
            quality=quality_value,
            model=args.model,
            size=args.size,
            output_path=output_path,
        )

    print("\nDone. Compare the images in:", out_dir.resolve())


if __name__ == "__main__":
    main()


