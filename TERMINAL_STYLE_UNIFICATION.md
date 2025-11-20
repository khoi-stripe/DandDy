# Terminal Style Unification

## Overview
Unified the terminal styles between **Character Builder** and **Character Manager** to ensure consistent appearance across the application.

## Changes Made

### Border Colors (Builder)
Changed all borders from `var(--terminal-dim)` to `var(--terminal-border)` to match the manager:

**Before:** Dimmed green borders (#008800)  
**After:** Bright green borders (#00ff00)

### Affected Elements
- `.terminal-container` - Main container border
- `.terminal-header` - Header bottom border
- `.terminal-footer` - Footer top border
- `.left-panel` - Right border divider
- `.question-card` - Card borders
- All input/select elements - Form field borders
- Character cards and stats - Display borders

### Spinner/Loading Glyph (Builder)
**Before:**
- Size: 48px (large)
- Color: cyan (`var(--terminal-accent)`)
- Text-shadow: Glowing effect

**After:**
- Size: 16px (small)
- Color: green (`var(--terminal-fg)`)
- Text-shadow: None (clean)

## Consistency Achieved

Both builder and manager now share:
- ✅ Same border color: `var(--terminal-border)` (#00ff00)
- ✅ Same border width: 1px (standard), 2px (emphasis)
- ✅ Same spacing: Using consistent CSS variables
- ✅ Same font: Courier New monospace
- ✅ Same background: #0a0a0a with subtle grid pattern
- ✅ Same padding/margins: Using shared spacing variables

## CSS Variables Used

Both files use the same CSS variable system:

```css
:root {
  --terminal-bg: #0a0a0a;
  --terminal-fg: #00ff00;        /* Bright green */
  --terminal-dim: #008800;        /* Dim green (for text) */
  --terminal-border: #00ff00;     /* Bright green (for borders) */
  --terminal-accent: #00ffff;     /* Cyan */
  
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}
```

## Visual Result

The terminal now has a **unified retro-computing aesthetic** across both views:
- Bright green (#00ff00) borders and accents
- Dark background (#0a0a0a)
- Consistent spacing and typography
- Matching interactive elements (buttons, inputs)

## Files Modified

1. `/character-builder/character-builder.css`
   - Updated all border colors
   - Reduced spinner size and changed color

## Testing

To verify the changes:
1. Open Character Builder: `http://localhost:3000/character-builder/`
2. Open Character Manager: `http://localhost:3000/character-manager.html`
3. Compare visual appearance - borders, colors, spacing should match
4. Test loading states - spinner should be small and green

