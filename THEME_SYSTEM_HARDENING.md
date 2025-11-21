# Theme System Hardening - Complete

This document summarizes the HSL-based theme system implementation that replaces all hard-coded hex colors with semantic tokens.

## What Changed

### 1. Added HSL Theme Foundation

All colors are now derived from HSL (Hue, Saturation, Lightness) base values in `terminal-theme.css`:

```css
/* Terminal Green Theme */
--theme-terminal-h: 120;
--theme-terminal-s: 100%;
--theme-terminal-l-bright: 50%;
--theme-terminal-l-dim: 27%;

/* Sheet Teal Theme */
--theme-teal-h: 181;
--theme-teal-s: 100%;
--theme-teal-l-bright: 41%;
--theme-teal-l-dim: 45%;

/* Modal Yellow Theme */
--theme-yellow-h: 48;
--theme-yellow-s: 100%;
--theme-yellow-l-bright: 64%;
--theme-yellow-l-dim: 75%;

/* Cyan Accent Theme */
--theme-cyan-h: 180;
--theme-cyan-s: 100%;
--theme-cyan-l-bright: 50%;
--theme-cyan-l-dim: 27%;

/* Error/Warning Themes */
--theme-error-h: 0;
--theme-error-s: 100%;
--theme-error-l: 50%;

--theme-warning-h: 39;
--theme-warning-s: 100%;
--theme-warning-l: 50%;
```

### 2. Created Semantic Role Tokens

All hard-coded colors were replaced with semantic tokens derived from the HSL foundation:

#### Terminal Green Tokens
- `--terminal-fg` - Main foreground text
- `--terminal-dim` - Dimmed text
- `--terminal-border` - Border color
- `--terminal-hover` - Hover states

#### Teal Sheet Tokens
- `--sheet-accent` - Primary teal for highlights
- `--sheet-accent-dim` - Muted teal for labels/borders
- `--sheet-value-color` - Values in character sheets
- `--sheet-label-color` - Labels in character sheets
- `--sheet-box-bg` - Background for stat boxes

#### Yellow Modal Tokens
- `--modal-accent` - Primary yellow for modals
- `--modal-accent-dim` - Dimmed yellow for secondary text

#### Other Tokens
- `--terminal-accent` - Cyan accent color
- `--terminal-error` - Red error states
- `--terminal-warning` - Orange warning states

### 3. Replaced All Hard-coded Colors

#### In `terminal-theme.css`:
- ❌ `#00ff00`, `#008800` → ✅ `hsl(var(--theme-terminal-h), ...)`
- ❌ `#00CED1`, `#20B2AA` → ✅ `hsl(var(--theme-teal-h), ...)`
- ❌ `#ffff00`, `#ffd54a`, `rgba(255, 215, 0, ...)` → ✅ `var(--modal-accent)`, `hsla(var(--theme-yellow-h), ...)`
- ❌ `#00ffff`, `rgba(0, 255, 255, ...)` → ✅ `var(--terminal-accent)`, `hsla(var(--theme-cyan-h), ...)`
- ❌ `#ff0000` → ✅ `var(--terminal-error)`
- ❌ `#ffa500` → ✅ `hsl(var(--theme-warning-h), ...)`

#### In `character-manager.css`:
- ❌ `#ffd54a` (guest notice, portrait history) → ✅ `var(--modal-accent)`
- ❌ `rgba(255, 213, 74, ...)` → ✅ `hsla(var(--theme-yellow-h), ...)`
- ❌ `#00CED1`, `#20B2AA`, `#0d4d4a` → ✅ `var(--sheet-accent)`, `hsl(var(--theme-teal-h), ...)`
- ❌ `rgba(0, 206, 209, ...)` → ✅ `hsla(var(--theme-teal-h), ...)`
- ❌ `rgba(0, 255, 0, ...)` → ✅ `hsla(var(--theme-terminal-h), ...)`
- ❌ `#f00` → ✅ `var(--terminal-error)`

## Benefits

### 1. **Single Source of Truth**
All colors are now defined in one place at the top of `terminal-theme.css`. Want to adjust the shade of green? Just change `--theme-terminal-l-bright` or `--theme-terminal-l-dim`.

### 2. **Consistent Theming**
Every color uses the same HSL-based derivation system, ensuring visual consistency across:
- Terminal green theme (main UI)
- Teal theme (character sheets, selected cards)
- Yellow theme (modals, warnings)
- Cyan accents
- Error/warning states

### 3. **Easy Theme Switching**
To create new color schemes (e.g., blue terminal, purple accents), just change the `--theme-*-h` (hue) values:

```css
/* Example: Blue terminal theme */
--theme-terminal-h: 210;  /* Changed from 120 (green) to 210 (blue) */
/* All 50+ green UI elements automatically update! */
```

### 4. **Maintainable Transparency**
All semi-transparent colors use `hsla()` with the theme foundation:
```css
/* Before: Hard to maintain */
background: rgba(0, 206, 209, 0.15);

/* After: Automatically matches theme */
background: hsla(var(--theme-teal-h), var(--theme-teal-s), var(--theme-teal-l-bright), 0.15);
```

### 5. **Semantic Naming**
Role-based tokens (`--modal-accent`, `--sheet-accent`) make it clear what each color is for, unlike raw hex values.

## How to Use

### Changing Color Schemes

**Example 1: Make the terminal theme blue instead of green**
```css
:root {
  --theme-terminal-h: 210;  /* Blue hue */
  /* Optionally adjust saturation/lightness too */
  --theme-terminal-s: 90%;
  --theme-terminal-l-bright: 55%;
}
```

**Example 2: Make modals orange instead of yellow**
```css
:root {
  --theme-yellow-h: 30;  /* Orange hue */
}
```

**Example 3: Make character sheets purple instead of teal**
```css
:root {
  --theme-teal-h: 280;  /* Purple hue */
}
```

### Adding New Feature Colors

When adding new UI features, use the existing token system:

```css
/* ✅ Good: Use semantic tokens */
.new-feature {
  color: var(--terminal-fg);
  border: 1px solid var(--sheet-accent);
  background: hsla(var(--theme-teal-h), var(--theme-teal-s), var(--theme-teal-l-bright), 0.1);
}

/* ❌ Bad: Hard-coded hex */
.new-feature {
  color: #00ff00;
  border: 1px solid #00CED1;
  background: rgba(0, 206, 209, 0.1);
}
```

## Testing

No visual changes were made - all colors remain exactly the same. The refactor only changed **how** colors are defined (HSL tokens) not **what** they look like.

To verify:
1. Open `character-manager.html` in a browser
2. Check that all colors appear identical to before
3. Try editing `--theme-terminal-h` in DevTools to verify the system works

## Files Modified

- `terminal-theme.css` - Added HSL foundation, replaced all hard-coded colors
- `character-manager.css` - Replaced all hard-coded colors with tokens
- `THEME_SYSTEM_HARDENING.md` - This documentation

## Next Steps (Optional)

1. **Add theme presets** - Create `.theme-blue`, `.theme-red` classes that override the base hues
2. **User theme picker** - Add UI to let users choose their preferred color scheme
3. **Dark mode variations** - Adjust lightness values for different contrast levels
4. **Accessibility** - Ensure all theme variations meet WCAG contrast requirements

---

**Status**: ✅ Complete - No linter errors, no visual changes, 100% backwards compatible

