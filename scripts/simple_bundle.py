"""
Simple, no‑Node bundler for DandDy.

Usage (from project root):
    python scripts/simple_bundle.py [--no-minify]

It concatenates the existing JavaScript files in the same order as the
<script> tags in:
  - index.html      → outputs manager.bundle.js
  - character-builder/index.html → outputs character-builder/builder.bundle.js

Options:
  --no-minify    Skip minification (for debugging)

This preserves the current global‑script behavior while reducing the number
of script tags / requests needed in the browser.
"""

import sys
from pathlib import Path

# Try to import rjsmin for minification
try:
    import rjsmin
    HAS_MINIFIER = True
except ImportError:
    HAS_MINIFIER = False
    print("Warning: rjsmin not installed. Run: pip install rjsmin")
    print("         Bundles will not be minified.\n")


ROOT = Path(__file__).resolve().parent.parent


def minify_js(code: str) -> str:
    """Minify JavaScript code using rjsmin."""
    if not HAS_MINIFIER:
        return code
    return rjsmin.jsmin(code, keep_bang_comments=False)


def build_bundle(output_path: Path, parts: list[str], minify: bool = True) -> None:
    lines: list[str] = []
    for rel in parts:
        src = ROOT / rel
        if not src.is_file():
            raise FileNotFoundError(f"Bundle part not found: {src}")
        header = f"\n\n// ===== BUNDLE PART: {rel} =====\n"
        lines.append(header)
        lines.append(src.read_text(encoding="utf-8"))
    
    combined = "\n".join(lines)
    original_size = len(combined.encode("utf-8"))
    
    if minify and HAS_MINIFIER:
        combined = minify_js(combined)
        minified_size = len(combined.encode("utf-8"))
        reduction = (1 - minified_size / original_size) * 100
        print(f"Wrote bundle: {output_path.relative_to(ROOT)}")
        print(f"  Original: {original_size / 1024:.1f} KB → Minified: {minified_size / 1024:.1f} KB ({reduction:.1f}% smaller)")
    else:
        output_path.write_text(combined, encoding="utf-8")
        print(f"Wrote bundle: {output_path.relative_to(ROOT)} ({original_size / 1024:.1f} KB, unminified)")
        return
    
    output_path.write_text(combined, encoding="utf-8")


# Manager (root index.html) bundle, in the same order as the script tags.
manager_parts = [
    "danddy-config.js",
    "danddy-auth.js",
    "danddy-character-mapper.js",
    "danddy-storage.js",
    "version.js",
    "portrait-prompts.js",
    "shared-portrait-data.js",
    "character-name-data.js",
    "character-builder/character-builder-config.js",
    "character-builder/character-builder-utils.js",
    "character-builder/character-builder-narrators.js",
    "character-builder/character-builder-services.js",
    "character-builder/character-builder-components.js",
    "shared-character-sheet.js",
    "character-manager-api.js",
    "character-storage.js",
    "portraits-ui.js",
    "character-manager.js",
]

# Character builder bundle (character-builder/index.html), same script order.
builder_parts = [
    "danddy-config.js",
    "danddy-auth.js",
    "danddy-character-mapper.js",
    "danddy-storage.js",
    "portrait-prompts.js",
    "shared-portrait-data.js",
    "character-name-data.js",
    "character-manager-api.js",
    "character-storage.js",
    "character-builder/character-builder-config.js",
    "character-builder/character-builder-dnd-data.js",
    "character-builder/character-builder-spells.js",
    "character-builder/character-builder-narrators.js",
    "character-builder/character-builder-utils.js",
    "character-builder/character-builder-auth.js",
    "character-builder/character-builder-api.js",
    "character-builder/character-builder-services.js",
    "character-builder/character-builder-state.js",
    "shared-character-sheet.js",
    "portraits-ui.js",
    "character-builder/character-builder-components.js",
    "character-builder/character-builder-questions.js",
    "character-builder/character-builder-app.js",
    "character-builder/character-builder-manager.js",
]


def main() -> None:
    minify = "--no-minify" not in sys.argv
    
    if not minify:
        print("Minification disabled via --no-minify flag\n")
    
    build_bundle(ROOT / "manager.bundle.js", manager_parts, minify=minify)
    build_bundle(ROOT / "character-builder" / "builder.bundle.js", builder_parts, minify=minify)
    
    print("\nDone!")


if __name__ == "__main__":
    main()
