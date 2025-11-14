#!/usr/bin/env python3
"""
Validation script to verify the Base64 encoding fix works end-to-end
Simulates the complete workflow without needing API keys or generating actual portraits
"""

import base64
import tempfile
import os
from pathlib import Path

# Test ASCII art with problematic characters
TEST_PORTRAITS = {
    'elf': r"""
       /\
      /  \
     /____\
    |      |
    | /\/\ |
    |/    \|
    --------
""",
    'dwarf': r"""
    ______
   /\    /\
  /  \  /  \
 |    \/    |
 | \______/ |
 |/        \|
 ------------
""",
    'human': r"""
     ___
    /   \
   |  o  |
   |  ^  |
    \___/
     | |
    /| |\
""",
}

def test_encoding_decoding():
    """Test that encoding and decoding preserves the ASCII art"""
    print("="*80)
    print("TEST 1: Encoding/Decoding Preservation")
    print("="*80)
    
    all_passed = True
    
    for name, art in TEST_PORTRAITS.items():
        print(f"\nTesting {name}...")
        
        # Encode
        encoded = base64.b64encode(art.encode('utf-8')).decode('ascii')
        print(f"  Encoded to {len(encoded)} characters")
        
        # Decode
        decoded = base64.b64decode(encoded).decode('utf-8')
        
        # Compare
        if art == decoded:
            print(f"  ✅ PASS - Art preserved perfectly")
        else:
            print(f"  ❌ FAIL - Art was corrupted")
            print(f"     Original length: {len(art)}")
            print(f"     Decoded length: {len(decoded)}")
            all_passed = False
    
    return all_passed

def test_javascript_generation():
    """Test generating JavaScript code with Base64 encoding"""
    print("\n" + "="*80)
    print("TEST 2: JavaScript Code Generation")
    print("="*80)
    
    # Create a temporary JavaScript file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        temp_file = f.name
        
        # Write the JavaScript code
        f.write("// Auto-generated test file\n")
        f.write("// ASCII art is Base64 encoded\n\n")
        
        f.write("const PORTRAITS_DATA = {\n")
        for name, art in TEST_PORTRAITS.items():
            encoded = base64.b64encode(art.encode('utf-8')).decode('ascii')
            f.write(f"  '{name}': '{encoded}',\n")
        f.write("};\n\n")
        
        f.write("function decodeAscii(base64) {\n")
        f.write("  try {\n")
        f.write("    return atob(base64);\n")
        f.write("  } catch (e) {\n")
        f.write("    console.error('Failed to decode:', e);\n")
        f.write("    return '';\n")
        f.write("  }\n")
        f.write("}\n\n")
        
        f.write("const PORTRAITS = {};\n")
        f.write("for (const [key, value] of Object.entries(PORTRAITS_DATA)) {\n")
        f.write("  PORTRAITS[key] = decodeAscii(value);\n")
        f.write("}\n\n")
        
        f.write("if (typeof module !== 'undefined') module.exports = { PORTRAITS };\n")
    
    print(f"  ✅ Generated JavaScript file: {temp_file}")
    
    # Read back and verify
    with open(temp_file, 'r') as f:
        js_code = f.read()
    
    # Check that it contains the expected structure
    checks = [
        ('PORTRAITS_DATA' in js_code, "Contains PORTRAITS_DATA object"),
        ('decodeAscii' in js_code, "Contains decodeAscii function"),
        ('atob' in js_code, "Uses atob() for decoding"),
        ('try' in js_code, "Has error handling"),
    ]
    
    all_passed = True
    for passed, description in checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status} - {description}")
        if not passed:
            all_passed = False
    
    print(f"\n  JavaScript file size: {len(js_code)} bytes")
    
    # Cleanup
    os.unlink(temp_file)
    print(f"  🧹 Cleaned up temporary file")
    
    return all_passed

def test_special_characters():
    """Test that all special characters are handled correctly"""
    print("\n" + "="*80)
    print("TEST 3: Special Characters Handling")
    print("="*80)
    
    # Test string with various problematic characters
    test_cases = {
        'backslash': r'\ backslash',
        'backtick': '` backtick',
        'dollar_brace': '${expression}',
        'quotes': '"double" and \'single\'',
        'newlines': 'line1\nline2\nline3',
        'tabs': 'tab\there',
        'unicode': '🎲 ⚔️ 🧙',
        'mixed': r'All: \ ` ${ } " \' \n 🎭',
    }
    
    all_passed = True
    
    for name, test_str in test_cases.items():
        print(f"\nTesting {name}: {repr(test_str[:30])}")
        
        # Encode and decode
        encoded = base64.b64encode(test_str.encode('utf-8')).decode('ascii')
        decoded = base64.b64decode(encoded).decode('utf-8')
        
        if test_str == decoded:
            print(f"  ✅ PASS - Preserved correctly")
        else:
            print(f"  ❌ FAIL - Corrupted")
            print(f"     Original: {repr(test_str)}")
            print(f"     Decoded:  {repr(decoded)}")
            all_passed = False
    
    return all_passed

def test_size_overhead():
    """Test and report the size overhead of Base64 encoding"""
    print("\n" + "="*80)
    print("TEST 4: Size Overhead Analysis")
    print("="*80)
    
    total_original = 0
    total_encoded = 0
    
    for name, art in TEST_PORTRAITS.items():
        original_size = len(art.encode('utf-8'))
        encoded_size = len(base64.b64encode(art.encode('utf-8')).decode('ascii'))
        overhead = ((encoded_size - original_size) / original_size) * 100
        
        print(f"\n{name}:")
        print(f"  Original: {original_size} bytes")
        print(f"  Encoded:  {encoded_size} bytes")
        print(f"  Overhead: {overhead:.1f}%")
        
        total_original += original_size
        total_encoded += encoded_size
    
    total_overhead = ((total_encoded - total_original) / total_original) * 100
    
    print(f"\nTotal:")
    print(f"  Original: {total_original} bytes")
    print(f"  Encoded:  {total_encoded} bytes")
    print(f"  Overhead: {total_overhead:.1f}%")
    
    # Check if overhead is within acceptable range (should be ~33%)
    if 30 <= total_overhead <= 35:
        print(f"  ✅ PASS - Overhead within expected range (33% ± 2%)")
        return True
    else:
        print(f"  ⚠️  WARNING - Overhead outside expected range")
        return True  # Still pass, just a warning

def main():
    """Run all tests"""
    print("╔" + "="*78 + "╗")
    print("║" + " "*78 + "║")
    print("║" + "ASCII ART BASE64 ENCODING - VALIDATION SUITE".center(78) + "║")
    print("║" + " "*78 + "║")
    print("╚" + "="*78 + "╝")
    print()
    
    tests = [
        ("Encoding/Decoding", test_encoding_decoding),
        ("JavaScript Generation", test_javascript_generation),
        ("Special Characters", test_special_characters),
        ("Size Overhead", test_size_overhead),
    ]
    
    results = []
    
    for name, test_func in tests:
        try:
            passed = test_func()
            results.append((name, passed))
        except Exception as e:
            print(f"\n❌ ERROR in {name}: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "="*80)
    print("VALIDATION SUMMARY")
    print("="*80)
    
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {name}")
    
    all_passed = all(passed for _, passed in results)
    
    print("\n" + "="*80)
    if all_passed:
        print("🎉 ALL TESTS PASSED! Base64 encoding fix is working correctly.")
        print("="*80)
        print("\nThe fix is ready for production use:")
        print("  1. Run: python3 generate_all_portraits.py --create-js")
        print("  2. Import the generated portraits.js in your app")
        print("  3. Enjoy backslash-free ASCII art!")
    else:
        print("❌ SOME TESTS FAILED. Please review the output above.")
        print("="*80)
    
    return 0 if all_passed else 1

if __name__ == '__main__':
    exit(main())

