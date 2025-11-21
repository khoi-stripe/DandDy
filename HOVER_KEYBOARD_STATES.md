# Card States: Hover + Keyboard Focus

## Overview

Character cards now properly support **both mouse hover and keyboard focus** states, allowing them to work together seamlessly.

## Visual States

### 1. Normal State (Default)
```css
border: 1px solid var(--terminal-border);
box-shadow: none;
```
**Appearance:** Gray border, no glow

---

### 2. Hover State (Mouse)
```css
.character-card:hover {
    border-color: var(--terminal-accent);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
    transform: translateY(-2px);
}
```
**Appearance:**
- ✨ Cyan border
- 💫 Soft cyan glow
- ⬆️ Lifts up slightly (2px)

---

### 3. Keyboard Focus State
```css
.character-card.is-keyboard-focused {
    border-color: var(--terminal-accent);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
    outline: 2px solid var(--terminal-accent);
    outline-offset: 2px;
}
```
**Appearance:**
- ✨ Cyan border
- 💫 Stronger cyan glow (15px, 50% opacity)
- 🔲 Cyan outline (2px offset)

---

### 4. Selected State
```css
.character-card.is-selected {
    border-color: var(--terminal-accent);
    background-color: rgba(0, 255, 255, 0.1);
    box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
}
```
**Appearance:**
- ✨ Cyan border
- 🎨 Cyan background tint (10% opacity)
- 💫 Soft cyan glow

---

### 5. Combined: Keyboard Focus + Hover
```css
.character-card.is-keyboard-focused:hover {
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.6);
    transform: translateY(-2px);
}
```
**Appearance:**
- ✨ Cyan border
- 💫 **Strongest glow** (20px, 60% opacity)
- 🔲 Cyan outline (from keyboard focus)
- ⬆️ Lifts up (from hover)

**Result:** Most prominent visual feedback when both states active!

---

## State Combinations

| Mouse | Keyboard | Selected | Result |
|-------|----------|----------|--------|
| No | No | No | Gray border, no effects |
| **Yes** | No | No | **Cyan border + glow + lift** |
| No | **Yes** | No | **Cyan border + strong glow + outline** |
| **Yes** | **Yes** | No | **Cyan border + STRONGEST glow + outline + lift** |
| No | No | **Yes** | **Cyan border + tint + glow** |
| **Yes** | No | **Yes** | **Tint + glow + lift** |
| No | **Yes** | **Yes** | **Tint + strong glow + outline** |
| **Yes** | **Yes** | **Yes** | **Tint + STRONGEST glow + outline + lift** |

## Interaction Flow

### Mouse User
1. Hover over card → Card glows and lifts
2. Move mouse away → Hover state removed
3. Click card → Selected state applied
4. Card stays selected with tint

### Keyboard User
1. Arrow keys → Card gets outline and glow
2. Navigate away → Outline removed
3. Press Enter → Card selected
4. Card stays selected with tint

### Combined (Mouse + Keyboard)
1. Navigate with arrow keys → Card focused (outline)
2. Hover over focused card → **Extra strong glow + lift**
3. Click → Selected
4. Hover continues to work on selected card

## CSS Specificity Order

```css
.character-card                           /* Base */
  ↓
.character-card:hover                     /* Hover (higher priority) */
  ↓
.character-card.is-selected               /* Selected (class specificity) */
  ↓
.character-card.is-keyboard-focused       /* Keyboard (class specificity) */
  ↓
.character-card.is-keyboard-focused:hover /* Combined (highest specificity) */
```

The combined state has the highest specificity, so it overrides individual states.

## Transitions

```css
.character-card {
    transition: all var(--transition-speed);
}
```

**Smooth transitions for:**
- ✅ Border color changes
- ✅ Box shadow (glow effect)
- ✅ Transform (lift effect)
- ✅ Background color (tint)

**Transition speed:** Defined by `--transition-speed` CSS variable

## Visual Hierarchy

**From subtle to prominent:**

1. **Normal** - No effects
2. **Hover** - Soft glow + lift
3. **Selected** - Tint + soft glow
4. **Keyboard Focus** - Outline + strong glow
5. **Keyboard + Hover** - Outline + strongest glow + lift

This hierarchy ensures users always understand the current state.

## Accessibility Benefits

✅ **Mouse users** - Get familiar hover feedback
✅ **Keyboard users** - Get clear outline indicator
✅ **Both** - States combine for maximum clarity
✅ **Transitions** - Smooth changes reduce jarring effects
✅ **High contrast** - Cyan on dark background is very visible

## Browser Compatibility

All effects use well-supported CSS:
- ✅ `:hover` pseudo-class (universal support)
- ✅ `outline` and `outline-offset` (all modern browsers)
- ✅ `box-shadow` (all modern browsers)
- ✅ `transform: translateY()` (all modern browsers)
- ✅ `transition` (all modern browsers)

## Result

Cards now provide excellent feedback for **both** mouse and keyboard users:
- 🖱️ **Hover works** - Glow + lift on mouse over
- ⌨️ **Keyboard works** - Outline + glow on focus
- 🎯 **Combined works** - Enhanced effects when both active
- 🎨 **Selected works** - Persistent visual state
- ✨ **Smooth transitions** - Professional feel

**Try it:** Use arrow keys to focus a card, then hover your mouse over it - you'll see the enhanced combined state! 🎯




