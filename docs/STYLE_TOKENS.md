# DandDy Style Tokens Reference

> **Source of Truth:** `terminal-theme.css`  
> **Last Updated:** December 2024

This document lists all CSS custom properties (design tokens) defined in the DandDy codebase, organized by category with usage counts to identify actively used vs potentially deprecated tokens.

---

## Table of Contents

1. [HSL Theme Foundation](#hsl-theme-foundation)
2. [Color Tokens](#color-tokens)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Animation](#animation)
6. [UI Theme Tokens](#ui-theme-tokens)
7. [Component-Specific Tokens](#component-specific-tokens)
8. [Potentially Unused Tokens](#potentially-unused-tokens)

---

## HSL Theme Foundation

These are the base HSL values that all derived colors are built from. Changing these values will cascade through the entire color system.

### Terminal Green (Primary UI)
| Token | Value | Usage |
|-------|-------|-------|
| `--theme-terminal-h` | `120` | 62 uses |
| `--theme-terminal-s` | `100%` | 62 uses |
| `--theme-terminal-l-bright` | `50%` | 58 uses |
| `--theme-terminal-l-dim` | `35%` | 4 uses |

### Teal (Character Sheet)
| Token | Value | Usage |
|-------|-------|-------|
| `--theme-teal-h` | `181` | 85 uses |
| `--theme-teal-s` | `100%` | 79 uses |
| `--theme-teal-l-bright` | `41%` | 49 uses |
| `--theme-teal-l-dim` | `45%` | 25 uses |

### Yellow (Modals/Warnings)
| Token | Value | Usage |
|-------|-------|-------|
| `--theme-yellow-h` | `48` | 66 uses |
| `--theme-yellow-s` | `100%` | 64 uses |
| `--theme-yellow-l-bright` | `64%` | 46 uses |
| `--theme-yellow-l-dim` | `75%` | 15 uses |

### Cyan (Accents)
| Token | Value | Usage |
|-------|-------|-------|
| `--theme-cyan-h` | `180` | 4 uses |
| `--theme-cyan-s` | `100%` | 4 uses |
| `--theme-cyan-l-bright` | `50%` | 3 uses |
| `--theme-cyan-l-dim` | `27%` | 1 use |

### Pink (Campaigns)
| Token | Value | Usage |
|-------|-------|-------|
| `--theme-pink-h` | `330` | 3 uses |
| `--theme-pink-s` | `85%` | 3 uses |
| `--theme-pink-l-bright` | `65%` | 2 uses |
| `--theme-pink-l-dim` | `55%` | 1 use |

### Error/Warning
| Token | Value | Usage |
|-------|-------|-------|
| `--theme-error-h` | `0` | 2 uses |
| `--theme-error-s` | `100%` | 2 uses |
| `--theme-error-l` | `50%` | 2 uses |
| `--theme-warning-h` | `39` | 3 uses |
| `--theme-warning-s` | `100%` | 3 uses |
| `--theme-warning-l` | `50%` | 3 uses |

---

## Color Tokens

Derived semantic color tokens for use in components.

### Terminal Green Tokens (Primary UI)
| Token | Description | Usage |
|-------|-------------|-------|
| `--terminal-bg` | Pure black background | 75 uses |
| `--terminal-fg` | Main green foreground | 96 uses |
| `--terminal-dim` | Dimmed green for secondary text | 88 uses |
| `--terminal-border` | Green borders | 54 uses |
| `--terminal-hover` | Green hover state (10% opacity) | 3 uses |

### Cyan Accent Tokens
| Token | Description | Usage |
|-------|-------------|-------|
| `--terminal-accent` | Bright cyan for highlights | 103 uses |
| `--terminal-accent-dim` | Muted cyan | 5 uses |

### Status Colors
| Token | Description | Usage |
|-------|-------------|-------|
| `--terminal-error` | Red for errors | 13 uses |
| `--terminal-warning` | Yellow/gold for warnings | 10 uses |

### Modal/Yellow Tokens
| Token | Description | Usage |
|-------|-------------|-------|
| `--modal-accent` | Yellow for modal elements | 105 uses |
| `--modal-accent-dim` | Dimmed yellow | 54 uses |

### Sheet/Teal Tokens (Character Sheet)
| Token | Description | Usage |
|-------|-------------|-------|
| `--sheet-accent` | Bright teal for sheet highlights | 152 uses |
| `--sheet-accent-dim` | Muted teal for labels | 70 uses |
| `--sheet-border-color` | Teal borders | 8 uses |
| `--sheet-label-color` | Label text color | 20 uses |
| `--sheet-value-color` | Value text color | 21 uses |
| `--sheet-box-bg` | Box background (10% teal) | 11 uses |
| `--sheet-box-border-color` | Box border color | 1 use |
| `--sheet-ability-box-bg` | Ability box background | 1 use |

### Campaign/Pink Tokens
| Token | Description | Usage |
|-------|-------------|-------|
| `--campaign-accent` | Pink for campaign elements | 5 uses |
| `--campaign-accent-dim` | Dimmed pink | 2 uses |

### Legacy Tokens (Backward Compatibility)
| Token | Description | Usage |
|-------|-------------|-------|
| `--panel-teal` | Legacy alias for `--sheet-accent` | 9 uses |
| `--panel-teal-dim` | Legacy alias for `--sheet-accent-dim` | 0 uses ⚠️ |

### Scrollbar Tokens
| Token | Description | Usage |
|-------|-------------|-------|
| `--scrollbar-track-color` | Track background | 2 uses |
| `--scrollbar-thumb-color` | Thumb color | 2 uses |
| `--scrollbar-thumb-hover-color` | Thumb hover color | 1 use |

---

## Typography

### Font Family
| Token | Value | Usage |
|-------|-------|-------|
| `--font-family` | IBM Plex Mono fallback stack | 5 uses |
| `--font-mono` | IBM Plex Mono fallback stack | 79 uses |

### Font Size Scale
| Token | Value | Description | Usage |
|-------|-------|-------------|-------|
| `--font-size-2xs` | `10px` | Tiny labels, badges | 18 uses |
| `--font-size-xs` | `11px` | Uppercase labels | 26 uses |
| `--font-size-sm` | `12px` | Secondary text, hints | 53 uses |
| `--font-size-base` | `14px` | Body text, inputs | 74 uses |
| `--font-size-md` | `16px` | Emphasized body | 5 uses |
| `--font-size-lg` | `18px` | Section headers | 19 uses |
| `--font-size-xl` | `20px` | Page titles | 7 uses |
| `--font-size-2xl` | `28px` | Large headings | 1 use |
| `--font-size-3xl` | `32px` | Hero titles | 1 use |
| `--font-size-4xl` | `36px` | Display icons | 1 use |
| `--font-size-5xl` | `42px` | Dashboard stats | 2 uses |
| `--font-size-6xl` | `64px` | Empty state icons | 3 uses |

### Legacy Font Size Aliases
| Token | Maps To | Usage |
|-------|---------|-------|
| `--font-size-large` | `--font-size-xl` | 4 uses |
| `--font-size-small` | `--font-size-sm` | 48 uses |

### Line Height
| Token | Value | Description | Usage |
|-------|-------|-------------|-------|
| `--line-height-tight` | `1.1` | Headlines | 2 uses |
| `--line-height-snug` | `1.25` | Compact UI | 6 uses |
| `--line-height-normal` | `1.4` | Standard body | 11 uses |
| `--line-height-relaxed` | `1.6` | Paragraphs | 1 use |
| `--line-height` | `var(--line-height-relaxed)` | Legacy alias | 1 use |

### Letter Spacing
| Token | Value | Description | Usage |
|-------|-------|-------------|-------|
| `--tracking-tight` | `-0.01em` | Large headlines | 0 uses ⚠️ |
| `--tracking-normal` | `0` | Body text | 0 uses ⚠️ |
| `--tracking-wide` | `0.03em` | Titles, headers | 3 uses |
| `--tracking-wider` | `0.05em` | Uppercase labels | 20 uses |
| `--tracking-widest` | `0.1em` | Extra-spaced labels | 10 uses |

### Font Weight
| Token | Value | Description | Usage |
|-------|-------|-------------|-------|
| `--font-weight-normal` | `400` | Body text | 36 uses |
| `--font-weight-medium` | `500` | Emphasis, headers | 36 uses |
| `--font-weight-semibold` | `600` | Strong emphasis | 1 use |
| `--font-weight-bold` | `700` | Maximum emphasis | 4 uses |

---

## Spacing & Layout

### Spacing Scale
| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xs` | `4px` | 47 uses |
| `--spacing-sm` | `8px` | 165 uses |
| `--spacing-md` | `16px` | 166 uses |
| `--spacing-lg` | `24px` | 69 uses |
| `--spacing-xl` | `32px` | 50 uses |

### Layout
| Token | Value | Description | Usage |
|-------|-------|-------------|-------|
| `--max-width` | `1400px` | Container max width | 1 use |
| `--split-ratio` | `50%` | Panel split ratio | 0 uses ⚠️ |

### Button Dimensions
| Token | Value | Usage |
|-------|-------|-------|
| `--btn-height` | `32px` | 2 uses |
| `--btn-height-sm` | `28px` | 3 uses |

---

## Animation

| Token | Value | Description | Usage |
|-------|-------|-------------|-------|
| `--transition-speed` | `0.3s` | Standard transitions | 24 uses |
| `--typewriter-speed` | `30ms` | Typing animation | 0 uses ⚠️ |
| `--ease-bounce` | `cubic-bezier(0.2, 0.8, 0.2, 1.05)` | Bouncy easing | 12 uses |

---

## UI Theme Tokens

These tokens enable theming different sections of the UI. Apply theme classes like `.ui-theme-green`, `.ui-theme-teal`, `.ui-theme-pink` to containers.

### Generic UI Tokens
| Token | Default Value | Usage |
|-------|---------------|-------|
| `--ui-border-color` | `var(--terminal-border)` | 9 uses |
| `--ui-fg-color` | `var(--terminal-fg)` | 16 uses |
| `--ui-dim-color` | `var(--terminal-dim)` | 7 uses |
| `--ui-primary-bg-color` | `var(--terminal-border)` | 15 uses |
| `--ui-on-primary-color` | `var(--terminal-bg)` | 2 uses |
| `--ui-primary-color` | - | 0 uses ⚠️ |
| `--ui-primary-color-dim` | - | 0 uses ⚠️ |
| `--ui-hover-color` | - | 0 uses ⚠️ |

### Context-Aware Accent Tokens
Apply `.theme-green`, `.theme-yellow`, `.theme-teal`, `.theme-cyan`, or `.theme-pink` classes to set these.

| Token | Default Value | Usage |
|-------|---------------|-------|
| `--context-accent` | `var(--terminal-fg)` | 15 uses |
| `--context-accent-dim` | `var(--terminal-dim)` | 1 use |
| `--context-border` | `var(--terminal-border)` | 0 uses ⚠️ |
| `--context-hover` | `var(--terminal-hover)` | 5 uses |

---

## Component-Specific Tokens

### Overflow Button
| Token | Value | Usage |
|-------|-------|-------|
| `--overflow-icon-size` | `14px` | 2 uses |
| `--overflow-dot-size` | `3px` | 2 uses |
| `--overflow-dot-offset` | `1px` | 2 uses |
| `--overflow-animation-duration` | `180ms` | 3 uses |
| `--overflow-animation-easing` | `var(--ease-bounce)` | 3 uses |
| `--overflow-opacity-duration` | `120ms` | 1 use |
| `--overflow-border-radius-duration` | `160ms` | 1 use |

### Title Cube Spinner (Header)
| Token | Value | Usage |
|-------|-------|-------|
| `--title-cube-size` | `12px` | 5 uses |
| `--title-cube-depth` | `calc(--title-cube-size / 2)` | 6 uses |

### Splash Logo Glow Animation
All splash glow tokens are used internally within the animation keyframes (1-6 uses each). These are well-contained and working correctly.

<details>
<summary>Splash Glow Tokens (Click to expand)</summary>

| Token | Value |
|-------|-------|
| `--splash-glow-pad` | `14px` |
| `--splash-glow-inset` | `2px` |
| `--splash-glow-duration` | `9.5s` |
| `--splash-glow-ease` | `cubic-bezier(0.37, 0, 0.63, 1)` |
| `--splash-glow-rotate-base` | `46deg` |
| `--splash-glow-rotate-wobble` | `6deg` |
| `--splash-glow-scale-min` | `0.99` |
| `--splash-glow-scale-mid` | `1.02` |
| `--splash-glow-scale-max` | `1.04` |
| `--splash-glow-drift` | `1px` |
| `--splash-glow-opacity-min` | `0.50` |
| `--splash-glow-opacity-mid` | `0.72` |
| `--splash-glow-opacity-max` | `0.90` |
| `--splash-glow-blur-min` | `12px` |
| `--splash-glow-blur-mid` | `15px` |
| `--splash-glow-blur-max` | `18px` |
| `--splash-glow-brightness-min` | `0.95` |
| `--splash-glow-brightness-mid` | `1.12` |
| `--splash-glow-brightness-max` | `1.28` |
| `--splash-glow-saturate-min` | `1.10` |
| `--splash-glow-saturate-mid` | `1.18` |
| `--splash-glow-saturate-max` | `1.23` |
| `--splash-glow-teal-a` | `0.92` |
| `--splash-glow-green-a` | `0.82` |
| `--splash-glow-yellow-a` | `0.62` |

</details>

---

## Potentially Unused Tokens

These tokens are defined but have **zero usage** across the codebase. They may be candidates for removal or are reserved for future use.

### Color Tokens
| Token | Notes |
|-------|-------|
| `--terminal-glow-color` | Defined but never referenced |
| `--panel-teal-dim` | Legacy token, replaced by `--sheet-accent-dim` |

### Typography Tokens
| Token | Notes |
|-------|-------|
| `--tracking-tight` | Never used - could be removed |
| `--tracking-normal` | Never used - the default, may not need a token |

### Layout Tokens
| Token | Notes |
|-------|-------|
| `--split-ratio` | Defined but never referenced |

### Animation Tokens
| Token | Notes |
|-------|-------|
| `--typewriter-speed` | Defined but never referenced in CSS |

### UI Theme Tokens
| Token | Notes |
|-------|-------|
| `--ui-primary-color` | Defined in builder but never used |
| `--ui-primary-color-dim` | Defined in builder but never used |
| `--ui-hover-color` | Defined in builder but never used |
| `--context-border` | Defined in theme classes but never consumed |

---

## Theme Classes Reference

### UI Theme Classes
Apply to containers to set the color scheme for nested components:

```css
.ui-theme-green   /* Green terminal theme (default) */
.ui-theme-teal    /* Teal character sheet theme */
.ui-theme-pink    /* Pink campaign theme */
```

### Context Theme Classes
Apply to set `--context-accent` and related tokens:

```css
.theme-green   /* Green terminal (default) */
.theme-yellow  /* Yellow modals */
.theme-teal    /* Teal character sheets */
.theme-cyan    /* Cyan accents */
.theme-pink    /* Pink campaigns */
```

---

## Usage Guidelines

### Choosing Color Tokens

1. **For terminal/main UI:** Use `--terminal-*` tokens
2. **For character sheets:** Use `--sheet-*` tokens
3. **For modals:** Use `--modal-*` tokens
4. **For campaigns:** Use `--campaign-*` tokens
5. **For themed components:** Use `--context-*` tokens with theme classes

### Adding New Colors

Don't hardcode hex values. Instead:

```css
/* ✅ Good: Use semantic tokens */
.new-feature {
  color: var(--terminal-fg);
  border: 1px solid var(--sheet-accent);
}

/* ❌ Bad: Hard-coded hex */
.new-feature {
  color: #00ff00;
  border: 1px solid #00CED1;
}
```

### Creating Custom Colors with HSL

Use the foundation HSL tokens to create derived colors:

```css
/* Custom transparency */
background: hsla(var(--theme-teal-h), var(--theme-teal-s), var(--theme-teal-l-bright), 0.15);

/* Custom lightness */
border-color: hsl(var(--theme-terminal-h), var(--theme-terminal-s), 40%);
```

