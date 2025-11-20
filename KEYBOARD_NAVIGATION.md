# Keyboard Navigation - Character Manager

## Overview

Full keyboard navigation has been implemented for the Character Manager, allowing you to browse and select characters without using a mouse.

## Keyboard Controls

### Character Grid Navigation

| Key | Action |
|-----|--------|
| **↑ Arrow Up** | Move up one row (3 cards) |
| **↓ Arrow Down** | Move down one row (3 cards) |
| **← Arrow Left** | Move to previous card |
| **→ Arrow Right** | Move to next card |
| **Enter** | Select/view the focused character |
| **Esc** | Close import modal |
| **Any Key** | Dismiss splash screen |

### Grid Layout Understanding

With a 3-column grid:
```
[Card 1] [Card 2] [Card 3]  ← Row 1
[Card 4] [Card 5] [Card 6]  ← Row 2
[Card 7] [Card 8] [Card 9]  ← Row 3
```

**Navigation behavior:**
- **Left/Right arrows:** Move one card at a time
- **Up/Down arrows:** Jump 3 cards (one full row)
- Focus wraps at boundaries (stops at edges)

## Visual Feedback

### Keyboard Focus State
When a card is focused via keyboard:
- **Cyan border** glows brighter
- **Outline** appears around the card (2px solid cyan)
- **Stronger shadow** effect (more visible glow)

### Selected State
When a character is clicked/selected:
- **Cyan border** remains
- **Background tint** (10% cyan opacity)
- **Shadow glow** effect

Both states can coexist - a card can be both keyboard-focused AND selected.

## Implementation Details

### KeyboardNav Object

```javascript
const KeyboardNav = {
    currentFocusIndex: 0,     // Currently focused card index
    isActive: true,            // Navigation enabled?
    
    moveUp()                   // Move up one row
    moveDown()                 // Move down one row
    moveLeft()                 // Move left one card
    moveRight()                // Move right one card
    select()                   // Click the focused card
    reset()                    // Reset to first card
};
```

### Focus Management

**When grid is rendered:**
1. `KeyboardNav.reset()` is called
2. Focus returns to first card (index 0)
3. Previous focus state is cleared

**When navigating:**
1. Remove `.is-keyboard-focused` from all cards
2. Calculate new index (with boundary checks)
3. Add `.is-keyboard-focused` to new card
4. Scroll card into view (smooth)

### Smart Blocking

Navigation is disabled when:
- ✋ Splash screen is active (any key dismisses it)
- ✋ Import modal is open (ESC closes it)
- ✋ Focus is in an input/textarea/select element

This prevents keyboard shortcuts from interfering with typing.

## CSS Styling

```css
.character-card.is-keyboard-focused {
    border-color: var(--terminal-accent);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
    outline: 2px solid var(--terminal-accent);
    outline-offset: 2px;
}
```

The outline provides a clear visual indicator that's distinct from the selection state.

## User Experience Flow

### Typical Usage

1. **Start:** Open character manager, splash shows
2. **Press any key:** Splash dismisses, main content appears
3. **Grid loads:** First character card is auto-focused (cyan outline)
4. **Navigate:** Use arrow keys to browse characters
5. **Select:** Press Enter to view character details
6. **Continue:** Arrow keys still work, can select another character

### With Import Modal

1. **Press I or click Import:** Modal opens
2. **Arrow keys:** No effect (modal active)
3. **Press ESC:** Modal closes
4. **Arrow keys:** Navigation resumes

## Responsive Behavior

### Desktop (3 columns)
- Up/Down: Jump by 3 (full row)
- Left/Right: Move by 1

### Mobile (1 column)
- Up/Down: Jump by 3 (but only 1 card per row)
- Left/Right: Move by 1
- **Effect:** All arrows move one card at a time

The navigation logic works correctly for both layouts without changes!

## Accessibility Benefits

✅ **No mouse required** - Full keyboard control
✅ **Clear focus indicators** - Visible outline shows current position
✅ **Logical navigation** - Arrow keys match visual grid layout
✅ **Escape to cancel** - Standard modal dismissal
✅ **Auto-scrolling** - Focused cards scroll into view
✅ **Smart blocking** - Doesn't interfere with input fields

## Edge Cases Handled

### Empty Grid
- Navigation disabled (`isActive = false`)
- No focus indicators shown
- Arrow keys have no effect

### Single Character
- Focus on only card
- Arrow keys don't change focus
- Enter still selects

### After Search/Filter
- Focus resets to first result
- Navigation works on filtered set
- Index stays within bounds

### After Import
- Grid re-renders
- Focus resets to first card
- New character is auto-selected (not keyboard-focused)

## Technical Implementation

### Event Listener
```javascript
window.addEventListener('keydown', (e) => {
    if (splashActive) return;
    if (modalOpen) return;
    if (inputFocused) return;
    
    switch(e.key) {
        case 'ArrowUp':
            e.preventDefault();
            KeyboardNav.moveUp();
            break;
        // ... etc
    }
});
```

### Focus Update
```javascript
updateFocus() {
    const cards = this.getCharacterCards();
    
    // Clear all focus
    cards.forEach(card => 
        card.classList.remove('is-keyboard-focused')
    );
    
    // Set new focus
    cards[this.currentFocusIndex]?.classList.add('is-keyboard-focused');
    
    // Scroll into view
    cards[this.currentFocusIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
    });
}
```

## Future Enhancements

Potential additions:
- [ ] Tab key navigation for buttons
- [ ] Shift+Arrow for multi-select
- [ ] Ctrl+A to select all
- [ ] Delete key to delete focused character
- [ ] Keyboard shortcuts (N for new, I for import)
- [ ] Jump to character by typing name

## Comparison to Builder

| Feature | Builder | Manager |
|---------|---------|---------|
| **Primary Navigation** | Up/Down | Arrow Grid |
| **Selection** | Enter | Enter |
| **Focus Type** | Buttons | Character Cards |
| **Grid Navigation** | No | Yes (2D) |
| **Auto-reset** | Per question | Per render |
| **Scroll Behavior** | Bottom | Into view |

The manager's navigation is adapted for a 2D grid layout versus the builder's linear button list.

## Result

✅ **Full keyboard control** for character browsing
✅ **Clear visual feedback** with cyan outline
✅ **Intuitive arrow key navigation** matching grid layout
✅ **Smart blocking** that doesn't interfere with input
✅ **Accessible** for users who prefer or require keyboard navigation

**Try it:** Open the manager, press any key to dismiss the splash, then use arrow keys to navigate! 🎹



