"""
Simple, no‑Node bundler for DandDy.

Usage (from project root):
    python scripts/simple_bundle.py

It concatenates the existing JavaScript files in the same order as the
<script> tags in:
  - index.html      → outputs manager.bundle.js
  - character-builder/index.html → outputs character-builder/builder.bundle.js

This preserves the current global‑script behavior while reducing the number
of script tags / requests needed in the browser.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def build_bundle(output_path: Path, parts: list[str]) -> None:
    lines: list[str] = []
    for rel in parts:
        src = ROOT / rel
        if not src.is_file():
            raise FileNotFoundError(f"Bundle part not found: {src}")
        header = f"\n\n// ===== BUNDLE PART: {rel} =====\n"
        lines.append(header)
        lines.append(src.read_text(encoding="utf-8"))
    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote bundle: {output_path.relative_to(ROOT)}")


def main() -> None:
    # Manager (root index.html) bundle, in the same order as the script tags.
    manager_parts = [
        "danddy-config.js",
        "danddy-auth.js",
        "danddy-character-mapper.js",
        "danddy-storage.js",
        "version.js",
        "character-builder/character-builder-config.js",
        "character-builder/character-builder-utils.js",
        "character-builder/character-builder-services.js",
        "shared-character-sheet.js",
        "character-manager-api.js",
        "character-storage.js",
        "portraits-ui.js",
        "character-manager.js",
    ]
    build_bundle(ROOT / "manager.bundle.js", manager_parts)

    # Character builder bundle (character-builder/index.html), same script order.
    builder_parts = [
        "danddy-config.js",
        "danddy-auth.js",
        "danddy-character-mapper.js",
        "danddy-storage.js",
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
        "character-builder/character-builder-components.js",
        "character-builder/character-builder-questions.js",
        "character-builder/character-builder-app.js",
        "character-builder/character-builder-manager.js",
    ]
    build_bundle(ROOT / "character-builder" / "builder.bundle.js", builder_parts)


if __name__ == "__main__":
    main()


