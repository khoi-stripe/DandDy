# Overflow Button System Audit & Reference

## Overview
The overflow button (three dots → X animation) is a reusable UI component used throughout DandDy to provide contextual actions in a space-efficient dropdown menu.

## Current Implementation Status

### ✅ Centralized Components

#### 1. **CSS Styles** (`terminal-theme.css`)
- **Lines 376-473**: Core overflow button styles with dots → X animation
- **Supports dual class names** for backwards compatibility:
  - `.overflow-trigger` (preferred, new)
  - `.sheet-actions-trigger` (legacy, deprecated but still supported)

#### 2. **JavaScript Toggle Logic** (`shared-character-sheet.js`)
- **`CharacterSheet.toggleSelectorMenu(triggerEl)`** (lines 442-655)
  - Handles open/close animation
  - Manages positioning (viewport-aware, prevents clipping)
  - Supports detached menus for modals (portrait history)
  - Auto-closes other open menus
  - Keyboard (Escape) support
  - Click-outside-to-close behavior

#### 3. **Canonical Markup Pattern**

```html
<div class="selector-shell">
  <button
    class="terminal-btn-small selector-trigger overflow-trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded="false"
    aria-label="More actions"
    onclick="CharacterSheet.toggleSelectorMenu(this)"
  >
    <span class="sheet-actions-icon" aria-hidden="true">
      <span class="sheet-actions-dot dot-1"></span>
      <span class="sheet-actions-dot dot-2"></span>
      <span class="sheet-actions-dot dot-3"></span>
    </span>
  </button>
  <div class="selector-menu" role="menu" aria-hidden="true">
    <button class="selector-option" type="button" role="menuitem" onclick="...">
      <span class="selector-option-icon">✎</span>
      <span class="selector-option-label">Action Name</span>
    </button>
    <!-- More options... -->
  </div>
</div>
```

### 📍 Current Usage Locations

| Location | File | Line | Context | Status |
|----------|------|------|---------|--------|
| 1. Sheet Header | `shared-character-sheet.js` | 249-283 | Character sheet header actions | ✅ Correct |
| 2. Portrait History Cards | `portraits-ui.js` | 505-523 | Portrait version actions in modal | ✅ Correct |
| 3. Debug Lab | `debug/overflow-button.html` | 243-284 | Test/demo of overflow button | ⚠️ Uses different classes |

### ⚠️ Inconsistencies Found

#### 1. **Debug File Uses Custom Classes**
**File**: `debug/overflow-button.html`
**Issue**: Uses `.overflow-trigger-icon` and `.overflow-dot` instead of standard `.sheet-actions-icon` and `.sheet-actions-dot`
**Impact**: Doesn't demonstrate actual production markup
**Fix**: Update to use canonical classes

#### 2. **Class Naming Confusion**
- Icon wrapper: `sheet-actions-icon` (not `overflow-icon`)
- Dots: `sheet-actions-dot` (not `overflow-dot`)
- This creates confusion since the trigger is `overflow-trigger` but children use `sheet-actions-*`

#### 3. **Portrait History Button Has Extra Class**
**File**: `portraits-ui.js` line 507
**Classes**: `terminal-btn-small selector-trigger overflow-trigger portrait-history-overflow-btn`
**Issue**: The extra `portrait-history-overflow-btn` is only used for yellow theme styling
**Status**: Acceptable - contextual theming is valid

## Centralized Configuration

### CSS Variables for Overflow Button
**Defined in**: `terminal-theme.css`

```css
/* Timing/Animation (lines 420-425) */
--overflow-transition-duration: 180ms;
--overflow-transition-easing: cubic-bezier(0.2, 0.8, 0.2, 1.05);
--overflow-opacity-duration: 120ms;
--overflow-border-radius-duration: 160ms;

/* Dimensions */
--overflow-button-width: auto; /* inherits from terminal-btn-small */
--overflow-button-height: 24px; /* terminal-btn-small height */
--overflow-icon-size: 14px;
--overflow-dot-size: 3px;
--overflow-dot-spacing: 1px; /* top/bottom offset from icon edges */
```

### Current Hardcoded Values (Should Be Variables)
- Icon container: `width: 14px; height: 14px;` (line 405-406)
- Dot size: `width: 3px; height: 3px;` (line 416-417)
- Top/bottom positions: `top: 1px;` and `bottom: 1px;` (lines 429, 438)
- Horizontal padding: `padding-left: 10px; padding-right: 10px;` (line 394-395)

## Architecture Decisions

### ✅ Good Decisions
1. **Single toggle function** (`CharacterSheet.toggleSelectorMenu`) handles all instances
2. **Theme-aware styling** using CSS custom properties (`--ui-border-color`, etc.)
3. **Accessibility** attributes (`aria-haspopup`, `aria-expanded`, `role="menu"`)
4. **Viewport-aware positioning** prevents menu clipping
5. **Detached menu support** for modals with overflow constraints

### 🔄 Recommendations

#### 1. **Standardize Class Names**
**Current**: 
- `.sheet-actions-icon` / `.sheet-actions-dot` (for overflow buttons)
- `.overflow-trigger` (for the button itself)

**Proposed**:
- Option A: Rename all to `overflow-*` namespace for consistency
- Option B: Keep current (least breaking change) but document clearly
- **Decision**: Keep current for backwards compatibility

#### 2. **Extract CSS Variables**
Create centralized variables for all hardcoded dimensions and timings to enable easier customization.

#### 3. **Create HTML Helper Function**
Add `CharacterSheet.renderOverflowButton(options)` to generate consistent markup:

```javascript
renderOverflowButton({
  actions: [
    { icon: '✎', label: 'Edit', onclick: '...' },
    { icon: '×', label: 'Delete', onclick: '...' }
  ],
  ariaLabel: 'More actions',
  additionalClasses: []
})
```

#### 4. **Update Debug File**
Make `debug/overflow-button.html` use the exact production markup pattern for accurate testing.

## Implementation Checklist

- [x] CSS styles centralized in `terminal-theme.css`
- [x] Toggle logic centralized in `shared-character-sheet.js`
- [x] Consistent markup in production code (sheet header, portrait history)
- [ ] Debug file uses canonical markup
- [ ] CSS dimensions extracted to variables
- [ ] HTML helper function created
- [ ] Documentation completed (this file)
- [ ] Style guide updated with overflow button patterns

## Testing

### Manual Test Cases
1. **Sheet Header**: Open character sheet → click overflow → verify menu opens below
2. **Portrait History**: Open portrait history modal → click overflow on card → verify menu appears to the side
3. **Multiple Menus**: Open one menu → open another → verify first closes
4. **Click Outside**: Open menu → click elsewhere → verify menu closes
5. **Keyboard**: Open menu → press Escape → verify menu closes
6. **Viewport Edges**: Position trigger near screen edge → verify menu repositions to stay visible

### Automated Tests
- None currently (visual component, manual testing required)

## Migration Guide

### For New Features
Use the canonical markup pattern from this document. Always use:
- `overflow-trigger` (not `sheet-actions-trigger`)
- Call `CharacterSheet.toggleSelectorMenu(this)` onclick
- Include full accessibility attributes

### For Existing Code
- Keep using current classes (backwards compatible)
- New code should prefer `overflow-trigger` over `sheet-actions-trigger`
- No breaking changes planned

## Related Files
- `terminal-theme.css` - Core styles (lines 376-473, 818-959)
- `shared-character-sheet.js` - Toggle logic (lines 442-655)
- `portraits.css` - Portrait-specific theming (lines 341-402)
- `portraits-ui.js` - Portrait history usage (lines 505-523)
- `debug/overflow-button.html` - Test/demo page

## Maintenance Notes
- Overflow button animation is tightly coupled with `.selector-menu` animation
- Changes to button dimensions require updating menu positioning logic
- Theme colors are inherited from context (sheet = teal, modal = yellow, default = green)

