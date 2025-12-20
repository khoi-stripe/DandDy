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
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check_terser_available() -> bool:
    """Check if terser is available via npx."""
    # Check if npx is available
    if not shutil.which("npx"):
        return False
    # Try running terser --version
    try:
        result = subprocess.run(
            ["npx", "--yes", "terser", "--version"],
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def minify_js_terser(code: str) -> str:
    """Minify JavaScript using terser (proper AST-based minification)."""
    result = subprocess.run(
        [
            "npx", "--yes", "terser",
            "--compress",
            "--mangle",
            "--format", "ascii_only=true"
        ],
        input=code,
        capture_output=True,
        text=True,
        timeout=120
    )
    if result.returncode != 0:
        print(f"Terser error: {result.stderr}")
        return code
    return result.stdout


# Fallback to rjsmin if terser not available
try:
    import rjsmin
    HAS_RJSMIN = True
except ImportError:
    HAS_RJSMIN = False


def minify_js_rjsmin(code: str) -> str:
    """Fallback minification using rjsmin (DEPRECATED - has template literal bugs)."""
    if not HAS_RJSMIN:
        return code
    return rjsmin.jsmin(code, keep_bang_comments=False)


def build_bundle(output_path: Path, parts: list[str], minify: bool = True, use_terser: bool = True) -> None:
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
    
    if minify:
        if use_terser:
            combined = minify_js_terser(combined)
            minifier_name = "terser"
        elif HAS_RJSMIN:
            combined = minify_js_rjsmin(combined)
            minifier_name = "rjsmin (WARNING: may corrupt template literals!)"
        else:
            print(f"  No minifier available, writing unminified")
            output_path.write_text(combined, encoding="utf-8")
            print(f"Wrote bundle: {output_path.relative_to(ROOT)} ({original_size / 1024:.1f} KB, unminified)")
            return
        
        minified_size = len(combined.encode("utf-8"))
        reduction = (1 - minified_size / original_size) * 100
        print(f"Wrote bundle: {output_path.relative_to(ROOT)}")
        print(f"  Minified with {minifier_name}: {original_size / 1024:.1f} KB → {minified_size / 1024:.1f} KB ({reduction:.1f}% smaller)")
    else:
        print(f"Wrote bundle: {output_path.relative_to(ROOT)} ({original_size / 1024:.1f} KB, unminified)")
    
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
    "spell-database.js",
    "class-features-data.js",
    "racial-traits-data.js",
    "character-builder/character-builder-dnd-data.js",
    "character-builder/character-builder-config.js",
    "character-builder/character-builder-utils.js",
    "character-builder/character-builder-narrators.js",
    "character-builder/character-builder-services.js",
    "character-builder/character-builder-components.js",
    "shared-character-sheet.js",
    "character-manager-api.js",
    "campaign-api.js",
    "demo-characters.js",
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
    "spell-database.js",
    "class-features-data.js",
    "racial-traits-data.js",
    "character-manager-api.js",
    "demo-characters.js",
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
    force_rjsmin = "--rjsmin" in sys.argv
    
    if not minify:
        print("Minification disabled via --no-minify flag\n")
    
    # Determine which minifier to use
    use_terser = False
    if minify and not force_rjsmin:
        print("Checking for terser (proper AST-based minifier)...")
        if check_terser_available():
            print("✓ terser available - using it for safe minification\n")
            use_terser = True
        else:
            print("✗ terser not available (requires Node.js)")
            if HAS_RJSMIN:
                print("  Falling back to rjsmin (WARNING: may corrupt template literals!)")
                print("  Install terser: npm install -g terser")
                print("  Or use npx (automatic if Node.js installed)\n")
            else:
                print("  No minifier available. Install Node.js for terser or: pip install rjsmin\n")
    
    if force_rjsmin:
        print("Using rjsmin (forced via --rjsmin flag)")
        print("WARNING: rjsmin may corrupt template literals!\n")
    
    build_bundle(ROOT / "manager.bundle.js", manager_parts, minify=minify, use_terser=use_terser)
    build_bundle(ROOT / "character-builder" / "builder.bundle.js", builder_parts, minify=minify, use_terser=use_terser)
    
    print("\nDone!")


if __name__ == "__main__":
    main()
