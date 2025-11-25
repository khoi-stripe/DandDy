# Final Card States System

## 📋 Overview

Character cards have three distinct visual states with clear hierarchy:
1. **Selected** - Glow + teal border + teal ASCII art
2. **Hover/Focus** - Outline + teal border + green ASCII art
3. **Normal** - Default border + green ASCII art

## 🎨 Visual States

### **1. Selected Card** (`.is-selected`)
The currently viewed character in the right panel.

```
┌───────────────┐
│████████████████│ ← Teal ASCII art
│ Elladan       │
│ Elf Bard 5    │ ← Cyan glow (15px)
└───────────────┘ ← Teal border
```

**Visual Properties:**
- ✅ Teal border
- ✅ Cyan glow effect (15px)
- ✅ Teal ASCII art
- ❌ No outline

**CSS:**
```css
.character-card.is-selected {
    border-color: var(--terminal-accent);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
}

.character-card.is-selected .card-thumbnail {
    color: var(--terminal-accent);
}
```

---

### **2. Hover/Focus Card** (`:hover` or `.is-keyboard-focused`)
Card under mouse or keyboard focus.

```
    ┏━━━━━━━━━━━━━━━┓ ← Teal outline (1px, 2px offset)
   ┌───────────────┐
   │░░░░░░░░░░░░░░│ ← Green ASCII art
   │ Brom          │
   │ Dwarf Fighter │ ← No glow
   └───────────────┘ ← Teal border
```

**Visual Properties:**
- ✅ Teal border
- ✅ Teal outline (exterior stroke)
- ✅ Green ASCII art
- ❌ No glow

**CSS:**
```css
.character-card:hover,
.character-card.is-keyboard-focused {
    border-color: var(--terminal-accent);
    outline: 1px solid var(--terminal-accent);
    outline-offset: 2px;
}
```

---

### **3. Normal Card** (default)
Unselected, unfocused card.

```
┌───────────────┐
│░░░░░░░░░░░░░░│ ← Green ASCII art
│ Lyra          │
│ Human Wizard  │ ← No glow
└───────────────┘ ← Default border
```

**Visual Properties:**
- ✅ Default border (dim green)
- ✅ Green ASCII art
- ❌ No outline
- ❌ No glow

**CSS:**
```css
.character-card {
    border: 1px solid var(--terminal-border);
}

.card-thumbnail {
    color: var(--terminal-fg);
}
```

---

## 🎯 Visual Hierarchy Summary

From **most** to **least** prominent:

| State | Border | Outline | Glow | ASCII | Prominence |
|-------|--------|---------|------|-------|------------|
| **Selected** | Teal | No | Yes | Teal | ★★★ Highest |
| **Hover/Focus** | Teal | Yes | No | Green | ★★ Moderate |
| **Normal** | Default | No | No | Green | ★ Subtle |

## 🎨 Design Rationale

### **Why Selected Gets Glow + Teal ASCII**
- **Glow**: Soft, ambient effect that doesn't obstruct content
- **Teal ASCII**: Matches the accent color, reinforces selection
- **No Outline**: Cleaner look, glow provides enough prominence
- **Result**: Selected card is unmistakably the "active" character

### **Why Hover/Focus Gets Outline**
- **Outline**: Sharp, clear visual indicator for interaction
- **No Glow**: Would be too prominent for temporary hover state
- **Green ASCII**: Keeps focus on the selected card's teal portrait
- **Result**: Clear feedback without competing with selection

### **Why Normal Cards Stay Green**
- **Green Theme**: Maintains terminal aesthetic
- **Consistency**: All unselected cards look the same
- **Hierarchy**: Makes teal ASCII on selected card stand out
- **Result**: Clean, organized grid that highlights the important card

## 🔄 State Transitions

### **Selection Flow**
```
Normal           Hover/Focus          Selected
(Green ASCII) → (Outline + Teal Border) → (Glow + Teal ASCII)
                                           ↓
                                    Character sheet displays
```

### **Navigation Flow**
```
Card A [SELECTED] → Arrow Key → Card A [SELECTED]
(Glow + Teal)                    (Glow + Teal)
                                 
Card B [NORMAL]                  Card B [FOCUSED]
(Green)                          (Outline + Green)
```

### **Selection + Focus**
A card can be BOTH selected AND focused:

```
Card [SELECTED + FOCUSED]
    ↓
Combined Effects:
- Glow (from selected)
- Teal border (from both)
- Outline (from focused)
- Teal ASCII (from selected)
```

## 🎪 State Combinations

### **Selected Only**
```
┌───────────────┐
│████ TEAL ████│ ← Glow + Teal ASCII
│ Character     │
└───────────────┘
```

### **Focused Only**
```
    ┏━━━━━━━━━━━━━━━┓
   ┌───────────────┐ ← Outline, no glow
   │░░░░ GREEN ░░░│
   │ Character     │
   └───────────────┘
```

### **Selected + Focused**
```
    ┏━━━━━━━━━━━━━━━┓
   ┌───────────────┐ ← Outline + Glow
   │████ TEAL ████│
   │ Character     │
   └───────────────┘
```

## 💡 Key Behaviors

### **Immediate Focus Changes**
- Focus changes instantly when navigating
- No delays or auto-dim timers
- Clean, responsive interaction

### **ASCII Art Color Coding**
- **Teal = Selected** (this is the active character)
- **Green = Not Selected** (all other characters)
- Provides instant visual feedback at a glance

### **Outline Usage**
- **No Outline**: Selected (soft glow is enough)
- **With Outline**: Hover/Focus (sharp indicator for interaction)
- Creates clear visual distinction between states

## 🎨 Color Palette

| Element | Color | Value | Usage |
|---------|-------|-------|-------|
| **Teal Accent** | Cyan | `rgb(0, 255, 255)` | Selected elements, interactions |
| **Green Text** | Green | `rgba(0, 255, 0, 0.9)` | Default ASCII art |
| **Dim Border** | Dark Green | `rgba(0, 255, 0, 0.3)` | Default card borders |
| **Glow** | Cyan 50% | `rgba(0, 255, 255, 0.5)` | Selected card ambient light |

## 📊 Visual Comparison

```
THREE CARDS IN A ROW:

    ┏━━━━━━━━━━━━━━━┓     ┌───────────────┐     ┌───────────────┐
   ┌───────────────┐       │░░░░░░░░░░░░░░│     │████████████████│
   │████████████████│       │ Card B        │     │ Card C        │
   │ Card A        │       │ Normal        │     │ Selected      │
   │ Focused       │       │               │     │               │
   └───────────────┘       └───────────────┘     └───────────────┘
   ▲                       ▲                      ▲
   Outline (no glow)       Green ASCII            Glow + Teal ASCII
   Green ASCII             Default border         Teal border
```

## 🚀 Benefits

1. **Clear Hierarchy**: Selected card always stands out with unique glow + teal ASCII
2. **Sharp Feedback**: Outline provides crisp visual indicator for hover/focus
3. **Color Coding**: ASCII art color instantly shows selection state
4. **Clean Design**: Each state has just enough visual treatment, no more
5. **Terminal Aesthetic**: Green/teal palette maintains retro-futuristic theme

---

## 📝 Files Modified

- `character-manager.css` - Card state styles
- `character-manager.js` - Removed auto-dim logic

---

*A refined visual system that balances clarity with aesthetic restraint.*









