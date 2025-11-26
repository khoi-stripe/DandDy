# Card States: Visual Hierarchy

## 📋 Overview

Character cards have three distinct visual states with clear visual hierarchy:
1. **Selected** - Full teal effect (outline + glow) - Most prominent
2. **Hover/Focus** - Teal border only - Moderate prominence
3. **Normal** - Default border - Subtle

## 🎨 Visual States

### **1. Selected Card** (`.is-selected`)
The currently viewed character - most visually prominent.

```
        ┏━━━━━━━━━━━━━━━┓ ← Teal outline (1px, 2px offset)
       ┃┌───────────────┐┃
      ┃ │  Character    │ ┃ ← Teal glow (15px blur)
      ┃ │  Level 5      │ ┃
       ┃└───────────────┘┃
        ┗━━━━━━━━━━━━━━━┛
           ▲
           Full effect: outline + glow
```

**CSS:**
```css
.character-card.is-selected {
    border-color: var(--terminal-accent);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
    outline: 1px solid var(--terminal-accent);
    outline-offset: 2px;
}
```

**Visual Properties:**
- ✅ Teal border
- ✅ Teal outline (exterior stroke)
- ✅ Cyan glow effect
- ✅ Most prominent visual state

---

### **2. Hover/Focus Card** (`:hover` or `.is-keyboard-focused`)
Card under mouse or keyboard focus - moderate prominence.

```
┌───────────────┐ ← Teal border (no outline, no glow)
│  Character    │
│  Level 5      │
└───────────────┘
     ▲
     Just teal border
```

**CSS:**
```css
.character-card:hover,
.character-card.is-keyboard-focused {
    border-color: var(--terminal-accent);
}
```

**Visual Properties:**
- ✅ Teal border only
- ❌ No outline
- ❌ No glow
- ✅ Subtle but clear indication

---

### **3. Dimmed Focus** (`.is-keyboard-focused.is-dimmed`)
Keyboard focused card after 1.5s delay - subtle.

```
┌───────────────┐ ← Default border (returns to normal)
│  Character    │
│  Level 5      │
└───────────────┘
     ▲
     Default appearance
```

**CSS:**
```css
.character-card.is-keyboard-focused.is-dimmed {
    border-color: var(--terminal-border);
}
```

**Visual Properties:**
- ✅ Default border (dim green)
- ❌ No teal accent
- ✅ Returns to normal appearance
- ✅ Least intrusive state

---

### **4. Normal Card** (default)
Unselected, unfocused card.

```
┌───────────────┐ ← Default border
│  Character    │
│  Level 5      │
└───────────────┘
```

**CSS:**
```css
.character-card {
    border: 1px solid var(--terminal-border);
}
```

---

## 🎯 Visual Hierarchy

From **most** to **least** prominent:

```
1. Selected          ┏━━━━━━━━━┓    Outline + Glow + Border
                    ┃┌─────────┐┃
                   ┃ │ Card    │ ┃
                    ┃└─────────┘┃
                     ┗━━━━━━━━━┛

2. Hover/Focus      ┌─────────┐     Border only (teal)
                    │ Card    │
                    └─────────┘

3. Dimmed Focus     ┌─────────┐     Default border
                    │ Card    │
                    └─────────┘

4. Normal           ┌─────────┐     Default border
                    │ Card    │
                    └─────────┘
```

## 🔄 State Transitions

### **Selection Flow**
```
Normal → Click/Enter → Selected (outline + glow + border)
                           ↓
                    Character sheet displays
                           ↓
                    Stays selected until another card clicked
```

### **Hover Flow**
```
Normal → Mouse Over → Hover (teal border)
                         ↓
         Mouse Out → Normal (default border)
```

### **Keyboard Focus Flow**
```
Normal → Arrow Key → Focused (teal border)
                        ↓
            Wait 1.5s → Dimmed (default border)
                        ↓
            Hover → Focused (teal border)
                        ↓
         Mouse Out → Dimmed (default border)
```

### **Combined States**
A card can be BOTH selected AND focused:

```
Card A: [SELECTED + FOCUSED]
    ↓
    Has BOTH effects:
    - Outline + glow (from selected)
    - Teal border (from focused)
```

## 🎪 State Combinations

| State | Border | Outline | Glow | Visual Result |
|-------|--------|---------|------|---------------|
| Normal | Default | None | None | Subtle |
| Hover | Teal | None | None | Moderate |
| Focused | Teal | None | None | Moderate |
| Dimmed Focus | Default | None | None | Subtle |
| Selected | Teal | Teal | Yes | **Prominent** |
| Selected + Focused | Teal | Teal | Yes | **Prominent** |

## 💡 Design Rationale

### **Why Selected Gets Full Effect**
- Selected card represents the currently viewed character
- Most important card on screen (sheet is showing this character)
- Deserves maximum visual prominence
- User needs to always know which character they're viewing

### **Why Hover/Focus Get Only Border**
- Hover is temporary (mouse passing over)
- Focus is exploratory (browsing with keyboard)
- Too much visual effect would be distracting
- Teal border provides sufficient feedback
- Keeps focus on the selected card (most important)

### **Why Dimmed Focus Returns to Normal**
- After 1.5s, user is likely reading the character sheet
- Bright indicators become distracting
- Dimming to normal appearance reduces visual noise
- Still maintains keyboard position internally
- Hover restores teal border for confirmation

## 🎨 Color Values

| Color | Variable | RGB | Usage |
|-------|----------|-----|-------|
| **Teal Accent** | `--terminal-accent` | `rgb(0, 255, 255)` | Selected, hover, focus |
| **Default Border** | `--terminal-border` | `rgba(0, 255, 0, 0.3)` | Normal state |
| **Dim Border** | `--terminal-dim` | `rgba(0, 255, 0, 0.15)` | Subtle elements |

## 📊 Visual Comparison

```
SELECTED (Currently Viewing)
        ┏━━━━━━━━━━━━━━━┓
       ┃┌───────────────┐┃  ← Clear "this is important"
      ┃ │ Elladan       │ ┃
      ┃ │ Elf Bard 5    │ ┃
       ┃└───────────────┘┃
        ┗━━━━━━━━━━━━━━━┛

HOVER/FOCUS (Exploring)
┌───────────────┐
│ Brom          │  ← Subtle "hovering here"
│ Dwarf Fighter │
└───────────────┘

NORMAL (Other Cards)
┌───────────────┐
│ Lyra          │  ← Minimal distraction
│ Human Wizard  │
└───────────────┘
```

## 🚀 Benefits

1. **Clear Hierarchy**: Always obvious which card is selected
2. **Subtle Interactions**: Hover doesn't compete with selection
3. **Reduced Distraction**: Dimmed focus fades into background
4. **Responsive Feedback**: All interactions provide visual confirmation
5. **Consistent Pattern**: Same visual language throughout

---

## 📝 Files Modified

- `character-manager.css` - Updated state styles

---

*Clean visual hierarchy that guides user attention to what matters most.*









