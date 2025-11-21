# Integration Guide: Using Generated Portraits

This guide shows you how to integrate the generated portraits into your D&D character builder.

## Quick Start

After generating portraits, you have **three integration options**:

---

## Option 1: Use the Generated JavaScript Module (Easiest)

### Step 1: Copy the portraits file

After running the script with `--create-js`, copy the generated file:

```bash
cp generated_portraits/portraits.js character-builder/portraits.js
```

### Step 2: Update your HTML

In `character-builder/index.html`, replace the `AsciiArtService` section with:

```html
<!-- Add this before your main script -->
<script type="module">
  import { getPortrait } from './portraits.js';
  
  // Make it globally available
  window.getPortrait = getPortrait;
</script>
```

### Step 3: Update the AsciiArtService

Replace the `generateAIPortrait` method:

```javascript
// In AsciiArtService
async generateAIPortrait(character) {
  try {
    // Use pre-generated portrait if available
    if (window.getPortrait) {
      const portrait = window.getPortrait(
        character.race.toLowerCase(),
        character.class ? character.class.toLowerCase() : null
      );
      
      if (portrait) {
        console.log('Using pre-generated portrait');
        return portrait;
      }
    }
    
    // Fallback to existing logic...
    // (keep your existing code as fallback)
  } catch (error) {
    console.error('Portrait error:', error);
    return this.getFullPortrait(character);
  }
}
```

---

## Option 2: Inline ASCII Art (Most Compatible)

### Step 1: Load the ASCII files

```javascript
// In your AsciiArtService, update DEMO_PORTRAITS
const DEMO_PORTRAITS = {};

// Helper to load portrait
async function loadPortrait(race, className = null) {
  const key = className 
    ? `${race.toLowerCase()}-${className.toLowerCase()}`
    : race.toLowerCase();
  
  try {
    const response = await fetch(`/generated_portraits/ascii/${key}.txt`);
    if (response.ok) {
      return await response.text();
    }
  } catch (error) {
    console.error(`Failed to load portrait: ${key}`, error);
  }
  return null;
}

// Use in your code
const portrait = await loadPortrait('elf', 'wizard');
```

### Step 2: Preload on page load (Recommended)

```javascript
// Preload all portraits on page load
const PortraitCache = {
  portraits: {},
  
  async init() {
    const races = ['dwarf', 'elf', 'halfling', 'human', 'dragonborn', 
                   'gnome', 'half-elf', 'half-orc', 'tiefling'];
    const classes = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 
                     'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 
                     'warlock', 'wizard'];
    
    console.log('Preloading portraits...');
    
    // Load race-only
    for (const race of races) {
      try {
        const response = await fetch(`/generated_portraits/ascii/${race}.txt`);
        if (response.ok) {
          this.portraits[race] = await response.text();
        }
      } catch (error) {
        console.error(`Failed to load ${race}`, error);
      }
    }
    
    // Load race+class
    for (const race of races) {
      for (const cls of classes) {
        const key = `${race}-${cls}`;
        try {
          const response = await fetch(`/generated_portraits/ascii/${key}.txt`);
          if (response.ok) {
            this.portraits[key] = await response.text();
          }
        } catch (error) {
          console.error(`Failed to load ${key}`, error);
        }
      }
    }
    
    console.log(`Loaded ${Object.keys(this.portraits).length} portraits`);
  },
  
  get(race, className = null) {
    const key = className ? `${race}-${className}` : race;
    return this.portraits[key.toLowerCase()] || null;
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await PortraitCache.init();
});
```

---

## Option 3: Direct File Copy (For Testing)

### Copy specific portraits you want to test

```bash
# Copy an ASCII file and view it
cat generated_portraits/ascii/elf-wizard.txt
```

Then manually paste the ASCII art into your `DEMO_PORTRAITS` object:

```javascript
const DEMO_PORTRAITS = {
  'elf-wizard': `
    [paste the ASCII art here]
  `,
  // ... more portraits
};
```

---

## Full Example Integration

Here's a complete example showing how to modify your `character-builder/index.html`:

```javascript
// Add this to your existing code in character-builder/index.html

// ===== PORTRAIT LOADER SERVICE =====
const PortraitLoader = {
  portraits: {},
  loading: false,
  loaded: false,
  
  async loadAll() {
    if (this.loading || this.loaded) return;
    
    this.loading = true;
    console.log('📚 Loading pre-generated portraits...');
    
    try {
      // Try to load manifest first to see what's available
      const manifestResponse = await fetch('/generated_portraits/manifest.json');
      if (!manifestResponse.ok) {
        console.warn('No portrait manifest found');
        return;
      }
      
      const manifest = await manifestResponse.json();
      console.log(`Found ${manifest.stats.successful} portraits`);
      
      // Load all successful portraits
      const loadPromises = [];
      
      // Load races
      for (const [key, success] of Object.entries(manifest.results.races)) {
        if (success) {
          loadPromises.push(
            fetch(`/generated_portraits/ascii/${key}.txt`)
              .then(r => r.ok ? r.text() : null)
              .then(text => { if (text) this.portraits[key] = text; })
              .catch(err => console.warn(`Failed to load ${key}:`, err))
          );
        }
      }
      
      // Load race+class
      for (const [key, success] of Object.entries(manifest.results.race_class)) {
        if (success) {
          loadPromises.push(
            fetch(`/generated_portraits/ascii/${key}.txt`)
              .then(r => r.ok ? r.text() : null)
              .then(text => { if (text) this.portraits[key] = text; })
              .catch(err => console.warn(`Failed to load ${key}:`, err))
          );
        }
      }
      
      await Promise.all(loadPromises);
      console.log(`✅ Loaded ${Object.keys(this.portraits).length} portraits`);
      this.loaded = true;
      
    } catch (error) {
      console.warn('Failed to load portraits:', error);
    } finally {
      this.loading = false;
    }
  },
  
  get(race, className = null) {
    const key = className 
      ? `${race.toLowerCase()}-${className.toLowerCase()}`
      : race.toLowerCase();
    return this.portraits[key] || null;
  },
  
  has(race, className = null) {
    const key = className 
      ? `${race.toLowerCase()}-${className.toLowerCase()}`
      : race.toLowerCase();
    return key in this.portraits;
  }
};

// ===== UPDATE ASCII ART SERVICE =====
// Modify your existing AsciiArtService.generateAIPortrait method:

// Find this method and replace it:
async generateAIPortrait(character) {
  try {
    // First, try to use pre-generated portrait
    const portrait = PortraitLoader.get(
      character.race,
      character.class || null
    );
    
    if (portrait) {
      console.log('✅ Using pre-generated portrait');
      return portrait;
    }
    
    console.log('⚠️ No pre-generated portrait found, checking for live generation...');
    
    // Check for demo mode
    const demoModeEnabled = StorageService.getDemoModeEnabled();
    
    if (demoModeEnabled) {
      console.log('Demo mode enabled, using template portrait');
      return this.getFullPortrait(character);
    }
    
    // Check for AI portraits enabled
    const aiEnabled = StorageService.getAIPortraitsEnabled();
    if (!aiEnabled) {
      console.log('AI portraits disabled, using template');
      return this.getFullPortrait(character);
    }
    
    // Live generation (your existing code)
    console.log('Generating DALL-E portrait...');
    const imageUrl = await AIService.generatePortraitImage(character);
    
    if (!imageUrl) {
      console.log('DALL-E generation failed, using template');
      return this.getFullPortrait(character);
    }
    
    console.log('DALL-E image generated:', imageUrl);
    
    const asciiArt = await ImageToAsciiService.convertToAscii(imageUrl, 160, 80);
    
    if (!asciiArt) {
      console.log('ASCII conversion failed, using template');
      return this.getFullPortrait(character);
    }
    
    console.log('ASCII art generated successfully');
    return asciiArt;
  } catch (error) {
    console.error('AI portrait generation error:', error);
    return this.getFullPortrait(character);
  }
}

// ===== INITIALIZE ON PAGE LOAD =====
// Add to your DOMContentLoaded handler:

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎭 D&D Character Builder - Terminal Edition');
  
  // Load pre-generated portraits
  await PortraitLoader.loadAll();
  
  // Your existing initialization code...
});
```

---

## Testing the Integration

1. **Start a local server** (required for loading local files):
```bash
cd character-builder
python3 -m http.server 8000
```

2. **Open in browser**:
```
http://localhost:8000/
```

3. **Test portrait loading**:
   - Open browser console
   - Create a character
   - Check console logs for "Using pre-generated portrait"

4. **Verify it works**:
   - Select different race/class combinations
   - The ASCII portrait should load instantly (no DALL-E calls)
   - No API key required for pre-generated portraits

---

## Troubleshooting

### Portraits not loading?

**Check the manifest:**
```bash
cat generated_portraits/manifest.json
```

**Check browser console:**
- Are there CORS errors? → Start a local server
- Are there 404 errors? → Check file paths
- Are there fetch errors? → Check network tab

### Want to regenerate specific portraits?

```bash
# Edit the script to only generate specific combinations
python generate_all_portraits.py --force
```

### Performance optimization

The portraits load instantly because they're pre-generated! No more:
- Waiting for DALL-E API calls
- Converting images to ASCII in real-time
- Back-and-forth manual work

---

## Benefits of Pre-Generated Portraits

✅ **Instant loading** - No API delays  
✅ **No API costs** - Generate once, use forever  
✅ **Offline support** - Works without internet  
✅ **Consistent quality** - Same portraits every time  
✅ **No rate limits** - Unlimited character creation  
✅ **Better UX** - Smooth, fast character creation  

---

## Need Help?

Check the main README.md for:
- Regenerating portraits
- Customizing prompts
- Adjusting ASCII size
- Cost and time estimates







