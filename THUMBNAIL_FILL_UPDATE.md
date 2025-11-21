# Thumbnail Fill Optimization

## Goal
Expand ASCII art in card thumbnails to better fill the available space.

## Changes Made

### 1. Increased Font Size
**Before:** `1.8px`  
**After:** `2.2px` (+22% larger)

Larger characters = more visible detail and better space usage.

### 2. Tighter Line Height
**Before:** `1.2`  
**After:** `1.1` (-8% tighter)

Reduces vertical gaps between lines, making the art more compact and filling vertical space better.

### 3. Scale Transform
**New:** `transform: scale(1.15)` with `transform-origin: center`

Scales the entire ASCII art up by 15% while keeping it centered. This is applied on top of the font size increase for maximum fill.

**Total effective increase:** ~40% larger appearance

### 4. Mobile Adjustments
**Desktop:** 2.2px font, 1.15× scale  
**Mobile:** 1.5px font, 1.1× scale

Proportionally scales up on mobile as well.

## Visual Impact

### Before (Underutilized Space)
```
┌─────────────────┐
│                 │ ← Empty margin
│   ████████      │
│   ██ Art █      │ ← Small, centered
│   ████████      │
│                 │ ← Empty margin
└─────────────────┘
```

### After (Fills Space)
```
┌─────────────────┐
│ ████████████    │ ← Touches edges
│ ████ Art ███    │ ← Larger, fills more
│ ████████████    │ ← Less wasted space
│ ████████████    │
└─────────────────┘
```

## Technical Details

### Transform vs Font Size
Why use both?

1. **Font size (2.2px):** Makes actual characters larger
2. **Transform scale (1.15):** Scales the entire content block

Combined effect = maximum fill without distortion

### Transform Properties
```css
transform: scale(1.15);        /* Scale up 15% */
transform-origin: center;      /* Keep centered */
```

The `overflow: hidden` on the container ensures scaled content is clipped at edges.

## Results

✅ **Better space utilization** - Less empty margin  
✅ **Larger, more visible** - 40% larger effective size  
✅ **Still centered** - Transform origin keeps it balanced  
✅ **No distortion** - Scale maintains aspect ratio  
✅ **Fills frame** - Art reaches closer to edges  

## Mobile Optimization

Mobile gets slightly less aggressive scaling (1.1× vs 1.15×) because:
- Smaller cards need more breathing room
- Touch targets benefit from margins
- Smaller screens are viewed closer

## Summary

| Property | Before | After | Change |
|----------|--------|-------|--------|
| Font Size | 1.8px | 2.2px | +22% |
| Line Height | 1.2 | 1.1 | -8% |
| Scale | 1.0 | 1.15 | +15% |
| **Total Effect** | 100% | ~140% | +40% |

The ASCII art now fills the thumbnail much better while maintaining centering and aspect ratio!





