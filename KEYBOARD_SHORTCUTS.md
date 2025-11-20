# Keyboard Shortcuts Guide

## 📋 Overview

The Character Manager now supports comprehensive keyboard navigation for all interactive elements, allowing you to efficiently browse, search, and manage characters without using a mouse.

## ⌨️ **Full Keyboard Shortcut List**

### **Navigation Shortcuts**

| Key | Action |
|-----|--------|
| <kbd>/</kbd> | Focus search field |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Focus search field (alternative) |
| <kbd>Esc</kbd> | Return to character grid from search |
| <kbd>↑</kbd> | Move focus up (by 3 cards) |
| <kbd>↓</kbd> | Move focus down (by 3 cards) |
| <kbd>←</kbd> | Move focus left |
| <kbd>→</kbd> | Move focus right |
| <kbd>Enter</kbd> | Select/view focused character |

### **Modal Shortcuts**

| Key | Action |
|-----|--------|
| <kbd>Esc</kbd> | Close import modal |

## 🎯 **Usage Workflows**

### **Search for a Character**
```
Press / → Type character name → Esc → Navigate filtered results
```

**Example:**
1. Press <kbd>/</kbd> to jump to search
2. Type "Elf"
3. Press <kbd>Esc</kbd> to return to grid
4. Use arrow keys to browse filtered results
5. Press <kbd>Enter</kbd> to view character

### **Browse Character Grid**
```
Arrow keys → Navigate cards → Enter → View character
```

**Example:**
1. Use <kbd>↓</kbd> / <kbd>↑</kbd> to move between rows
2. Use <kbd>←</kbd> / <kbd>→</kbd> to move within row
3. Press <kbd>Enter</kbd> to open character sheet

### **Quick Search and Return**
```
/ → Search → Esc → Continue browsing
```

## 🎨 **Visual Feedback**

### **Focus States**

**Bright Focus (Initial 1.5s)**
```
┏━━━━━━━━━━━━━━━┓ ← Bright cyan outline
┃ Character     ┃    Strong glow
┃ Level 5       ┃
┗━━━━━━━━━━━━━━━┛
```

**Dimmed Focus (After 1.5s)**
```
┌───────────────┐ ← Dimmed outline
│ Character     │    Subtle glow
│ Level 5       │
└───────────────┘
```

**On Hover (Restored)**
```
┏━━━━━━━━━━━━━━━┓ ← Bright outline returns
┃ Character     ┃
┃ Level 5       ┃
┗━━━━━━━━━━━━━━━┛
```

## 🔧 **Technical Details**

### **Grid Navigation Logic**

The character grid is 3 columns wide:

```
┌─────┐ ┌─────┐ ┌─────┐
│  0  │ │  1  │ │  2  │  ← Row 1
└─────┘ └─────┘ └─────┘
┌─────┐ ┌─────┐ ┌─────┐
│  3  │ │  4  │ │  5  │  ← Row 2
└─────┘ └─────┘ └─────┘
```

**Arrow Keys:**
- <kbd>↑</kbd>: Move index -3 (one row up)
- <kbd>↓</kbd>: Move index +3 (one row down)
- <kbd>←</kbd>: Move index -1 (one card left)
- <kbd>→</kbd>: Move index +1 (one card right)

**Boundaries:**
- Won't wrap around edges
- Stops at first/last card

### **Context-Aware Behavior**

The keyboard handler is context-aware:

| Context | Behavior |
|---------|----------|
| **Character Grid** | Arrow keys navigate, Enter selects |
| **Search Field** | Type to search, Esc returns to grid |
| **Import Modal** | Esc closes modal |
| **Splash Screen** | Any key dismisses |

### **Form Element Detection**

When focus is in a form element (`<input>`, `<textarea>`, `<select>`):
- Only <kbd>Esc</kbd> is intercepted (to return to grid)
- All other keys work normally for text input
- Arrow keys move cursor within input, not between cards

## 🎪 **State Management**

### **Focus vs Selection**

The manager maintains two independent states:

1. **Keyboard Focus** (`.is-keyboard-focused`)
   - Visual outline and glow
   - Follows arrow key navigation
   - Can move independently of selection

2. **Selection** (`.is-selected`)
   - Indicates which character sheet is displayed
   - Set when clicking or pressing Enter on a card
   - Keyboard focus moves to selected card

**Example:**
```
Card A: [FOCUSED + SELECTED] ← Viewing this character
Card B: [         ]
Card C: [         ]

Press ↓

Card A: [    SELECTED     ] ← Still viewing this character
Card B: [                 ]
Card C: [                 ]
Card D: [    FOCUSED      ] ← But keyboard is here

Press Enter

Card A: [                 ]
Card B: [                 ]
Card C: [                 ]
Card D: [FOCUSED + SELECTED] ← Now viewing Card D
```

## 🚀 **Advanced Features**

### **Auto-Dim Focus**
- Focus automatically dims after 1.5 seconds
- Reduces visual distraction while reading
- Hover restores bright focus instantly
- Moving focus resets the timer

### **Scroll Into View**
- Focused card automatically scrolls into view
- Smooth scrolling animation
- Maintains card visibility during navigation

### **Search Integration**
- Search filters character grid in real-time
- Keyboard navigation works on filtered results
- Focus resets to first card after filtering

## 📱 **Responsive Behavior**

On mobile devices:
- Touch interaction works alongside keyboard
- Grid switches to 1 column
- Arrow key navigation still works (external keyboards)

## 🎯 **Best Practices**

### **For Quick Navigation**
- Use <kbd>↓</kbd> / <kbd>↑</kbd> for vertical browsing
- Use <kbd>Enter</kbd> to quickly view characters

### **For Searching**
- Press <kbd>/</kbd> to instantly jump to search
- Type a few characters to filter
- <kbd>Esc</kbd> to return and browse results

### **For Reading**
- Select a character
- Focus dims after 1.5s so you can read without distraction
- Use arrow keys when ready to browse again

## 🐛 **Troubleshooting**

**Issue**: Keyboard shortcuts not working
- **Fix**: Make sure import modal is closed
- **Fix**: Click on the left panel to give it focus

**Issue**: Can't type in search
- **Fix**: Press <kbd>/</kbd> to focus search field first

**Issue**: Focus not visible
- **Fix**: Move focus with arrow keys to refresh it

---

## 📝 **Implementation Files**

- `character-manager.js` - KeyboardNav object and event handlers
- `character-manager.css` - Focus state styles (`.is-keyboard-focused`, `.is-dimmed`)

---

*Complete keyboard accessibility for power users!*



