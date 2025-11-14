#!/usr/bin/env python3
"""
Test script to verify ASCII art encoding/decoding works correctly
Tests the Base64 approach for handling backslashes
"""

import base64

# Test ASCII art with problematic characters
TEST_ASCII = r"""
  /\
 /  \
/____\
|    |
| /\ |
|/  \|
------
"""

def test_base64_encoding():
    """Test Base64 encoding approach"""
    print("="*80)
    print("Testing Base64 Encoding for ASCII Art")
    print("="*80)
    
    print("\n1. Original ASCII art:")
    print(TEST_ASCII)
    
    print("\n2. Encoding to Base64...")
    encoded = base64.b64encode(TEST_ASCII.encode('utf-8')).decode('ascii')
    print(f"   Encoded length: {len(encoded)} characters")
    print(f"   Encoded (first 80 chars): {encoded[:80]}...")
    
    print("\n3. Decoding from Base64...")
    decoded = base64.b64decode(encoded).decode('utf-8')
    print(f"   Decoded successfully!")
    
    print("\n4. Comparing original vs decoded:")
    if TEST_ASCII == decoded:
        print("   ✅ MATCH! Encoding/decoding works perfectly.")
    else:
        print("   ❌ MISMATCH! There's a problem.")
        print(f"   Original length: {len(TEST_ASCII)}")
        print(f"   Decoded length: {len(decoded)}")
    
    print("\n5. Generating JavaScript code snippet:")
    js_code = f"""
// This is what the generated JavaScript would look like:
const PORTRAITS_DATA = {{
  test: '{encoded}'
}};

function decodeAscii(base64) {{
  try {{
    return atob(base64);
  }} catch (e) {{
    console.error('Failed to decode ASCII art:', e);
    return '';
  }}
}}

const PORTRAITS = {{
  test: decodeAscii(PORTRAITS_DATA.test)
}};

// Usage:
console.log(PORTRAITS.test);
"""
    print(js_code)
    
    print("\n" + "="*80)
    print("✅ Test completed successfully!")
    print("="*80)

def test_old_escaping_approach():
    """Test the old escaping approach to show the problem"""
    print("\n" + "="*80)
    print("Testing OLD Escaping Approach (for comparison)")
    print("="*80)
    
    print("\n1. Original ASCII art:")
    print(TEST_ASCII)
    
    print("\n2. Applying JavaScript escaping...")
    escaped = TEST_ASCII.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    print("   Escaped version:")
    print(escaped)
    
    print("\n3. This escaped version would go into JavaScript like:")
    js_code = f"const art = `{escaped}`;"
    print(f"   {js_code[:100]}...")
    
    print("\n⚠️  Note: The old approach requires careful escaping")
    print("   Base64 encoding is more robust!")
    print("="*80)

if __name__ == '__main__':
    test_base64_encoding()
    test_old_escaping_approach()
    
    print("\n" + "="*80)
    print("📝 Summary:")
    print("="*80)
    print("✅ Base64 encoding approach:")
    print("   - No escaping issues with backslashes")
    print("   - No issues with special characters")
    print("   - Slightly larger file size (33% overhead)")
    print("   - Very simple and robust")
    print("\n❌ Old escaping approach:")
    print("   - Must escape: \\ ` ${")
    print("   - Risk of edge cases and parsing errors")
    print("   - Smaller file size")
    print("\n🎯 Recommendation: Use Base64 encoding")
    print("="*80)

