# How to Clear Storage and Test Spells

## Method 1: Clear with Verification (Recommended)

Run these commands in the browser console (F12):

```javascript
// See what's stored BEFORE clearing
console.log('Before:', localStorage.getItem('dnd_characters'));

// Clear the storage
localStorage.clear();

// Verify it's cleared
console.log('After:', localStorage.getItem('dnd_characters'));
// Should show: After: null

// Confirm it worked
console.log('✓ Storage cleared successfully!');
```

**Expected output:**
```
Before: [{"id":"local_...","name":"..."}]
After: null
✓ Storage cleared successfully!
```

## Method 2: Clear Just Character Data (Safer)

If you want to keep your settings (narrator choice, etc):

```javascript
// Remove just character data
localStorage.removeItem('dnd_characters');
localStorage.removeItem('dnd_characters_cache');

// Verify
console.log('Characters:', localStorage.getItem('dnd_characters')); // Should be null
console.log('✓ Character data cleared!');
```

## Method 3: Use Browser DevTools (Visual Method)

1. Open DevTools (F12)
2. Go to **Application** tab (or **Storage** in Firefox)
3. In the left sidebar, expand **Local Storage**
4. Click on your site URL (e.g., `file://` or `localhost`)
5. Find `dnd_characters` in the list
6. Right-click → **Delete**
7. Refresh the page

## Method 4: Use the Character Manager UI

Some browsers have a built-in way:
1. Look for a "Clear Data" or "Settings" button in the character manager
2. Or use browser settings: Settings → Privacy → Clear browsing data → Cached images and files

## After Clearing Storage

1. **Close and reopen** the browser tab (or hard refresh: Ctrl+Shift+R / Cmd+Shift+R)
2. Go to the character builder
3. Create a **brand new** Wizard
4. You should see spells in the builder's character sheet
5. Click **"SAVE CHARACTER"**
6. Exit to manager
7. Spells should now appear!

## Quick Test Script

Run this to test if spells are working after creating a new character:

```javascript
// After creating and saving a new spellcaster
async function testSpells() {
  console.log('=== SPELL TEST ===');
  
  // Get characters from storage
  const data = localStorage.getItem('dnd_characters');
  if (!data) {
    console.log('❌ No characters found. Create one first!');
    return;
  }
  
  const characters = JSON.parse(data);
  console.log('📚 Found', characters.length, 'character(s)');
  
  // Check each character for spell data
  characters.forEach(char => {
    console.log('\n---', char.name, '---');
    console.log('Class:', char.class);
    console.log('Cantrips:', char.cantrips?.length || 0);
    console.log('Spells Known:', char.spellsKnown?.length || 0);
    console.log('Spells Prepared:', char.spellsPrepared?.length || 0);
    
    if (char.cantrips?.length > 0) {
      console.log('✓ Cantrips:', char.cantrips.map(s => s.name).join(', '));
    }
    if (char.spellsKnown?.length > 0) {
      console.log('✓ Spells:', char.spellsKnown.map(s => s.name).join(', '));
    }
    
    // Overall check
    const hasSpells = (char.cantrips?.length || 0) + (char.spellsKnown?.length || 0) + (char.spellsPrepared?.length || 0) > 0;
    if (hasSpells) {
      console.log('✅ SPELLS WORKING!');
    } else {
      console.log('❌ No spell data found');
    }
  });
}

testSpells();
```

## Troubleshooting

### "undefined" is Normal
When you run `localStorage.clear()`, it returns `undefined` because the function doesn't return a value. That's expected! The storage is still cleared.

### Still Not Seeing Spells?
1. Make sure you **refreshed the page** after clearing
2. Make sure you created a **NEW** character (not viewing an old one)
3. Make sure the character is a **spellcasting class**:
   - Wizard, Sorcerer, Warlock, Bard, Cleric, Druid ✓
   - Fighter, Barbarian, Rogue, Monk, Ranger ✗ (no spells at level 1)

### Characters Still Show in Manager?
If you see old characters after clearing localStorage, they might be:
- Cached in memory (refresh the page)
- Stored in cloud (if you're logged in)
- In a different storage key

Run this to check:
```javascript
console.log('All localStorage keys:', Object.keys(localStorage));
```

Look for any keys containing "character" or "dnd" and clear those too.

## Summary

**The `undefined` return value is normal!** It just means the function completed. What matters is the storage got cleared. After clearing:

1. ✓ Refresh page
2. ✓ Create NEW character  
3. ✓ Check for spells in builder
4. ✓ Save character
5. ✓ View in manager
6. ✓ Spells should appear!

