# Crop Strategy Update: Top-Aligned

## Change Summary

Updated thumbnail cropping to **keep the top** (face/head) and **crop from the bottom** (legs/feet).

## Visual Comparison

### BEFORE (Center Crop)
```
Original 80 lines:

Line 0  ════════════════  ← CROPPED (top 5)
Line 1  ════════════════
Line 2  ════════════════
Line 3  ════════════════
Line 4  ════════════════
Line 5  ████ HEAD ██████  ← START keeping
Line 10 ████ FACE ██████
Line 20 ████ BODY ██████
Line 40 ████ TORSO █████
Line 60 ████ LEGS ██████
Line 74 ████ FEET ██████  ← STOP keeping
Line 75 ════════════════  ← CROPPED (bottom 5)
Line 76 ════════════════
Line 77 ════════════════
Line 78 ════════════════
Line 79 ════════════════

Kept: Lines 5-74 (middle 70 lines)
Lost: Top 5, Bottom 5
```

### AFTER (Top Crop)
```
Original 80 lines:

Line 0  ████ HEAD ██████  ← START keeping (from top!)
Line 5  ████ FACE ██████
Line 15 ████ NECK ██████
Line 30 ████ BODY ██████
Line 50 ████ TORSO █████
Line 69 ████ WAIST █████  ← STOP keeping
Line 70 ════════════════  ← CROPPED (bottom 10)
Line 71 ════════════════
Line 72 ════════════════
Line 73 ════════════════
Line 74 ════════════════
Line 75 ════════════════
Line 76 ════════════════
Line 77 ════════════════
Line 78 ════════════════
Line 79 ════════════════

Kept: Lines 0-69 (top 70 lines)
Lost: Bottom 10 lines
```

## Code Change

```javascript
// BEFORE (Center crop)
const startLine = Math.floor((totalLines - heightLines) / 2);  // Middle
const endLine = startLine + heightLines;

// AFTER (Top crop)
const startLine = 0;  // Always start from top
const endLine = Math.min(totalLines, heightLines);  // Take first 70 lines
```

## Why This is Better

### Character Portrait Priority
```
TOP (Most Important)
├─ Head/Face          ✅ ALWAYS SHOWN
├─ Eyes/Expression    ✅ ALWAYS SHOWN
├─ Upper body         ✅ ALWAYS SHOWN
├─ Torso              ✅ SHOWN
├─ Waist              ✅ SHOWN
├─ Hips               ⚠️  MIGHT CROP
└─ Legs/Feet          ❌ CROPPED
BOTTOM (Least Important)
```

### Benefits

1. **Face is always visible** - Most important for character recognition
2. **Upper body shown** - Armor, clothing, posture visible
3. **Natural framing** - Like a portrait photo (headshot + shoulders)
4. **Better character ID** - Face is what makes characters recognizable
5. **Consistent across all** - Every thumbnail shows the face

### What Gets Cropped

**Usually cropped:**
- Lower legs
- Feet
- Bottom decorative elements
- Ground/base

**Always kept:**
- Face and head
- Upper body
- Torso
- Arms (usually)

## Result

Thumbnails now show:
- ✅ Complete face/head (most important!)
- ✅ Upper body and torso
- ✅ Character identifying features
- ❌ Legs/feet (less important for identification)

This is much better for character recognition in the card grid!







