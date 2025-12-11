# Minification Spacing Fixes

## Issue
The minification process was removing spaces in template literals, causing text to run together. This happened primarily in narrator messages, spell summaries, and share toasts.

## Root Cause
When using template literals with newlines like:
```javascript
`> Line 1
> Line 2`
```

The minifier would collapse this to:
```javascript
`>Line 1>Line 2`
```

Removing both the newlines AND the spaces after the `>` character.

## Solution
Use explicit `\n` for newlines and double spaces after `>` to preserve at least one space:
```javascript
`>  Line 1\n>  Line 2`  // Minifies to: `> Line 1\n> Line 2`
```

For spaces within variable interpolations, use `${' '}`:
```javascript
`${name}${' '}shared with ${email}`  // Ensures space is preserved
```

## Files Fixed

### 1. character-builder/character-builder-app.js
- **Lines 1523-1526**: Spell selection summary (quick mode)
  - Fixed: "Selected 3 cantripsand 61st level spellsfor your Wizard"
  - Now: "Selected 3 cantrips and 6 1st level spells for your Wizard"
  
- **Lines 1554-1564**: Spell selection summary (guided mode)
  - Fixed narrator flavor text and spell lists
  - Ensured proper spacing after `>` and between list items

### 2. character-builder/character-builder-narrators.js
All 7 narrator intro texts (lines 15-209):
- **Deadpan Observer**: Fixed spacing in intro text
- **Hype Bard**: Fixed spacing in intro text  
- **Cryptic Seer**: Fixed spacing in intro text
- **Grumpy Veteran**: Fixed spacing in intro text
- **Chaotic Imp**: Fixed spacing in intro text
- **Scholarly Sage**: Fixed spacing in intro text
- **The Dude**: Fixed spacing in intro text

Each fixed from:
```
> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
```

To:
```
>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...
```

### 3. character-builder/character-builder-questions.js
- **Lines 8-15**: Intro question text
- **Lines 304-310**: Spell style intro text
  - Fixed: "Ah,right.You're a spellcaster.>>*sighs*"
  - Now: "Ah, right. You're a spellcaster.\n>  \n>  *sighs*"

### 4. portraits-ui.js
- **Line 151**: Portrait history modal text
  - Fixed: "character.Choose one to make it active,or delete"
  - Now: "character. Choose one to make it active, or delete"
  - Used `${' '}` after period and comma

- **Line 867**: Delete confirmation text
  - Fixed: "version?This cannot be undone"
  - Now: "version? This cannot be undone"
  - Used `${' '}` after question mark

### 5. character-builder/character-builder-app.js
- **Line 2617**: Portrait history modal text (same as portraits-ui.js)
- **Line 3128**: Delete confirmation text (same as portraits-ui.js)
- **Line 4574**: Level change modal text
  - Fixed: "undone.Choose a new level"
  - Now: "undone. Choose a new level"
  - Used `${' '}` after period
- **Lines 1617-1621**: Completion buttons
  - Fixed: ">>SAVE CHARACTER" and ">>CREATE ANOTHER CHARACTER"
  - Now: "> SAVE CHARACTER" and "> CREATE ANOTHER CHARACTER"
  - Used `>${' '}` to preserve space

### 6. character-builder/character-builder-questions.js
- **Line 8**: Intro question text
  - Fixed: "Ah.Another soul" and "adventure.Or at least,trying"
  - Now: "Ah. Another soul" and "adventure. Or at least, trying"
  - Used `${' '}` after periods and commas
  
- **Line 304**: Spell style intro text
  - Fixed: "Ah,right.You're" and "abilities.Because"
  - Now: "Ah, right. You're" and "abilities. Because"
  - Used `${' '}` after comma and period

### 7. character-manager.js
- **Line 2133**: Share character toast notification
  - Fixed: "Elara Moonshadowshared with friend@example.com"
  - Now: "Elara Moonshadow shared with friend@example.com"
  - Used `${safeName}${' '}shared` pattern to preserve space

- **Line 2067**: Share modal description text
  - Fixed: "If they have a DandDy account,they'll see"
  - Now: "If they have a DandDy account, they'll see"
  - Added `${' '}` after comma

- **Line 4423**: Session expired modal text
  - Fixed: "expired.Your local changes are safe,but you'll"
  - Now: "expired. Your local changes are safe, but you'll"
  - Added `${' '}` after period and comma

## Testing
After rebuilding bundles with `scripts/build-bundles.sh`, verify:

1. ✅ Narrator intro messages display with proper spacing
2. ✅ Spell selection summaries read correctly
3. ✅ Share character toast shows: "[Name] shared with [email]"
4. ✅ Share modal text flows naturally with spaces after commas

## Prevention
When writing new template literal strings:
1. Use `\n` explicitly instead of actual newlines
2. Use double spaces after formatting characters like `>`
3. Use `${' '}` to force spaces near variable interpolations
4. Test minified output in bundles after changes

## Scanning for Issues

I've created a script to efficiently scan for minification spacing issues:

```bash
bash scripts/scan-minification-issues.sh
```

This script looks for:
1. **Period + Capital letter** - Missing space after sentence (e.g., "expired.Your")
2. **Comma + lowercase** - Missing space after comma (e.g., "safe,but")
3. **Double arrows >>** - Missing newlines in narrator text
4. **Known problem phrases** - Specific patterns we've found before

The script filters out code patterns (like `.Portrait`, `.Character`) and focuses on user-facing text in:
- `text:` properties
- `message:` / `notification` calls
- `toast` messages
- `modal` content
- `narrator` / `introText` / `completeText`

### Example Output:
```
📄 Checking: builder.bundle.js
----------------------------------------
  Pattern 1: Missing space after period...
    ⚠ Line 5039: text: `>Ah,right.You're a spellcaster.
  Pattern 4: Known problem phrases...
    ✗ Line 6616: cantripsand 61st level spellsfor
```

## Bundle Rebuild
After any source file changes, always rebuild:
```bash
cd scripts && bash build-bundles.sh
```

Or use the file watcher with `./start-dev.sh`

## Workflow
1. Edit source files
2. Rebuild bundles: `cd scripts && bash build-bundles.sh`
3. Scan for issues: `bash scripts/scan-minification-issues.sh`
4. Fix any new issues found
5. Rebuild again
6. Test in browser

