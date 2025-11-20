# Testing Guide - Shared Character Sheet Component

## Testing URLs

The following URLs are available for testing (HTTP server running on port 8080):

### Test Page
- **URL**: http://localhost:8080/test-shared-sheet.html
- **Purpose**: Side-by-side comparison of Builder vs Manager contexts
- **Features**:
  - Component loading verification
  - Visual comparison of both rendering contexts
  - Mock button functions for testing interactions

### Character Builder
- **URL**: http://localhost:8080/character-builder/index.html
- **Purpose**: Test the builder with the shared component
- **Test Cases**:
  1. Start new character creation
  2. Complete the questionnaire
  3. Verify character sheet renders correctly
  4. Test portrait generation
  5. Test rename functionality
  6. Test level change functionality
  7. Test print functionality
  8. Test toggle between ASCII and original art

### Character Manager
- **URL**: http://localhost:8080/character-manager.html
- **Purpose**: Test the manager with the shared component
- **Test Cases**:
  1. View existing characters in grid
  2. Click on a character card
  3. Verify character sheet renders correctly
  4. Test Edit button
  5. Test Copy button
  6. Test Export button
  7. Test Delete button
  8. Import a character from JSON
  9. Verify combat stats grid displays
  10. Verify saving throws display
  11. Verify ability scores grid displays

## Expected Behavior

### Character Builder Context

**Should Display:**
- ✓ Character name or "[ CHARACTER SHEET ]"
- ✓ Print button in header
- ✓ Portrait section (if race selected)
  - ASCII portrait
  - "Custom AI Portrait" button with remaining count
  - "Rename" button (if character has a name)
  - "View Original Art" toggle (if portrait has original URL)
- ✓ Basic info (race, class, background, alignment, level)
- ✓ Level CHANGE button
- ✓ Abilities (STR, DEX, CON, INT, WIS, CHA) in list format
- ✓ HP in abilities section
- ✓ Racial traits
- ✓ Class equipment
- ✓ Skill proficiencies
- ✓ Tool proficiencies
- ✓ Starting equipment
- ✓ Languages or language choices
- ✓ Background feature
- ✓ Backstory

**Should NOT Display:**
- ✗ Combat stats grid
- ✗ Ability scores grid
- ✗ Saving throws section
- ✗ Edit/Copy/Export/Delete buttons
- ✗ Export info section

### Character Manager Context

**Should Display:**
- ✓ Character name or "Unnamed Character"
- ✓ Edit, Copy, Export, Delete buttons in header
- ✓ Portrait section (if available)
  - ASCII portrait
  - Link to view original art (if available)
- ✓ Basic info (race, class, background, alignment, level)
- ✓ Combat stats grid (HP, AC, Initiative, Speed, Prof Bonus, Hit Die)
- ✓ Ability scores grid with modifiers
- ✓ Saving throws (if available)
- ✓ Skills with modifiers
- ✓ Racial traits
- ✓ Equipment (combined class and starting)
- ✓ Tool proficiencies
- ✓ Languages
- ✓ Background description (if available)
- ✓ Background feature
- ✓ Backstory
- ✓ Export info (if imported character)

**Should NOT Display:**
- ✗ Print button
- ✗ Custom AI Portrait button
- ✗ Rename button
- ✗ Level CHANGE button
- ✗ Abilities in list format

## Browser Console Tests

Open the browser console (F12) and run these commands to verify the component:

```javascript
// 1. Check if component is loaded
console.log('Component loaded:', typeof CharacterSheet !== 'undefined');

// 2. Check render function exists
console.log('Render function:', typeof CharacterSheet.render === 'function');

// 3. Check helper functions
console.log('Format modifier:', CharacterSheet.formatModifier(3)); // Should show "+3"
console.log('Format skill:', CharacterSheet.formatSkillName('animal-handling')); // Should show "Animal Handling"

// 4. Test with sample character
const testChar = {
    name: 'Test Hero',
    race: 'human',
    class: 'wizard',
    level: 1,
    abilities: { str: 10, dex: 14, con: 12, int: 16, wis: 13, cha: 8 }
};

const builderHTML = CharacterSheet.render(testChar, { context: 'builder' });
console.log('Builder HTML length:', builderHTML.length);

const managerHTML = CharacterSheet.render(testChar, { context: 'manager' });
console.log('Manager HTML length:', managerHTML.length);
```

## Common Issues and Solutions

### Issue: Portrait not displaying
**Solution**: Make sure `CharacterSheet.populatePortrait(character, context)` is called after inserting HTML into DOM

### Issue: Buttons not working
**Solution**: Verify the callback functions are defined in the global scope (e.g., `window.App`, `editCharacter()`, etc.)

### Issue: Combat stats showing in builder or missing in manager
**Solution**: Check that the correct `context` parameter is being passed ('builder' or 'manager')

### Issue: Character data not showing
**Solution**: Verify character object has the expected properties. The component handles both old and new formats.

## Visual Verification

Compare the rendered sheets with these checkpoints:

1. **Header**: Should show appropriate buttons for each context
2. **Portrait**: Should have the correct ID and display ASCII art
3. **Basic Info**: Should show all available character properties
4. **Sections**: Should appear/disappear based on context and data availability
5. **Styling**: Should use terminal theme classes consistently
6. **Layout**: Builder uses list format, Manager uses grid format for abilities/combat

## Regression Testing

After making changes to the shared component, test:

1. [ ] Both apps load without errors
2. [ ] Character sheets display correctly in both apps
3. [ ] All buttons trigger their respective functions
4. [ ] Portraits display correctly
5. [ ] Data from imported characters shows correctly
6. [ ] New characters in builder display correctly
7. [ ] Character switching in manager works
8. [ ] Print functionality works in builder
9. [ ] Export functionality works in manager
10. [ ] No console errors in browser

## Performance Testing

- [ ] Page load time is acceptable
- [ ] Character sheet renders quickly (< 100ms)
- [ ] No memory leaks when switching characters
- [ ] Portrait animation performs smoothly in builder

## Compatibility Testing

Test in multiple browsers:
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Edge

Test on different screen sizes:
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)



