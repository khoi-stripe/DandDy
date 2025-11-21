# Fill Frame Calculation - ASCII Art Thumbnails

## Goal
Make ASCII art **completely fill** the 3:4 thumbnail frame with no empty vertical space.

## The Math

### Original Dimensions
- **ASCII art:** 160 characters wide × 80 lines tall
- **Container:** 3:4 aspect ratio (portrait)

### Size Calculation

**Per character/line:**
- Font size: 2.2px
- Line height: 1.1
- Effective line height: 2.2px × 1.1 = 2.42px

**Base ASCII dimensions (before scale):**
- Width: 160 chars × 2.2px = **352px**
- Height: 80 lines × 2.42px = **193.6px**
- Aspect ratio: 352:193.6 ≈ **1.82:1** (landscape)

**Container dimensions (example 240px card width):**
- Width: 240px
- Height: 240px × (4/3) = **320px**
- Aspect ratio: 240:320 = **0.75:1** (portrait)

### The Problem

```
ASCII Art Natural Size:     Container Size:
┌─────────────────┐          ┌──────────┐
│  352px wide     │          │ 240px    │
│                 │          │          │
│  193.6px tall   │          │          │
└─────────────────┘          │          │
    (landscape)              │          │
                             │ 320px    │
                             │          │
                             └──────────┘
                             (portrait)
```

**Mismatch:**
- ASCII is **1.82× wider than tall**
- Container is **0.75× as wide as tall**
- ASCII doesn't naturally fit the portrait frame!

### The Solution

**Scale up the ASCII to fill the height:**

```
Target height: 320px
Current height: 193.6px
Scale needed: 320 / 193.6 = 1.65×
```

**After scale(1.65):**
- Width: 352px × 1.65 = **581px** (will overflow and crop)
- Height: 193.6px × 1.65 = **320px** (fills perfectly!)

The container has `overflow: hidden`, so the extra width gets clipped from the sides.

### Visual Result

```
BEFORE (scale 1.15):                AFTER (scale 1.65):
┌──────────┐                        ┌──────────┐
│          │ ← Empty space          │████████████ ← Fills top
│  ██████  │                        │████████████
│  ██████  │ ← ASCII art            │████████████ ← Completely
│  ██████  │                        │████████████    fills
│          │ ← Empty space          │████████████    frame!
└──────────┘                        │████████████
                                    │████████████ ← Fills bottom
                                    └──────────┘
```

## Implementation

### JavaScript: Use All Lines
```javascript
heightLines = 80  // Use all 80 lines (was 70)
```

**Before:** 70 lines cropped
**After:** All 80 lines used

### CSS: Increase Scale
```css
transform: scale(1.65);  /* Was 1.15 */
```

**Desktop:**
- Scale: 1.15× → 1.65× (+43% increase)

**Mobile:**
- Scale: 1.1× → 1.45× (+32% increase)

## Calculation Verification

### Desktop (240px wide card example)

**Base dimensions:**
- Width: 352px
- Height: 193.6px

**After scale(1.65):**
- Width: 352 × 1.65 = 581px
- Height: 193.6 × 1.65 = 320px ✓

**Container (3:4 ratio):**
- Width: 240px (clips 581px → centers and shows middle 240px)
- Height: 320px (perfect match!) ✓

### Result Matrix

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Lines used** | 70 | 80 | +14% |
| **Scale factor** | 1.15× | 1.65× | +43% |
| **Vertical fill** | ~70% | ~100% | ✅ Full |
| **Horizontal fit** | Fits | Overflows | ✓ Clipped |

## What Gets Clipped

**Vertically:** Nothing! (Perfect fit)

**Horizontally:** 
- ASCII width: 581px (after scale)
- Container width: ~240px
- Overflow: ~341px (170px per side)
- Result: Shows center ~41% of width, crops left/right edges

This is acceptable because:
- Character faces are usually centered
- Side decorations are less important
- We prioritize vertical fill (showing full character)

## Benefits

✅ **No empty vertical space** - Completely fills height
✅ **Uses all 80 lines** - Shows entire character (head to toe)
✅ **Consistent appearance** - Every thumbnail is full
✅ **Professional look** - No gaps or wasted space
✅ **Better visual density** - More impactful thumbnails

## Trade-offs

⚠️ **Horizontal cropping** - Sides are clipped (but faces stay centered)
✅ **Worth it** - Vertical fill is more important for card layout

The result: **ASCII art that perfectly fills the 3:4 thumbnail frame!**





