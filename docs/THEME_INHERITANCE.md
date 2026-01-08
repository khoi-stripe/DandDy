# Theme Inheritance Pattern

> **Status**: Phase 1 Complete (Campaign Area)  
> **Last Updated**: December 2024

This document explains the cascading theme inheritance system used in DandDy, where themes applied to parent containers automatically cascade to all children.

## Overview

The theme system uses CSS custom properties (`--ui-*` tokens) that cascade naturally through the DOM. By applying a theme class to a parent container, all child elements automatically inherit the theme colors.

## Core Principle

**Apply theme to parent → all children inherit automatically**

```html
<!-- Apply theme to parent container -->
<div class="campaign-panel-slot ui-theme-white theme-white">
  <!-- All children automatically inherit white theme -->
  <div class="campaign-area">
    <!-- Uses --ui-fg-color, --ui-border-color, etc. -->
  </div>
</div>
```

## Theme Tokens

### UI Theme Tokens (`--ui-*`)

These are the primary tokens that components should use:

- `--ui-border-color` - Border colors
- `--ui-fg-color` - Foreground/text colors  
- `--ui-dim-color` - Dimmed/secondary text
- `--ui-primary-bg-color` - Primary background
- `--ui-on-primary-color` - Text on primary background

### Context Tokens (`--context-*`)

Used for hover states and accents:

- `--context-accent` - Primary accent color
- `--context-accent-dim` - Dimmed accent color
- `--context-border` - Border color
- `--context-hover` - Hover state background

## Theme Classes

### UI Theme Classes

Apply to containers to set the color scheme:

- `.ui-theme-green` - Green terminal theme (default)
- `.ui-theme-teal` - Teal character sheet theme
- `.ui-theme-pink` - Pink campaign theme
- `.ui-theme-white` - White theme (light text on dark background)

### Context Theme Classes

Apply alongside UI theme classes for hover states:

- `.theme-green` - Green terminal
- `.theme-yellow` - Yellow modals
- `.theme-teal` - Teal character sheets
- `.theme-cyan` - Cyan accents
- `.theme-pink` - Pink campaigns
- `.theme-white` - White theme

## Usage Pattern

### ✅ Correct: Parent-Level Theme Application

```javascript
// Apply theme to parent container
const panel = document.querySelector('.campaign-panel-slot');
panel.classList.add('ui-theme-white', 'theme-white');

// All children automatically inherit
panel.innerHTML = `
  <div class="campaign-area">
    <!-- Uses --ui-fg-color, --ui-border-color automatically -->
  </div>
`;
```

```css
/* Components use --ui-* tokens - no hardcoded colors */
.campaign-area {
    border: 1px solid var(--ui-border-color);
    color: var(--ui-fg-color);
}

.campaign-area-title {
    color: var(--ui-fg-color);
}
```

### ❌ Incorrect: Component-Level Overrides

```css
/* DON'T hardcode theme colors in components */
.campaign-area {
    border: 1px solid var(--white-border); /* ❌ Hardcoded */
    color: var(--white-fg); /* ❌ Hardcoded */
}
```

```javascript
// DON'T apply theme classes to child elements
<div class="campaign-area ui-theme-white"> <!-- ❌ Wrong level -->
```

## Implementation Example: Campaign Area

### Before (Hardcoded Overrides)

```css
.panel-campaign {
    /* Hardcoded teal theme - breaks inheritance */
    --ui-border-color: var(--sheet-accent);
    --ui-fg-color: var(--sheet-accent);
    color: var(--sheet-accent);
}

.campaign-area {
    /* Hardcoded white colors - doesn't inherit */
    border: 1px solid var(--white-border);
    color: var(--white-fg);
}
```

### After (Inheritance-Based)

```css
.panel-campaign {
    /* Inherits theme from parent - no hardcoded colors */
    border-left-color: var(--ui-border-color);
    color: var(--ui-fg-color);
}

.campaign-area {
    /* Uses inherited --ui-* tokens */
    border: 1px solid var(--ui-border-color);
    color: var(--ui-fg-color);
}
```

```javascript
// Apply theme to parent
const panel = document.querySelector('.campaign-panel-slot');
panel.classList.add('ui-theme-white', 'theme-white');

// All children inherit automatically
```

## When Overrides Are Acceptable

Overrides should be **rare and documented**. Acceptable cases:

1. **Error/Danger states** - Always red, regardless of theme
2. **Legacy compatibility** - Temporary during migration
3. **Specific design requirements** - Documented exceptions

Example of acceptable override:

```css
/* Exception: Error states always use red */
.campaign-error {
    color: var(--terminal-error); /* ✅ Always red */
    border-color: var(--terminal-error);
}
```

## Benefits

1. **Single source of truth** - Change theme in one place
2. **Predictable cascading** - Themes flow naturally through DOM
3. **Easy theme switching** - Change parent class, everything updates
4. **Reduced maintenance** - No scattered overrides to track
5. **Consistent theming** - All components use same token system

## Migration Checklist

When migrating a component to use theme inheritance:

- [ ] Remove hardcoded color overrides from component CSS
- [ ] Replace direct color references with `--ui-*` tokens
- [ ] Move theme class application to parent container
- [ ] Remove theme classes from child elements
- [ ] Test theme switching works correctly
- [ ] Document any intentional overrides

## Phase 1 Status: Campaign Area

**Completed**: Campaign area module now uses theme inheritance

**Changes Made**:
- Removed hardcoded teal overrides from `.panel-campaign`
- Updated campaign area styles to use `--ui-*` tokens
- Moved theme class application to `.campaign-panel-slot` parent
- All campaign components now inherit theme from parent

**Next Phase**: Expand pattern to entire application

## Related Documentation

- [Style Tokens Reference](STYLE_TOKENS.md) - Complete token reference
- [Theme System Hardening](THEME_SYSTEM_HARDENING.md) - HSL foundation system















