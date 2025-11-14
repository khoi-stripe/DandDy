# Usage Examples

Real-world examples of using the portrait automation system.

## Example 1: First-Time Setup

```bash
# Day 1 - Initial setup
cd /path/to/DandDy/scripts

# Install dependencies
pip install -r requirements.txt

# Set API key
export OPENAI_API_KEY='sk-proj-abc123...'

# Test with sample first
python generate_sample.py --create-js

# Wait ~3 minutes...
# ✅ Generated 9 portraits successfully!

# Check the output
ls -la ../generated_portraits/ascii/
cat ../generated_portraits/ascii/elf-wizard.txt

# Looks good! Generate everything
python generate_all_portraits.py --create-js

# Wait ~35 minutes (grab coffee ☕)
# ✅ Generated 117 portraits successfully!
```

## Example 2: Quick Integration

```bash
# After generating portraits, integrate them:

cd ../character-builder

# Start local server
python3 -m http.server 8000 &

# Open browser
open http://localhost:8000

# Create a character and see instant portrait loading!
```

## Example 3: Regenerate Specific Portraits

Say you want to regenerate just the Elf portraits with a different style:

```python
# Edit generate_all_portraits.py temporarily:

RACES = ["Elf"]  # Just Elf
CLASSES = [
    "Wizard", "Fighter", "Rogue", "Ranger"  # Elf-appropriate classes
]

# Then in build_prompt(), customize the style:
def build_prompt(self, race: str, class_name: Optional[str] = None) -> str:
    parts = []
    parts.append("ethereal fantasy elf portrait")  # Custom style
    parts.append("glowing magical aura")
    parts.append("forest background")
    # ... rest of method
```

```bash
# Run with force to overwrite
python generate_all_portraits.py --force --create-js
```

## Example 4: Different ASCII Sizes

Generate portraits at different resolutions:

```python
# Edit generate_all_portraits.py:

# For compact portraits (terminal friendly)
ASCII_WIDTH = 80
ASCII_HEIGHT = 40

# For detailed portraits (web display)
ASCII_WIDTH = 200
ASCII_HEIGHT = 100

# For mobile-friendly
ASCII_WIDTH = 60
ASCII_HEIGHT = 30
```

```bash
python generate_all_portraits.py --create-js
```

## Example 5: Integration in Character Builder

Add to your `character-builder/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>D&D Character Builder</title>
</head>
<body>
  <div id="character-portrait"></div>
  
  <script type="module">
    // Import the portraits
    import { getPortrait } from './portraits.js';
    
    // When user selects race and class
    function updatePortrait(race, className) {
      const portrait = getPortrait(race, className);
      
      if (portrait) {
        document.getElementById('character-portrait').innerHTML = 
          `<pre>${portrait}</pre>`;
      }
    }
    
    // Example usage
    updatePortrait('elf', 'wizard');
  </script>
</body>
</html>
```

## Example 6: Preload All Portraits

For instant switching between characters:

```javascript
// In your app initialization
const PortraitCache = {
  portraits: {},
  
  async init() {
    console.log('Loading portraits...');
    
    // Load manifest
    const manifest = await fetch('/generated_portraits/manifest.json')
      .then(r => r.json());
    
    // Load all successful portraits
    const promises = [];
    
    for (const [key, success] of Object.entries(manifest.results.race_class)) {
      if (success) {
        promises.push(
          fetch(`/generated_portraits/ascii/${key}.txt`)
            .then(r => r.text())
            .then(text => { this.portraits[key] = text; })
        );
      }
    }
    
    await Promise.all(promises);
    console.log(`Loaded ${Object.keys(this.portraits).length} portraits`);
  },
  
  get(race, className) {
    return this.portraits[`${race}-${className}`.toLowerCase()];
  }
};

// On app start
await PortraitCache.init();

// Later, instant access
const portrait = PortraitCache.get('elf', 'wizard');
```

## Example 7: Custom Art Styles

### Anime Style

```python
def build_prompt(self, race: str, class_name: Optional[str] = None) -> str:
    parts = []
    parts.append("anime style fantasy character")
    parts.append("Studio Ghibli inspired")
    parts.append("cel shaded art")
    # ... rest of prompt
```

### Pixel Art Style

```python
def build_prompt(self, race: str, class_name: Optional[str] = None) -> str:
    parts = []
    parts.append("pixel art character sprite")
    parts.append("16-bit retro game style")
    parts.append("detailed pixel art")
    # ... rest of prompt
```

### Dark Fantasy

```python
def build_prompt(self, race: str, class_name: Optional[str] = None) -> str:
    parts = []
    parts.append("dark fantasy character portrait")
    parts.append("gritty realistic style")
    parts.append("dramatic shadows moody lighting")
    # ... rest of prompt
```

## Example 8: Batch Processing Script

Create a custom script for specific needs:

```python
#!/usr/bin/env python3
"""
Custom batch generator - Only generate portraits for starter races
"""

import generate_all_portraits as gen

# Configure
STARTER_RACES = ["Human", "Elf", "Dwarf", "Halfling"]
POPULAR_CLASSES = ["Fighter", "Wizard", "Rogue", "Cleric"]

gen.RACES = STARTER_RACES
gen.CLASSES = POPULAR_CLASSES

# Run
if __name__ == '__main__':
    api_key = input("Enter OpenAI API key: ")
    generator = gen.PortraitGenerator(api_key)
    generator.generate_all_portraits(force=False)
    gen.create_javascript_file()
    
    print("\n✅ Starter portraits generated!")
    print(f"Total: {len(STARTER_RACES) + len(STARTER_RACES) * len(POPULAR_CLASSES)} portraits")
```

## Example 9: Progressive Loading

Load portraits as needed (lazy loading):

```javascript
class PortraitLoader {
  constructor() {
    this.cache = new Map();
    this.loading = new Map();
  }
  
  async get(race, className) {
    const key = `${race}-${className}`.toLowerCase();
    
    // Check cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    // Check if already loading
    if (this.loading.has(key)) {
      return await this.loading.get(key);
    }
    
    // Start loading
    const promise = fetch(`/generated_portraits/ascii/${key}.txt`)
      .then(r => r.text())
      .then(text => {
        this.cache.set(key, text);
        this.loading.delete(key);
        return text;
      })
      .catch(err => {
        this.loading.delete(key);
        throw err;
      });
    
    this.loading.set(key, promise);
    return await promise;
  }
}

const loader = new PortraitLoader();

// Usage
const portrait = await loader.get('elf', 'wizard');
```

## Example 10: Error Recovery

Handle missing portraits gracefully:

```javascript
async function getCharacterPortrait(race, className) {
  try {
    // Try pre-generated portrait
    const response = await fetch(
      `/generated_portraits/ascii/${race}-${className}.txt`
    );
    
    if (response.ok) {
      return await response.text();
    }
    
    // Fallback to race-only
    const raceResponse = await fetch(
      `/generated_portraits/ascii/${race}.txt`
    );
    
    if (raceResponse.ok) {
      return await raceResponse.text();
    }
    
    // Fallback to template
    return getTemplatePortrait(race, className);
    
  } catch (error) {
    console.error('Portrait loading error:', error);
    return getTemplatePortrait(race, className);
  }
}

function getTemplatePortrait(race, className) {
  return `
    [${race} ${className}]
    
       ___
      /   \\
     | o o |
     |  >  |
     | \\_/ |
      \\___/
  `;
}
```

## Example 11: Monitoring Progress

Check progress while generating:

```bash
# In one terminal
python generate_all_portraits.py --create-js

# In another terminal, monitor progress
watch -n 5 'ls generated_portraits/ascii/ | wc -l'

# Or check the manifest
watch -n 10 'cat generated_portraits/manifest.json | grep successful'
```

## Example 12: CI/CD Integration

Add to your deployment pipeline:

```yaml
# .github/workflows/generate-portraits.yml
name: Generate Portraits

on:
  workflow_dispatch:  # Manual trigger
    inputs:
      force:
        description: 'Force regenerate'
        required: false
        default: 'false'

jobs:
  generate:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    
    - name: Install dependencies
      run: |
        cd scripts
        pip install -r requirements.txt
    
    - name: Generate portraits
      env:
        OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      run: |
        cd scripts
        python generate_all_portraits.py --create-js
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: portraits
        path: generated_portraits/
```

## Summary

These examples show how flexible the portrait generation system is:

✅ **One-time generation** - Generate once, use forever  
✅ **Custom styles** - Easily modify prompts  
✅ **Different sizes** - Adjust for your needs  
✅ **Flexible integration** - Multiple ways to use  
✅ **Error handling** - Graceful fallbacks  
✅ **Progressive loading** - Optimize performance  
✅ **CI/CD ready** - Automate in pipelines  

Pick the approach that works best for your project! 🎨


