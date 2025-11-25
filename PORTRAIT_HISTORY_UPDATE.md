# Portrait History - Builder/Manager Parity Update

## Issue
The portrait history modal in the character builder had an outdated, simple list-based implementation that didn't match the polished, card-based grid layout in the character manager.

## Changes Made

Updated the builder's portrait history implementation to match the manager's correct version:

### 1. Card-Based Grid Layout
**Before:** Simple vertical list of portrait items
**After:** Card-based grid layout matching the character manager's style
- Uses `.character-card` and `.portrait-history-card` classes
- Grid layout with `.portrait-history-card-row`
- Special handling for single item with `.is-single` class

### 2. Thumbnail Cropping
**Before:** Full ASCII portraits displayed (too large for thumbnails)
**After:** Cropped ASCII thumbnails
- Added `cropAsciiForThumbnail()` method
- Crops to 80 lines × 160 characters
- Crops from bottom (keeps faces/heads visible)
- Matches manager's thumbnail framing

### 3. ASCII/Original Image Toggle
**Before:** No toggle - only showed ASCII or nothing
**After:** Toggle button for each portrait version with image URL
- "View Original" button switches to original image
- "View ASCII" button switches back to ASCII art
- Added `togglePortraitHistoryView()` method
- Smooth toggle with `.is-hidden` class

### 4. Keyboard Navigation
**Before:** Only ESC key to close
**After:** Full keyboard navigation
- Arrow keys (Left/Right/Up/Down) to navigate between cards
- Enter to confirm selection
- ESC to cancel and close
- Focus indicator with `.is-keyboard-focused` class
- Added methods:
  - `getPortraitHistoryCards()`
  - `updatePortraitHistoryFocus()`
  - `movePortraitHistoryFocus(delta)`
  - `selectPortraitHistoryCard(versionId)`

### 5. Selection Confirmation
**Before:** Immediate action on clicking "USE THIS" button
**After:** Two-step selection process
- Click or arrow keys to select a card
- "USE SELECTED" button to confirm choice
- "CANCEL" button to close without changes
- Added `confirmPortraitHistorySelection()` method
- Better user experience - can preview before committing

### 6. Visual Feedback
**Before:** Simple `.is-active` class on active version
**After:** Multiple visual states
- `.is-selected` - Currently selected card
- `.is-keyboard-focused` - Keyboard focus indicator
- Active version still marked for reference
- Cards respond to hover and click states

## Updated Methods

### Modified
- `openPortraitHistory()` - Complete rewrite with card-based layout
- `closePortraitHistory()` - Added keyboard handler cleanup
- `usePortraitVersion()` - Unchanged (still works with new UI)

### Added
- `getPortraitHistoryCards()` - Get all portrait cards
- `updatePortraitHistoryFocus()` - Update focus visual state
- `movePortraitHistoryFocus(delta)` - Move focus by delta
- `selectPortraitHistoryCard(versionId)` - Select card by version ID
- `togglePortraitHistoryView(versionId)` - Toggle ASCII/original view
- `cropAsciiForThumbnail(asciiArt, heightLines, widthChars)` - Crop ASCII for thumbnails
- `confirmPortraitHistorySelection()` - Confirm the selected portrait

### Unchanged
- `deletePortraitVersion()` - Still works with new UI

## UI/UX Improvements

1. **Better Visual Hierarchy** - Card layout makes it easier to compare portraits
2. **Thumbnail Optimization** - Cropped ASCII portraits fit better in cards
3. **Image Preview** - Can toggle between ASCII and original without leaving modal
4. **Keyboard-First** - Full keyboard navigation for power users
5. **Safer Selection** - Two-step process prevents accidental changes
6. **Better Feedback** - Clear visual indicators for selection and focus states

## CSS Classes Used

From character manager styles:
- `.portrait-history-card` - Individual portrait card
- `.portrait-history-card-row` - Card container (grid layout)
- `.portrait-history-preview` - ASCII portrait thumbnail
- `.portrait-history-image` - Original image thumbnail
- `.portrait-history-actions` - Action button container
- `.portrait-history-delete-btn` - Delete button
- `.card-thumbnail` - Thumbnail container
- `.card-details` - Card info container
- `.card-name` - Card title
- `.card-info` - Card subtitle
- `.is-selected` - Selected state
- `.is-keyboard-focused` - Keyboard focus state
- `.is-hidden` - Hidden element
- `.is-single` - Single card special layout

## Testing

To verify the update works correctly:

1. **Open Portrait History**
   - Create a character with at least 2 custom AI portraits
   - Click "⧖ Portrait History" button
   - Modal should show cards in a grid layout

2. **Test Keyboard Navigation**
   - Use Arrow keys to move between portraits
   - Selected card should highlight with focus indicator
   - Press Enter to select a portrait
   - Press ESC to cancel and close

3. **Test Image Toggle** (if portraits have original images)
   - Click "View Original" button on a card
   - Should switch from ASCII to original image
   - Button text should change to "View ASCII"
   - Click again to toggle back

4. **Test Selection**
   - Select a portrait with arrow keys or click
   - Click "USE SELECTED" button
   - Modal should close and character portrait should update
   - Character sheet should show the selected portrait

5. **Test Delete**
   - Click "Del" button on a portrait
   - Confirmation dialog should appear
   - Click "YES" to confirm deletion
   - Portrait should be removed from history

## Compatibility

The builder now matches the manager's implementation exactly, ensuring:
- Consistent user experience across both apps
- Same keyboard shortcuts and navigation patterns
- Same visual style and feedback
- Same thumbnail cropping and display logic

## Files Modified

- `character-builder/character-builder-app.js` - Portrait history implementation

## Date
November 22, 2025

