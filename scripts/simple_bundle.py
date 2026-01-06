"""
Three-bundle architecture for DandDy with shared code caching.

Usage (from project root):
    python scripts/simple_bundle.py [--no-minify]

Outputs:
  - shared.bundle.js  → Common code (cached across pages)
  - dnd-data.bundle.js → Heavy static reference data (lazy-loadable)
  - manager.bundle.js → Manager-specific code
  - builder.bundle.js → Builder-specific code

Benefits:
  - First page load: ~720KB (same as before)
  - Subsequent navigation: only ~160-280KB (shared is cached)
  - Total for both pages: ~884KB (vs 1.3MB before, 33% savings)
"""

import sys
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check_terser_available() -> bool:
    """Check if terser is available via npx."""
    if not shutil.which("npx"):
        return False
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


def build_bundle(output_path: Path, parts: list[str], minify: bool = True, use_terser: bool = True) -> int:
    """Build a bundle and return its size in bytes."""
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
    
    if minify and use_terser:
        combined = minify_js_terser(combined)
        minified_size = len(combined.encode("utf-8"))
        reduction = (1 - minified_size / original_size) * 100
        print(f"  {output_path.name}: {original_size / 1024:.1f} KB → {minified_size / 1024:.1f} KB ({reduction:.1f}% smaller)")
        final_size = minified_size
    else:
        print(f"  {output_path.name}: {original_size / 1024:.1f} KB (unminified)")
        final_size = original_size
    
    output_path.write_text(combined, encoding="utf-8")
    return final_size


# ============================================================
# SHARED BUNDLE - loaded by both pages, cached by browser
# ============================================================
shared_parts = [
    # Version info (shared so both pages show same version)
    "version.js",
    
    # Core infrastructure
    "app-config.js",
    "app-auth.js",
    "app-character-mapper.js",
    "app-storage.js",
    
    # Static data (shared, needed immediately)
    "data-portrait-prompts.js",
    "data-portrait-shared.js",
    
    # Builder core (used by manager for display)
    "builder-config.js",
    "builder-dnd-data.js",
    "builder-utils.js",
    "builder-narrators.js",
    "builder-services.js",
    "builder-components.js",
    
    # Shared UI components
    "app-api.js",
    "app-character-sheet.js",
    "app-portraits.js",
    "demo-characters.js",
]

# ============================================================
# D&D DATA BUNDLE - heavy static reference data
# - Included by builder.html
# - Lazy-loaded by index.html only when needed (spells panel, etc.)
# ============================================================
dnd_data_parts = [
    "data-character-names.js",
    "data-spells.js",
    "data-class-features.js",
    "data-racial-traits.js",
]

# ============================================================
# MANAGER BUNDLE - index.html specific
# ============================================================
manager_parts = [
    "app-manager.js",
]

# ============================================================
# BUILDER BUNDLE - builder.html specific
# ============================================================
builder_parts = [
    "builder-spells.js",
    "builder-auth.js",
    "builder-api.js",
    "builder-state.js",
    "builder-questions.js",
    "builder-app.js",
    "builder-manager.js",
]


def main() -> None:
    minify = "--no-minify" not in sys.argv
    
    print("Building three-bundle architecture...")
    print()
    
    use_terser = False
    if minify:
        if check_terser_available():
            print("✓ Using terser for minification\n")
            use_terser = True
        else:
            print("✗ terser not available, skipping minification\n")
            minify = False
    else:
        print("Minification disabled via --no-minify\n")
    
    print("Building bundles:")
    shared_size = build_bundle(ROOT / "shared.bundle.js", shared_parts, minify=minify, use_terser=use_terser)
    dnd_data_size = build_bundle(ROOT / "dnd-data.bundle.js", dnd_data_parts, minify=minify, use_terser=use_terser)
    manager_size = build_bundle(ROOT / "manager.bundle.js", manager_parts, minify=minify, use_terser=use_terser)
    builder_size = build_bundle(ROOT / "builder.bundle.js", builder_parts, minify=minify, use_terser=use_terser)
    
    print()
    print("Page load sizes:")
    print(f"  Manager (index.html):  {(shared_size + manager_size) / 1024:.0f} KB (dnd-data lazy)")
    print(f"  Builder (builder.html): {(shared_size + dnd_data_size + builder_size) / 1024:.0f} KB")
    print(f"  Builder after Manager:  {builder_size / 1024:.0f} KB (shared cached)")
    print()
    print("Done!")


if __name__ == "__main__":
    main()
