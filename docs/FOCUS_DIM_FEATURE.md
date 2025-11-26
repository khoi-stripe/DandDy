# Focus Dim Feature

## 📋 Overview

The character card focus outline now automatically dims after a short delay, creating a more subtle and less distracting visual indicator while still maintaining focus awareness. The card content remains fully visible at all times.

## ✨ Feature Behavior

### **Timeline**
```
User navigates with keyboard
    ↓
Card receives focus (bright outline) ← Full bright focus
    ↓
Wait 1.5 seconds
    ↓
Focus outline dims ← Subtle indicator
    ↓
User hovers with mouse
    ↓
Outline brightens again ← Bright on interaction
    ↓
Mouse leaves
    ↓
Outline dims again ← Dimmed outline
```

### **Visual States**

1. **Initial Focus (0-1.5s)**
   - Outline: Cyan (full brightness)
   - Glow: Full cyan glow (0 0 15px)
   - Card content: 100% visible

2. **Dimmed Focus (after 1.5s)**
   - Outline: Dark green (dimmed)
   - Glow: Subtle glow (0 0 8px)
   - Card content: 100% visible (unchanged)

3. **Mouse Hover on Dimmed Card**
   - Restores bright cyan outline
   - Restores full glow effect
   - Card content remains 100% visible
   - Returns to dimmed outline when mouse leaves

## 🔧 Implementation

### **CSS**
```css
/* Base focus state */
.character-card.is-keyboard-focused {
    border-color: var(--terminal-accent);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
    outline: 1px solid var(--terminal-accent);
    outline-offset: 2px;
    transition: opacity 0.5s ease-out;
}

/* Dimmed state - only dim the outline, not the card */
.character-card.is-keyboard-focused.is-dimmed {
    outline-color: var(--terminal-dim);
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.2);
}

/* Restore bright outline on hover */
.character-card.is-keyboard-focused.is-dimmed:hover {
    outline-color: var(--terminal-accent);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
}
```

### **JavaScript**

#### **Timeout Management**
```javascript
const KeyboardNav = {
    dimTimeout: null, // Tracks current dim timeout
    
    updateFocus() {
        // Clear any existing timeout
        if (this.dimTimeout) {
            clearTimeout(this.dimTimeout);
            this.dimTimeout = null;
        }
        
        // Remove dimmed state from all cards
        cards.forEach((card) => {
            card.classList.remove('is-keyboard-focused', 'is-dimmed');
        });
        
        // Add focus to current card
        focusedCard.classList.add('is-keyboard-focused');
        
        // Dim after 1.5 seconds
        this.dimTimeout = setTimeout(() => {
            if (focusedCard.classList.contains('is-keyboard-focused')) {
                focusedCard.classList.add('is-dimmed');
            }
        }, 1500);
    }
};
```

#### **Mouse Interaction**
```javascript
// Event delegation on character grid
characterGrid.addEventListener('mouseenter', (e) => {
    const card = e.target.closest('.character-card');
    if (card && card.classList.contains('is-dimmed')) {
        card.classList.remove('is-dimmed'); // Brighten on hover
    }
}, true);

characterGrid.addEventListener('mouseleave', (e) => {
    const card = e.target.closest('.character-card');
    if (card && card.classList.contains('is-keyboard-focused')) {
        card.classList.add('is-dimmed'); // Re-dim on leave
    }
}, true);
```

## 🎯 User Experience

### **Benefits**
1. ✅ **Less Distracting**: Dimmed focus doesn't compete for attention
2. ✅ **Still Visible**: 50% opacity maintains awareness of focused card
3. ✅ **Responsive**: Brightens immediately on mouse hover
4. ✅ **Smooth Transition**: 0.5s fade feels natural and polished

### **Use Cases**
- **Reading Character Sheet**: After selecting a card, focus dims so you can read without distraction
- **Quick Navigation**: Initial bright focus helps confirm which card you landed on
- **Mouse Interaction**: Hover brightens card for easy visual feedback

## 🔄 Interaction with Other States

### **Selection**
- Selected card maintains `.is-selected` class
- Focus can be on a different card than selection
- Both states are independent and can coexist

### **Hover**
- Hover always restores bright outline
- Hover on dimmed card removes `.is-dimmed` class  
- Leaving hover on focused card re-adds `.is-dimmed` class

### **Keyboard Navigation**
- Arrow keys move focus and reset the 1.5s timer
- Each navigation starts a fresh bright focus period
- Smooth opacity transition between focus changes

## 📊 Technical Details

### **Timing**
- **Dim Delay**: 1500ms (1.5 seconds)
- **Fade Duration**: 500ms (0.5 seconds)
- **Easing**: `ease-out` (natural slow-down)

### **Opacity Values**
- **Full**: `1.0` (100%)
- **Dimmed**: `0.5` (50%)

### **Event Handling**
- **Event Delegation**: Single listener on grid, not per-card
- **Capture Phase**: `true` for early event catching
- **Timeout Cleanup**: Always clear previous timeout before setting new one

## 🎨 Visual Comparison

```
BEFORE (Always Bright)
┏━━━━━━━━━━━━━━━━┓ ← Always this bright
┃ ✨ Card        ┃
┃ Level 5        ┃
┗━━━━━━━━━━━━━━━━┛
     ↑ Can be distracting when reading

AFTER (Auto-Dim)
┌────────────────┐ ← Dims to 50% after 1.5s
│ ░ Card         │    Less distracting
│ Level 5        │
└────────────────┘
     ↑ Still visible, not intrusive

ON HOVER (Restored)
┏━━━━━━━━━━━━━━━━┓ ← Brightens on hover
┃ ✨ Card        ┃
┃ Level 5        ┃
┗━━━━━━━━━━━━━━━━┛
     ↑ Full brightness for interaction
```

## 🚀 Performance

- **No Layout Recalculation**: Only opacity changes
- **GPU Accelerated**: Opacity transitions use hardware acceleration
- **Event Delegation**: Single listener handles all cards
- **Cleanup**: Timeout properly cleared on focus change

## 📝 Files Modified

1. **character-manager.css**
   - Added `.is-dimmed` state styles
   - Added opacity transition
   - Added hover restore rule

2. **character-manager.js**
   - Added `dimTimeout` to `KeyboardNav`
   - Modified `updateFocus()` to set timeout
   - Added mouse event listeners for dim/restore behavior

---

*This feature creates a more polished, less intrusive keyboard navigation experience while maintaining clear visual feedback.*

