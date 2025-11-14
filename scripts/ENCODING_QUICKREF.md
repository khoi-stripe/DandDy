# ASCII Encoding Quick Reference

## TL;DR

**Problem:** Backslashes (`\`) in ASCII art break JavaScript  
**Solution:** Base64 encode them  
**Status:** ✅ Already implemented  

## Generate Portraits with Fixed Encoding

```bash
cd scripts

# Generate portraits (stores as .txt files)
python3 generate_all_portraits.py --api-key sk-YOUR-KEY

# Generate JavaScript file with Base64 encoding
python3 generate_all_portraits.py --create-js
```

## Test the Encoding

```bash
# Python test
python3 test_ascii_encoding.py

# HTML demo
open test_encoding_demo.html
```

## What Changed?

### Before (Broken)
```javascript
// Direct embedding - backslashes cause issues
const art = `
  /\      ← JavaScript sees this as escape sequence!
 /  \
`;
```

### After (Fixed)
```javascript
// Base64 encoded - no escaping issues
const PORTRAITS_DATA = {
  'elf': 'CiAgL1wKIC8gIFwKL19fX19cCg=='  // ← Safe!
};

const art = atob(PORTRAITS_DATA.elf);  // ← Decodes perfectly
```

## Usage in Your Code

No changes needed! The `portraits.js` file handles encoding/decoding internally:

```javascript
import { getPortrait } from './portraits.js';

const portrait = getPortrait('elf', 'wizard');
console.log(portrait);  // Shows perfect ASCII art
```

## Benefits

✅ No backslash escaping issues  
✅ Works with ALL special characters  
✅ Simple one-line encoding/decoding  
✅ Native browser support (`atob`)  
✅ Only ~33% size overhead  

## Files

- `generate_all_portraits.py` - Generator (uses Base64)
- `test_ascii_encoding.py` - Test script
- `test_encoding_demo.html` - Interactive demo
- `ASCII_ENCODING_FIX.md` - Full documentation

## Need Help?

Read `ASCII_ENCODING_FIX.md` for complete details.

