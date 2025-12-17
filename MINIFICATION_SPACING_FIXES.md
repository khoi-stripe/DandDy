# Minification: Solved ✓

## Current Status

**The minification spacing issue is now permanently fixed.** The bundler uses [terser](https://terser.org/) instead of rjsmin.

## Why This Works

Terser is an **AST-based minifier** - it actually parses JavaScript and understands the language structure. This means:

- ✅ Template literal content is **always preserved exactly**
- ✅ Spaces in strings are never removed
- ✅ No need for workarounds like `${' '}` or double-spacing
- ✅ Write normal, readable code

## What Changed

The `scripts/simple_bundle.py` bundler now:

1. Checks if terser is available via `npx`
2. Uses terser for minification (proper AST parsing)
3. Falls back to rjsmin only if terser isn't available (with warning)

## Requirements

- **Node.js** must be installed (for `npx terser`)
- That's it! No need to install terser globally - `npx` handles it automatically

## Building Bundles

```bash
# Standard build (uses terser)
python3 scripts/simple_bundle.py

# Or from scripts directory
cd scripts && bash build-bundles.sh

# Debug build (no minification)
python3 scripts/simple_bundle.py --no-minify

# Force old rjsmin (NOT recommended)
python3 scripts/simple_bundle.py --rjsmin
```

## Scanning for Issues (Optional)

The scan script is still available if you want to verify:

```bash
bash scripts/scan-minification-issues.sh
```

---

## Historical Context (No Longer Relevant)

The sections below document the old workarounds that were needed when using rjsmin. **These are no longer necessary** but kept for reference.

<details>
<summary>Old Issue (Fixed)</summary>

### The Old Problem

rjsmin is a regex-based minifier that doesn't parse JavaScript. It would corrupt template literals:

```javascript
// Original code
`> Line 1
> Line 2`

// After rjsmin (BROKEN)
`>Line 1>Line 2`
```

### Old Workarounds (No Longer Needed)

These workarounds are no longer necessary with terser:

- Using `${' '}` to force spaces
- Using double spaces after `>`
- Using explicit `\n` instead of newlines

</details>

<details>
<summary>Files That Were Previously Fixed</summary>

- character-builder/character-builder-app.js
- character-builder/character-builder-narrators.js  
- character-builder/character-builder-questions.js
- portraits-ui.js
- character-manager.js

These files contain workaround patterns from when we used rjsmin. They still work correctly, but new code doesn't need to follow these patterns.

</details>
