# Focus Follows Selection

## Overview

Keyboard focus now **automatically moves** to whichever card is selected, regardless of how it was selected (mouse click or keyboard Enter).

## Behavior

### Before
```
User clicks Card 5 with mouse
  ↓
Card 5 is selected (tinted background)
  ↓
Keyboard focus stays on Card 1 (outline)
  ↓
Result: Two different cards highlighted!
```

### After  
```
User clicks Card 5 (or presses Enter on Card 5)
  ↓
Card 5 is selected (tinted background)
  ↓
Keyboard focus MOVES to Card 5 (outline)
  ↓
Result: Selection and focus are synchronized!
```

## Implementation

```javascript
function viewCharacter(id) {
    // ... display character details ...
    
    // Mark card as selected
    selectedCard.classList.add('is-selected');
    
    // Move keyboard focus to the selected card
    const allCards = KeyboardNav.getCharacterCards();
    const cardIndex = allCards.indexOf(selectedCard);
    if (cardIndex !== -1) {
        KeyboardNav.currentFocusIndex = cardIndex;
        KeyboardNav.updateFocus();
    }
}
```

## Visual Result

### When you click a card:
```
BEFORE CLICK:

  ┌───────────────┐ ← Keyboard focus (Card 1)
  │┌═════════════┐│
  │║   Card 1    ║│
  │╚═════════════╝│
  └───────────────┘

┌─────────────────┐ ← Normal (Card 5)
│   Card 5        │
└─────────────────┘


AFTER CLICK on Card 5:

┌─────────────────┐ ← Normal (Card 1)
│   Card 1        │
└─────────────────┘

  ┌───────────────┐ ← Both selected AND focused (Card 5)
  │┌═════════════┐│
  │║░  Card 5  ░ ║│ (Tint + Outline)
  │╚═════════════╝│
  └───────────────┘
```

## User Experience Flows

### Flow 1: Mouse Selection
1. User hovers over Card 7 → Shows outline
2. User clicks Card 7 → Card becomes selected
3. **Keyboard focus moves to Card 7** ← New!
4. User presses ↓ arrow → Moves to Card 10 (3 rows down)

### Flow 2: Keyboard Selection
1. User presses → arrow to Card 4 → Shows outline  
2. User presses Enter on Card 4 → Card becomes selected
3. **Keyboard focus stays on Card 4** (already there)
4. User presses ↓ arrow → Moves to Card 7

### Flow 3: Mixed Input
1. User navigates with arrows to Card 2
2. User clicks Card 9 with mouse
3. **Keyboard focus jumps to Card 9** ← Synchronized!
4. User continues with arrow keys from Card 9

## Benefits

### ✅ **Predictability**
Focus is always where the action is. If you select something, focus moves there.

### ✅ **Consistency**
Doesn't matter if you used mouse or keyboard - focus follows selection.

### ✅ **Better UX**
Continue navigating from the card you just selected, not where you were before.

### ✅ **Less Confusion**
No more "why are two cards highlighted?"

### ✅ **Natural Flow**
Focus and selection stay in sync automatically.

## State Synchronization

| Action | Selection | Keyboard Focus | Visual |
|--------|-----------|----------------|--------|
| Click Card 3 | Card 3 | **Card 3** | Tint + Outline |
| Press Enter on Card 5 | Card 5 | Card 5 | Tint + Outline |
| Arrow to Card 8 | (unchanged) | Card 8 | Outline only |
| Hover Card 2 | (unchanged) | (unchanged) | Outline only |

**Selection and Focus always point to the same card!**

## Technical Details

### Focus Update Logic

```javascript
// Get all cards
const allCards = KeyboardNav.getCharacterCards();

// Find index of the selected card
const cardIndex = allCards.indexOf(selectedCard);

// Update keyboard focus index
KeyboardNav.currentFocusIndex = cardIndex;

// Apply focus styling
KeyboardNav.updateFocus();
```

### Why This Works

1. **Single source of truth:** Selection determines focus
2. **Index-based:** Tracks position in the grid
3. **Works with filtering:** Respects filtered character list
4. **Safe:** Checks if card exists before updating

## Edge Cases Handled

### Card Not Found
```javascript
if (cardIndex !== -1) {
    // Only update if card exists
}
```
If the card somehow doesn't exist in the grid, focus doesn't change.

### After Import
1. Character imported
2. Grid re-renders
3. `viewCharacter()` called on new character
4. Focus moves to imported character automatically

### After Search/Filter
1. Search filters characters
2. Click a visible card
3. Focus updates based on **filtered grid position**
4. Navigation continues within filtered results

## Comparison

| Approach | Selection | Focus | Result |
|----------|-----------|-------|--------|
| **Independent** | Card A | Card B | ❌ Confusing |
| **Focus Follows** | Card A | Card A | ✅ Clear |

## User Mental Model

**"Where I'm looking is where my focus is"**

Users expect:
- If I click something → that's where focus is
- If I press Enter → that's where focus stays
- If I navigate → focus moves with me

This update ensures the system matches user expectations!

## Related Features

This works seamlessly with:
- ✅ Grid navigation (arrow keys)
- ✅ Selection state (tinted background)
- ✅ Unified focus state (outline + glow)
- ✅ Auto-scroll (selected card scrolls into view)

## Result

✅ **Focus always matches selection**
✅ **Works with mouse clicks**
✅ **Works with keyboard Enter**
✅ **Predictable navigation**
✅ **No confusion about "where am I?"**

**Try it:** Click any card with your mouse, then immediately press an arrow key - navigation starts from the card you just clicked! 🎯




