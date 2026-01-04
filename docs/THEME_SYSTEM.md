# DandDy Theme System Documentation

## Overview

DandDy uses a **CSS-based theme inheritance system** with HSL color variables. Themes are applied via CSS classes and can be changed globally or per-component.

## Available Themes

The system supports 5 built-in theme colors:

| Theme | Classes | Primary Color | Use Case |
|-------|---------|---------------|----------|
| **Green** | `ui-theme-green theme-green` | Terminal Green (#00ff00) | Default terminal theme |
| **Teal** | `ui-theme-teal theme-teal` | Cyan/Teal (#00d4aa) | Character sheets (original) |
| **Yellow** | `ui-theme-yellow theme-yellow` | Gold/Yellow (#f4d03f) | Modals, warnings |
| **Pink** | `ui-theme-pink theme-pink` | Pink (#ee4499) | Campaigns |
| **White** | `ui-theme-white theme-white` | White/Gray (#c0c0c0) | Neutral/clean look |

## How It Works

### 1. CSS Variables Foundation

All colors derive from HSL (Hue, Saturation, Lightness) base values in `terminal-theme.css`:

```css
:root {
  /* Base HSL values for each theme */
  --theme-terminal-h: 120;    /* Green hue */
  --theme-teal-h: 181;         /* Teal hue */
  --theme-yellow-h: 48;        /* Yellow hue */
  --theme-pink-h: 330;         /* Pink hue */
  --theme-white-h: 0;          /* White (grayscale) */
  
  /* Derived color tokens */
  --terminal-fg: hsl(var(--theme-terminal-h), 100%, 50%);
  --modal-accent: hsl(var(--theme-yellow-h), 100%, 64%);
  /* ...50+ more derived colors */
}
```

### 2. Theme Classes

Theme classes override the `--ui-*` tokens that components use:

```css
.ui-theme-yellow {
  --ui-border-color: var(--modal-accent);
  --ui-fg-color: var(--modal-accent);
  --ui-dim-color: var(--modal-accent-dim);
  --ui-primary-bg-color: var(--modal-accent);
  --ui-on-primary-color: var(--terminal-bg);
}
```

### 3. Inheritance Model

Themes cascade down through the DOM hierarchy:

```html
<html class="ui-theme-yellow theme-yellow">
  <div class="terminal-container ui-theme-yellow theme-yellow">
    <div class="left-panel ui-theme-yellow theme-yellow">
      <!-- All components here inherit yellow theme -->
    </div>
  </div>
</html>
```

## Changing Themes

### Character Manager (`index.html`)

To change the Character Manager theme, update **THREE locations**:

#### 1. HTML File (`index.html`)

```html
<!-- Change line 2: -->
<html lang="en" class="ui-theme-yellow theme-yellow">

<!-- Change line 29: -->
<div class="terminal-frame ui-theme-yellow theme-yellow">
```

#### 2. JavaScript File (`character-manager.js`)

The JavaScript **explicitly sets theme classes** when rendering panels. You must update **3 locations**:

**Location A - Campaign Panel (around line 1079):**
```javascript
// Apply yellow theme to campaign panel
panel.classList.remove('ui-theme-white', 'theme-white', 'ui-theme-pink', 'theme-pink', 'ui-theme-green', 'theme-green', 'ui-theme-yellow', 'theme-yellow', 'ui-theme-teal', 'theme-teal');
panel.classList.add('ui-theme-yellow', 'theme-yellow');
```

**Location B - Character Grid Panel (around line 4000):**
```javascript
// Apply yellow theme to character grid panel
const gridPanel = document.getElementById('characterGridPanel');
if (gridPanel) {
    gridPanel.classList.remove('ui-theme-white', 'theme-white', 'ui-theme-green', 'theme-green', 'ui-theme-teal', 'theme-teal', 'ui-theme-pink', 'theme-pink', 'ui-theme-yellow', 'theme-yellow');
    gridPanel.classList.add('ui-theme-yellow', 'theme-yellow');
```

**Location C - Character Sheet Panel (around line 4259):**
```javascript
// Apply yellow theme to character sheet panel
if (sheetPanel) {
    sheetPanel.classList.remove('ui-theme-white', 'theme-white', 'ui-theme-green', 'theme-green', 'ui-theme-teal', 'theme-teal', 'ui-theme-pink', 'theme-pink', 'ui-theme-yellow', 'theme-yellow');
    sheetPanel.classList.add('ui-theme-yellow', 'theme-yellow');
}
sheetContainer.classList.remove('ui-theme-white', 'theme-white', 'ui-theme-green', 'theme-green', 'ui-theme-teal', 'theme-teal', 'ui-theme-pink', 'theme-pink', 'ui-theme-yellow', 'theme-yellow');
sheetContainer.classList.add('ui-theme-yellow', 'theme-yellow');
```

#### 3. Rebuild JavaScript Bundle

After modifying `character-manager.js`, you **must rebuild** the bundle:

```bash
cd scripts
python3 simple_bundle.py
```

This compiles and minifies `character-manager.js` → `manager.bundle.js`

### Character Builder (`character-builder/index.html`)

To change the Character Builder theme, update **THREE locations**:

```html
<!-- Change line 2: -->
<html lang="en" class="ui-theme-yellow theme-yellow">

<!-- Change line 19: -->
<div class="terminal-container ui-theme-yellow theme-yellow">

<!-- Change line 64 (left panel): -->
<div class="left-panel ui-theme-yellow theme-yellow" id="narrator-panel">

<!-- Change line 68 (right panel): -->
<div class="right-panel ui-theme-yellow theme-yellow" id="character-panel">
```

**Note:** The Character Builder does NOT have JavaScript overrides, so you only need to edit the HTML.

## Step-by-Step: Changing to Any Theme

### Example: Change Manager to Pink Theme

1. **Edit `index.html`:**
   ```bash
   # Line 2:
   <html lang="en" class="ui-theme-pink theme-pink">
   
   # Line 29:
   <div class="terminal-frame ui-theme-pink theme-pink">
   ```

2. **Edit `character-manager.js`** (3 locations):
   ```javascript
   // Location A (~line 1079):
   panel.classList.add('ui-theme-pink', 'theme-pink');
   
   // Location B (~line 4000):
   gridPanel.classList.add('ui-theme-pink', 'theme-pink');
   
   // Location C (~line 4259):
   sheetPanel.classList.add('ui-theme-pink', 'theme-pink');
   sheetContainer.classList.add('ui-theme-pink', 'theme-pink');
   ```

3. **Rebuild bundle:**
   ```bash
   cd scripts && python3 simple_bundle.py
   ```

4. **Hard refresh browser:**
   - Chrome/Firefox: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

## Finding JavaScript Theme Overrides

Use `grep` to find all places where themes are explicitly set:

```bash
grep -n "classList.add('ui-theme-" character-manager.js
```

Output shows line numbers where themes are applied.

## Custom Theme Colors

To create a custom theme color, edit `terminal-theme.css`:

```css
:root {
  /* Add custom hue value */
  --theme-custom-h: 180;  /* Cyan: 180, Purple: 280, Orange: 30 */
  --theme-custom-s: 100%;
  --theme-custom-l-bright: 50%;
  --theme-custom-l-dim: 35%;
}

/* Create theme class */
.ui-theme-custom {
  --ui-border-color: hsl(var(--theme-custom-h), var(--theme-custom-s), var(--theme-custom-l-bright));
  --ui-fg-color: hsl(var(--theme-custom-h), var(--theme-custom-s), var(--theme-custom-l-bright));
  --ui-dim-color: hsl(var(--theme-custom-h), var(--theme-custom-s), var(--theme-custom-l-dim));
  --ui-primary-bg-color: hsl(var(--theme-custom-h), var(--theme-custom-s), var(--theme-custom-l-bright));
  --ui-on-primary-color: var(--terminal-bg);
}
```

## Troubleshooting

### Theme Not Changing After Edit

**Problem:** Changed HTML but still see old theme.

**Solutions:**
1. **Hard refresh** browser: `Cmd+Shift+R` or `Ctrl+Shift+R`
2. Clear browser cache
3. Check browser DevTools → Elements → verify class names applied
4. If you edited JavaScript, did you rebuild the bundle?

### JavaScript Overrides HTML Theme

**Problem:** HTML has correct theme classes but JavaScript overwrites them.

**Solution:** Find and update JavaScript theme overrides:
```bash
cd /Users/khoi/Desktop/TEMP/_Personal/_Cursor/_DandDy
grep -n "classList.add('ui-theme-" character-manager.js
```

Update all lines that call `classList.add()` with theme classes.

### Bundle Not Updating

**Problem:** Edited JavaScript but changes don't appear.

**Solution:** 
```bash
# Rebuild bundles
cd scripts
python3 simple_bundle.py

# Verify bundle file timestamp changed
ls -lh ../manager.bundle.js
ls -lh ../character-builder/builder.bundle.js
```

## Architecture Notes

### Why Two Class Names?

Both `ui-theme-yellow` and `theme-yellow` are applied:
- `ui-theme-*`: Sets `--ui-*` CSS variables for components
- `theme-*`: Sets `--context-*` CSS variables for legacy compatibility

Always use both for full compatibility.

### Why JavaScript Overrides?

The Character Manager dynamically renders different panels (grid, sheet, campaigns). Each panel can theoretically have its own theme. The JavaScript ensures the correct theme is applied when switching views.

### Performance

Theme changes are **instant** because:
1. No JavaScript computation needed
2. Only CSS variables change
3. Browser efficiently repaints with new colors

## Testing Themes

Use the debug theme demo page to test all themes:

```bash
open http://localhost:8080/debug/theme-demo.html
```

This page lets you switch themes with buttons to see all UI components with each theme.

## Related Files

- `terminal-theme.css` - Theme CSS variables and classes
- `character-manager.css` - Manager-specific styles
- `character-builder.css` - Builder-specific styles
- `character-manager.js` - Manager JavaScript (has theme overrides)
- `character-builder/character-builder-app.js` - Builder JavaScript (no theme overrides)
- `scripts/simple_bundle.py` - Bundle builder script

## Quick Reference Table

| Task | Files to Edit | Rebuild Needed? |
|------|---------------|-----------------|
| Change Manager theme | `index.html` + `character-manager.js` (3 places) | ✅ Yes |
| Change Builder theme | `character-builder/index.html` | ❌ No |
| Create custom theme | `terminal-theme.css` | ❌ No |
| Update theme logic | `character-manager.js` | ✅ Yes |

---

**Last Updated:** December 23, 2024







