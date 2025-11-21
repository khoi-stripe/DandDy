# Graceful Failure for AI Portrait Generation

## Overview
Improved error handling for custom AI portrait generation in Character Manager to fail gracefully like other AI features in the app, following the same patterns used for narrator comments, name generation, and backstory generation.

## Problem
When AI portrait generation failed (timeout, connection error, rate limit), the error handling was too disruptive:
- Used blocking `alert()` dialogs
- Didn't provide context-specific feedback
- No automatic recovery or retry suggestions
- Inconsistent with other AI features' error handling

## Solution
Implemented graceful error handling that:
1. **Never blocks the UI** - Uses console logs and notifications instead of alerts
2. **Provides context-specific feedback** - Different messages for different error types
3. **Attempts automatic recovery** - Triggers backend warmup on timeouts
4. **Maintains app state** - Restores previous portrait, keeps character sheet functional
5. **Follows app patterns** - Uses same colored console log format as other AI features

## Changes Made

### 1. Enhanced Error Handling (`character-manager.js`)

**Before:**
```javascript
} catch (error) {
    console.error('Error:', error);
    alert('Failed to generate portrait');
}
```

**After:**
```javascript
} catch (error) {
    // Stop loading animation
    // Restore previous portrait
    
    // Graceful, non-blocking error messages
    if (error.isRateLimit) {
        console.log('%c🎨 PORTRAIT (Rate Limited)', 'color: #fa0');
        showNotification('⚠️ Rate limit exceeded...');
    } else if (timeout) {
        console.log('%c🎨 PORTRAIT (Timeout)', 'color: #fa0');
        showNotification('⏰ Request timed out. Try again!');
        AIService.warmupBackend(); // Auto-recovery
    } else {
        console.log('%c🎨 PORTRAIT (Failed)', 'color: #f00');
        showNotification('❌ Portrait generation failed.');
    }
}
```

### 2. Colored Console Logging

Now uses consistent color-coded console logs like other AI features:
- 🔵 **Cyan** - Starting operation
- 🟢 **Green** - Success
- 🟠 **Orange** - Warning/Timeout (will retry)
- 🔴 **Red** - Error/Failure

### 3. Automatic Backend Warmup

On timeout errors, automatically triggers background warmup:
```javascript
if (window.AIService && window.AIService.warmupBackend) {
    window.AIService.warmupBackend();
}
```

This means:
- Server starts waking up immediately
- Next request will likely succeed
- User doesn't need to wait or manually retry

### 4. Enhanced Validation

Added result validation before updating character:
```javascript
if (!result || !result.asciiArt || !result.imageUrl) {
    throw new Error('Portrait generation returned incomplete result');
}
```

### 5. Improved Notification System

Enhanced `showNotification()` to use styled console logs:
```javascript
function showNotification(message) {
    console.log('%c✓ ' + message, 'color: #0f0; font-weight: bold');
}
```

## Error Types & Messages

### 1. Rate Limit (429)
```
Console: 🎨 PORTRAIT (Rate Limited)
Notification: ⚠️ Rate limit exceeded. Wait a few minutes.
```

### 2. Timeout (Cold Start)
```
Console: 🎨 PORTRAIT (Timeout - Backend Waking Up)
        ⏰ Request timed out. Backend may be waking up...
        ✅ Try again in a moment - server should be warm now!
Notification: ⏰ Request timed out. Try again in a moment!
Action: Triggers AIService.warmupBackend()
```

### 3. Connection Error
```
Console: 🎨 PORTRAIT (Connection Error)
        Cannot connect to backend server
Notification: 🔌 Cannot connect to backend server.
```

### 4. Other Errors
```
Console: 🎨 PORTRAIT (Failed)
        Error: [specific error message]
Notification: ❌ Portrait generation failed. Check console.
```

## User Experience Flow

### Success Path
1. User clicks "★ Custom AI Portrait"
2. Console: `🎨 PORTRAIT: Starting AI portrait generation...`
3. Loading animation with progress messages
4. Console: `🎨 PORTRAIT (Success) ✨`
5. Notification: `✓ Custom AI portrait generated! (2 remaining)`
6. Portrait updates automatically

### Failure Path (Timeout)
1. User clicks "★ Custom AI Portrait"
2. Console: `🎨 PORTRAIT: Starting AI portrait generation...`
3. Loading animation runs for 45 seconds
4. Request times out
5. Console: `🎨 PORTRAIT (Timeout - Backend Waking Up)`
6. Loading animation stops
7. Previous portrait restored
8. Notification: `⏰ Request timed out. Try again in a moment!`
9. **Background warmup starts automatically**
10. User can immediately try again (will succeed)

## Comparison with Other AI Features

### Narrator Comments
```javascript
console.log('%c🤖 NARRATOR (Fallback)', 'color: #f80');
return Utils.randomChoice(fallbacks);
```

### Name Generation
```javascript
console.log('%c📛 NAMES (Fallback)', 'color: #f80');
return this.generateFallbackNames(race, count);
```

### Backstory Generation
```javascript
console.log('%c📖 BACKSTORY (Fallback)', 'color: #f80');
return fallback;
```

### Portrait Generation (Now Consistent!)
```javascript
console.log('%c🎨 PORTRAIT (Timeout)', 'color: #fa0');
showNotification('Try again in a moment!');
```

## Benefits

1. **Non-Disruptive**: No blocking alerts, user can continue using the app
2. **Informative**: Clear feedback about what went wrong and what to do
3. **Self-Healing**: Automatic backend warmup on timeouts
4. **Consistent**: Matches error handling patterns across all AI features
5. **Debuggable**: Detailed console logs for troubleshooting
6. **Resilient**: Portrait restoration ensures character sheet stays functional

## Testing Scenarios

- [x] Cold backend start (timeout)
- [x] Rate limit error (429)
- [x] Connection error (backend offline)
- [x] Network error (no internet)
- [x] Incomplete result (validation)
- [x] Successful generation
- [x] Backend warmup trigger
- [x] Portrait restoration on error

## Notes

- No alerts or blocking dialogs used
- All errors log to console with color coding
- Notifications are non-blocking console messages
- Previous portrait always restored on error
- Character sheet remains fully functional after error
- Backend warmup happens automatically in background
- Consistent with app's graceful degradation philosophy


