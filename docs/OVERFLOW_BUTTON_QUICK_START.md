# Overflow Button - Quick Start Guide

> **TL;DR**: Copy-paste templates for adding overflow buttons to your UI

---

## 📦 Option 1: Use the Helper (Recommended)

### Step 1: Include the script
```html
<script src="../overflow-button-helpers.js"></script>
<script src="../shared-character-sheet.js"></script>
```

### Step 2: Generate the button
```javascript
const html = OverflowButton.render({
  actions: [
    { icon: '✎', label: 'Edit', onclick: 'handleEdit()' },
    { icon: '📋', label: 'Duplicate', onclick: 'handleDuplicate()' },
    { icon: '×', label: 'Delete', onclick: 'handleDelete()' }
  ],
  ariaLabel: 'Item actions'
});

// Insert into your HTML
element.innerHTML = html;
```

---

## 📝 Option 2: Manual HTML

### Copy-Paste Template
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
    <button class="selector-option" type="button" role="menuitem" onclick="handleEdit()">
      <span class="selector-option-icon">✎</span>
      <span class="selector-option-label">Edit</span>
    </button>
    <button class="selector-option" type="button" role="menuitem" onclick="handleDelete()">
      <span class="selector-option-icon">×</span>
      <span class="selector-option-label">Delete</span>
    </button>
  </div>
</div>
```

---

## 🎨 Customization

### Change Button Size (CSS)
```css
.my-custom-overflow.overflow-trigger {
  width: 32px;
  height: 32px;
}
```

### Change Animation Speed (CSS)
```css
:root {
  --overflow-animation-duration: 250ms; /* slower */
  --overflow-icon-size: 16px; /* larger */
}
```

### Add Custom Classes (JS)
```javascript
OverflowButton.render({
  actions: [...],
  additionalButtonClasses: ['my-custom-overflow'],
  additionalMenuClasses: ['my-custom-menu']
});
```

---

## 🎯 Context-Specific Theming

### Yellow Theme (Modal)
```html
<div class="selector-shell">
  <button class="terminal-btn-small selector-trigger overflow-trigger modal-overflow-btn">
    <!-- ... -->
  </button>
</div>
```

```css
.modal-overflow-btn {
  border-color: var(--modal-accent);
  color: var(--modal-accent);
}
```

### Teal Theme (Character Sheet)
Colors are automatically inherited when inside `.character-sheet` container.

---

## 🔍 Common Icons

| Icon | Code | Use Case |
|------|------|----------|
| ✎ | `✎` | Edit |
| 📋 | `📋` | Duplicate/Copy |
| ⎙ | `⎙` | Print |
| ⬆ | `⬆` | Level up / Upgrade |
| ◉ | `◉` | View / Toggle |
| ★ | `★` | Favorite / Portrait |
| × | `×` | Delete / Close |
| ≡ | `≡` | Menu / Options |
| 📤 | `📤` | Export |
| 📥 | `📥` | Import |

---

## ✅ Checklist

Before deploying your overflow button:

- [ ] Includes all 3 dots (`dot-1`, `dot-2`, `dot-3`)
- [ ] Uses `onclick="CharacterSheet.toggleSelectorMenu(this)"`
- [ ] Has `aria-haspopup="menu"` and `aria-expanded="false"`
- [ ] Each option has `role="menuitem"`
- [ ] Uses standard class names (not custom variants)
- [ ] Tested at viewport edges
- [ ] Tested with Escape key
- [ ] Tested with outside click

---

## 🐛 Troubleshooting

### Button doesn't animate
- ✅ Check you're using `.sheet-actions-dot` not `.overflow-dot`
- ✅ Ensure `terminal-theme.css` is included

### Menu doesn't open
- ✅ Check `shared-character-sheet.js` is included
- ✅ Verify onclick calls `CharacterSheet.toggleSelectorMenu(this)`
- ✅ Check console for JavaScript errors

### Menu gets clipped in modals
- ✅ Menus in modals are automatically detached to `<body>` - this should work
- ✅ Do NOT add `overflow: visible` to modals (breaks scrolling)
- ✅ Check z-index: add `.your-modal .selector-menu { z-index: 999; }`
- ✅ If still clipping, check if modal uses CSS `transform` (menus handle this)

### Wrong colors
- ✅ Check parent context (sheet, modal, or default)
- ✅ Verify CSS custom properties are defined

---

## 📚 Full Documentation

- **Complete Guide**: `docs/OVERFLOW_BUTTON_SYSTEM.md`
- **Audit Results**: `OVERFLOW_BUTTON_AUDIT_RESULTS.md`
- **Test Page**: `debug/overflow-button.html`
- **Helper API**: `overflow-button-helpers.js`

