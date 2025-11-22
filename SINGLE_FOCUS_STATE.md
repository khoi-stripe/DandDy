# Single Focus State System

## 📋 Overview

The character manager ensures that only one card ever has the hover or focus outline at a time. When you switch between mouse and keyboard navigation, the previous focus state is automatically cleared.

## 🎯 Behavior

### **Only One Card at a Time**

```
BEFORE (Could have multiple outlines):
    ┏━━━━━━━━━┓     ┏━━━━━━━━━┓
   ┌─────────┐     ┌─────────┐
   │ Card A  │     │ Card B  │
   │ (Hover) │     │ (Focus) │
   └─────────┘     └─────────┘
        ▲               ▲
    Two outlines visible at once ❌

AFTER (Single focus/hover):
    ┏━━━━━━━━━┓     ┌─────────┐
   ┌─────────┐     │ Card B  │
   │ Card A  │     │         │
   │ (Hover) │     │         │
   └─────────┘     └─────────┘
        ▲
    Only one outline ✅
```

## 🔄 Interaction Modes

### **Mouse Mode**
When you move your mouse over cards:
1. Keyboard focus is immediately cleared from all cards
2. CSS `:hover` takes over for visual feedback
3. Only the hovered card shows the outline

```
Keyboard Focus Active → Mouse Hover → Keyboard Focus Cleared
                                      ↓
                              CSS :hover shows outline
```

### **Keyboard Mode**
When you use arrow keys:
1. `.is-keyboard-focused` class is removed from all cards
2. `.is-keyboard-focused` class is added to current card
3. Only the focused card shows the outline

```
Multiple Cards → Arrow Key → Clear All → Add to Current
                                          ↓
                                   Only one has outline
```

## 🔧 Implementation

### **KeyboardNav Object**

**New Method: `clearAll()`**
```javascript
clearAll() {
    // Clear keyboard focus from all cards (used when mouse takes over)
    const cards = this.getCharacterCards();
    cards.forEach(card => card.classList.remove('is-keyboard-focused'));
}
```

**Updated Method: `updateFocus()`**
```javascript
updateFocus() {
    const cards = this.getCharacterCards();
    
    // Remove focus from all cards (immediate change)
    cards.forEach((card) => {
        card.classList.remove('is-keyboard-focused');
    });
    
    // Add focus to current index
    if (cards[this.currentFocusIndex]) {
        cards[this.currentFocusIndex].classList.add('is-keyboard-focused');
    }
}
```

### **Mouse Event Handler**

```javascript
// Clear keyboard focus when hovering over any card (mouse takes over)
const characterGrid = document.getElementById('characterGrid');
characterGrid.addEventListener('mouseenter', (e) => {
    const card = e.target.closest('.character-card');
    if (card) {
        // Clear keyboard focus from all cards when mouse is active
        KeyboardNav.clearAll();
    }
}, true); // Use capture phase
```

### **CSS**

Both hover and keyboard focus use the same styling:

```css
.character-card:hover,
.character-card.is-keyboard-focused {
    border-color: var(--terminal-accent);
    outline: 1px solid var(--terminal-accent);
    outline-offset: 2px;
}
```

## 🎪 Scenarios

### **Scenario 1: Keyboard to Mouse**
```
1. User presses arrow key
   Card A: [FOCUSED] ← Has outline
   
2. User hovers mouse over Card B
   Card A: [       ] ← Outline removed
   Card B: [HOVER  ] ← Has outline
```

### **Scenario 2: Mouse to Keyboard**
```
1. User hovers over Card A
   Card A: [HOVER  ] ← Has outline (CSS :hover)
   
2. User moves mouse away
   Card A: [       ] ← No outline (CSS :hover removed)
   
3. User presses arrow key
   Card B: [FOCUSED] ← Has outline
```

### **Scenario 3: Rapid Keyboard Navigation**
```
1. User presses arrow key
   Card A: [FOCUSED] ← Has outline
   
2. User immediately presses arrow key again
   Card A: [       ] ← Outline removed
   Card B: [FOCUSED] ← Has outline
   
Result: Only Card B has outline ✅
```

### **Scenario 4: Mouse Hover During Keyboard Navigation**
```
1. User navigates with keyboard
   Card A: [FOCUSED] ← Has outline
   
2. User hovers mouse over Card C
   Card A: [       ] ← Keyboard focus cleared
   Card C: [HOVER  ] ← Mouse hover active
   
3. User moves mouse away from Card C
   Card C: [       ] ← No outlines anywhere
   
4. User resumes keyboard navigation
   Card D: [FOCUSED] ← Has outline
```

## 💡 Benefits

### **1. Clean Visual State**
- ✅ Never shows multiple outlines simultaneously
- ✅ Clear which card is the current focus of attention
- ✅ No confusion between mouse and keyboard indicators

### **2. Seamless Mode Switching**
- ✅ Switch between mouse and keyboard instantly
- ✅ No need to manually clear previous state
- ✅ Each input method takes control naturally

### **3. Consistent Behavior**
- ✅ Same outline style for hover and keyboard focus
- ✅ Same clearing logic for all transitions
- ✅ Predictable and intuitive for users

### **4. Performance**
- ✅ Event delegation on grid (one listener, not per-card)
- ✅ Capture phase ensures early event handling
- ✅ Efficient class toggling with `classList`

## 🎨 Visual Hierarchy with Single Focus

```
THREE CARDS WITH SINGLE FOCUS:

┌───────────────┐     ┏━━━━━━━━━━━━━━━┓     ┌───────────────┐
│ Card A        │    ┌───────────────┐     │████████████████│
│ Normal        │    │ Card B        │     │ Card C        │
│               │    │ Focused/Hover │     │ Selected      │
└───────────────┘    └───────────────┘     └───────────────┘
                              ▲                    ▲
                     Only ONE has outline    Glow (not outline)
```

**Key Points:**
- **Card A**: Normal state, no outline
- **Card B**: Focused/hovered, has outline (only one)
- **Card C**: Selected, has glow (different from focus outline)

## 🔄 State Combinations

| Situation | Card A | Card B | Card C | Result |
|-----------|--------|--------|--------|--------|
| Keyboard focus on A | 🟦 Outline | - | - | One outline |
| Mouse hover on B | - | 🟦 Outline | - | One outline |
| Both at once | - | 🟦 Outline | - | **Still one** ✅ |
| Card C selected + B focused | - | 🟦 Outline | 🟢 Glow | Different effects |

## 📊 Comparison

### **Before: Multiple Focus States Possible**
```
User navigates with keyboard → Card A focused
User hovers with mouse → Card B hovered
Result: TWO outlines visible ❌
```

### **After: Single Focus State Enforced**
```
User navigates with keyboard → Card A focused
User hovers with mouse → Card A unfocused, Card B hovered
Result: ONE outline visible ✅
```

## 🚀 Technical Details

### **Event Delegation**
- Single listener on `#characterGrid`
- Uses `closest('.character-card')` to find target
- Capture phase (`true`) for early interception

### **Class Management**
- `.is-keyboard-focused` added/removed via JavaScript
- CSS `:hover` managed automatically by browser
- Both trigger same visual styles

### **Clearing Strategy**
- **Keyboard Navigation**: Clear all, then add to one
- **Mouse Hover**: Clear all, let CSS handle hover
- **Mode Switch**: Clear keyboard, mouse takes over

## 📝 Files Modified

- `character-manager.js`:
  - Added `KeyboardNav.clearAll()` method
  - Added mouse enter event listener on grid
  - Simplified `updateFocus()` logic

---

*Ensures a clean, unambiguous focus state that switches seamlessly between mouse and keyboard input.*







