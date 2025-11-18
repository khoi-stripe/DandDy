#!/usr/bin/env python3
"""
Test script to verify setup before running the full generation
"""

import sys
import os

def test_python_version():
    """Check Python version"""
    print("🐍 Testing Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 8:
        print(f"   ✅ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"   ❌ Python {version.major}.{version.minor}.{version.micro} (need 3.8+)")
        return False

def test_dependencies():
    """Check if required packages are installed"""
    print("\n📦 Testing dependencies...")
    
    required = ['requests', 'PIL', 'numpy']
    all_ok = True
    
    for package in required:
        try:
            if package == 'PIL':
                import PIL
                print(f"   ✅ Pillow {PIL.__version__}")
            elif package == 'requests':
                import requests
                print(f"   ✅ requests {requests.__version__}")
            elif package == 'numpy':
                import numpy
                print(f"   ✅ numpy {numpy.__version__}")
        except ImportError:
            print(f"   ❌ {package} not installed")
            all_ok = False
    
    return all_ok

def test_api_key():
    """Check if API key is set"""
    print("\n🔑 Testing API key...")
    api_key = os.environ.get('OPENAI_API_KEY')
    
    if not api_key:
        print("   ❌ OPENAI_API_KEY not set")
        print("      Set it with: export OPENAI_API_KEY='sk-...'")
        return False
    
    if not api_key.startswith('sk-'):
        print("   ⚠️  API key doesn't start with 'sk-' (might be invalid)")
        return False
    
    print(f"   ✅ API key found (starts with {api_key[:7]}...)")
    return True

def test_directories():
    """Check if output directories can be created"""
    print("\n📁 Testing directory creation...")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'generated_portraits_test')
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        test_file = os.path.join(output_dir, 'test.txt')
        
        with open(test_file, 'w') as f:
            f.write('test')
        
        os.remove(test_file)
        os.rmdir(output_dir)
        
        print(f"   ✅ Can create directories and files")
        return True
    except Exception as e:
        print(f"   ❌ Cannot create directories: {e}")
        return False

def test_image_processing():
    """Test basic image processing capabilities"""
    print("\n🎨 Testing image processing...")
    
    try:
        from PIL import Image
        import numpy as np
        from io import BytesIO
        
        # Create a test image
        img = Image.new('RGB', (100, 100), color='red')
        
        # Test resize
        img_resized = img.resize((50, 50))
        
        # Test grayscale conversion
        img_gray = img.convert('L')
        
        # Test numpy conversion
        arr = np.array(img_gray)
        
        print("   ✅ Image processing works")
        return True
    except Exception as e:
        print(f"   ❌ Image processing error: {e}")
        return False

def test_network():
    """Test network connectivity"""
    print("\n🌐 Testing network connectivity...")
    
    try:
        import requests
        response = requests.get('https://api.openai.com', timeout=5)
        print("   ✅ Can reach OpenAI API")
        return True
    except Exception as e:
        print(f"   ⚠️  Cannot reach OpenAI API: {e}")
        print("      (This might be OK if you're offline)")
        return True  # Don't fail on this

def main():
    """Run all tests"""
    print("=" * 80)
    print("🧪 SETUP VERIFICATION TEST")
    print("=" * 80)
    print("\nThis will verify your setup is ready for portrait generation.\n")
    
    results = {
        'Python version': test_python_version(),
        'Dependencies': test_dependencies(),
        'API key': test_api_key(),
        'Directory access': test_directories(),
        'Image processing': test_image_processing(),
        'Network': test_network()
    }
    
    print("\n" + "=" * 80)
    print("📊 TEST RESULTS")
    print("=" * 80)
    
    for test, passed in results.items():
        status = "✅" if passed else "❌"
        print(f"{status} {test}")
    
    all_passed = all(results.values())
    
    print("\n" + "=" * 80)
    if all_passed:
        print("🎉 ALL TESTS PASSED!")
        print("=" * 80)
        print("\nYou're ready to generate portraits!")
        print("\nNext steps:")
        print("  1. Test with sample: python generate_sample.py --create-js")
        print("  2. Generate all: python generate_all_portraits.py --create-js")
        print("\n" + "=" * 80)
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("=" * 80)
        print("\nPlease fix the issues above before generating portraits.")
        print("\nCommon fixes:")
        print("  • Install dependencies: pip install -r requirements.txt")
        print("  • Set API key: export OPENAI_API_KEY='sk-...'")
        print("  • Check Python version: python --version")
        print("\n" + "=" * 80)
        return 1

if __name__ == '__main__':
    sys.exit(main())



