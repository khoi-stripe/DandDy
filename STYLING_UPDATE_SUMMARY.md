# ASCII Portrait Styling Update

## What Changed

Updated the Character Manager to use **identical styling** to the Character Builder for ASCII portraits.

## Key Style Changes

### Before (Old Styling)
```css
.ascii-portrait {
    text-align: center;
    overflow-x: auto;
}

.ascii-portrait pre {
    font-size: 3px;
    line-height: 1;
    color: var(--terminal-fg);
    /* ... nested pre tag with background/border ... */
}
```

### After (Builder-Matching Styling)
```css
.portrait-container {
    position: relative;
    margin: var(--spacing-md) 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
}

.ascii-portrait {
    font-size: 6px;              /* Was 3px */
    line-height: 1.2;            /* Was 1 */
    color: var(--terminal-accent); /* Was var(--terminal-fg) */
    text-align: center;
    white-space: pre;            /* Direct text, not nested pre tag */
    font-family: monospace;
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    max-width: 100%;
}
```

## Visual Differences

| Aspect | Old Style | New Style (Builder Match) |
|--------|-----------|---------------------------|
| **Font Size** | 3px | 6px (2x larger) |
| **Line Height** | 1.0 | 1.2 (slightly more spacing) |
| **Color** | Terminal foreground (white/green) | Terminal accent (cyan) |
| **Container** | Simple div | Flexbox container with actions |
| **Text Rendering** | Nested `<pre>` tag | Direct `textContent` with `white-space: pre` |
| **Background** | Dark with border on pre | Clean, no extra background |

## Layout Changes

### HTML Structure

**Before:**
```html
<div class="sheet-section">
    <div class="sheet-header">
        <div class="sheet-header-title">[ PORTRAIT ]</div>
        <a>View Original</a>
    </div>
    <div class="ascii-portrait">
        <pre>...ASCII art...</pre>
    </div>
</div>
```

**After:**
```html
<div class="portrait-container">
    <div class="ascii-portrait" id="character-portrait-{id}"></div>
    <div class="portrait-actions">
        <a>👁 View Original Art</a>
    </div>
</div>
```

### JavaScript Rendering

**Before:**
- ASCII art embedded directly in HTML string (requires escaping)

**After:**
- Empty div rendered, then populated with `textContent` (no escaping issues)
```javascript
portraitEl.textContent = asciiPortrait;
```

## Responsive Behavior

Both desktop and mobile now match the builder:

- **Desktop:** 6px font size
- **Mobile (< 768px):** 4px font size

## Result

ASCII portraits now display **identically** in both the Character Builder and Character Manager:
- ✅ Same font size and line height
- ✅ Same cyan accent color
- ✅ Same layout and spacing
- ✅ Same responsive scaling
- ✅ Same visual appearance

## Files Modified

1. `character-manager.css` - Updated `.ascii-portrait` styling and added `.portrait-container`
2. `character-manager.js` - Changed rendering to use `textContent` instead of `<pre>` tag
3. `test-ascii-import.html` - Updated to match new styling
4. Documentation files - Updated with correct specifications





