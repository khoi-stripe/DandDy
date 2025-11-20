# CSS Architecture

## Shared Terminal Theme

Both the character builder and character manager use a shared terminal aesthetic.

### File Structure

```
terminal-theme.css          ← Shared base styles (colors, typography, buttons, inputs)
├── character-builder.css   ← Builder-specific styles (wizard, questions, portraits)
└── character-manager.css   ← Manager-specific styles (cards, grid, modals)
```

### Import Order

Both apps import the shared theme first, then their specific styles:

**character-builder/index.html:**
```html
<link rel="stylesheet" href="../terminal-theme.css">
<link rel="stylesheet" href="./character-builder.css">
```

**character-manager.html:**
```html
<link rel="stylesheet" href="terminal-theme.css">
<link rel="stylesheet" href="character-manager.css">
```

## Shared Styles (terminal-theme.css)

### CSS Variables
- **Colors:** `--terminal-bg`, `--terminal-fg`, `--terminal-accent`, etc.
- **Typography:** `--font-mono`, `--font-size-base`, `--font-size-large`, etc.
- **Spacing:** `--spacing-xs` (4px) through `--spacing-xl` (32px)
- **Layout:** `--max-width` (1400px)

### Base Elements
- Body styles with dotted background
- Scrollbar hiding
- Terminal frame/container
- Headers and footers

### Components

#### Buttons (All Consistent Across Both Apps)
- **`.terminal-btn`** / **`.button-primary`** - Base transparent button with green border
  - Hover: Light green background
  - Disabled: 60% opacity
  
- **`.terminal-btn-primary`** - Filled button (green background, black text)
  - Used for main actions in character-manager
  
- **`.terminal-btn-small`** / **`.button-secondary`** - Smaller, dim button
  - 1px border, dim color, smaller padding
  
- **`.terminal-btn-danger`** - Red border button for destructive actions
  
- **`.prompt-modal-btn`** - Modal action buttons
  - `.prompt-modal-btn.primary` - Cyan filled variant
  
- **`.link-button`** - Underlined text-style button

**Character Builder Specific Button States:**
- `.button-primary.is-selected` - Green filled (selected answer)
- `.button-primary.is-focused` - Cyan outline (keyboard navigation)
- `.button-primary.is-locked` - Clickable but dimmed

**Button Layout Utilities:**
- `.button-group` - Flex container for button rows
- `.prompt-modal-buttons` - Flex container for modal buttons (right-aligned)

#### Other Components
- **Inputs:** `.terminal-input`, `.terminal-select`, `.terminal-textarea`
- **Modals:** `.modal`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-footer`
- **Typography:** `.terminal-text`, `.terminal-text-dim`, `.terminal-text-accent`

## App-Specific Styles

### character-builder.css
- Question/answer wizard flow
- Portrait generation UI
- Settings panel
- Split-screen layout
- Custom scrollbar styles for builder
- Print styles

### character-manager.css
- Character card grid
- Search and filter controls
- Character detail view
- Empty states
- Card hover effects

## Making Changes

### To Change Shared Theme
Edit `terminal-theme.css` - changes will affect both apps.

### To Change App-Specific Styles
Edit the individual CSS file:
- `character-builder/character-builder.css` for builder
- `character-manager.css` for manager

## Future: Single App Integration

When combining both apps into a single interface, the shared `terminal-theme.css` ensures visual consistency. App-specific styles can be loaded conditionally or merged as needed.

