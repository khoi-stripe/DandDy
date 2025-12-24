# Theme Quick Reference

## Available Themes
- `ui-theme-green theme-green` - Terminal Green
- `ui-theme-teal theme-teal` - Cyan/Teal  
- `ui-theme-yellow theme-yellow` - Gold/Yellow
- `ui-theme-orange theme-orange` - Warm Orange
- `ui-theme-red theme-red` - Bold Red
- `ui-theme-pink theme-pink` - Pink
- `ui-theme-violet theme-violet` - Purple/Violet
- `ui-theme-blue theme-blue` - Royal Blue
- `ui-theme-white theme-white` - White/Gray

## Character Manager Theme Change

### 1. Edit `index.html` (2 places)
```html
<!-- Line 2: -->
<html lang="en" class="ui-theme-yellow theme-yellow">

<!-- Line 29: -->
<div class="terminal-frame ui-theme-yellow theme-yellow">
```

### 2. Edit `character-manager.js` (3 places)
```javascript
// ~Line 1079 - Campaign panel:
panel.classList.add('ui-theme-yellow', 'theme-yellow');

// ~Line 4000 - Character grid panel:
gridPanel.classList.add('ui-theme-yellow', 'theme-yellow');

// ~Line 4259 - Character sheet panel:
sheetPanel.classList.add('ui-theme-yellow', 'theme-yellow');
sheetContainer.classList.add('ui-theme-yellow', 'theme-yellow');
```

### 3. Rebuild Bundle
```bash
cd scripts && python3 simple_bundle.py
```

### 4. Hard Refresh Browser
`Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)

## Character Builder Theme Change

### 1. Edit `character-builder/index.html` (4 places)
```html
<!-- Line 2: -->
<html lang="en" class="ui-theme-yellow theme-yellow">

<!-- Line 19: -->
<div class="terminal-container ui-theme-yellow theme-yellow">

<!-- Line 64: -->
<div class="left-panel ui-theme-yellow theme-yellow" id="narrator-panel">

<!-- Line 68: -->
<div class="right-panel ui-theme-yellow theme-yellow" id="character-panel">
```

### 2. Hard Refresh Browser
No rebuild needed for builder!

## Find Theme Overrides
```bash
grep -n "classList.add('ui-theme-" character-manager.js
```

---
See `docs/THEME_SYSTEM.md` for full documentation.


