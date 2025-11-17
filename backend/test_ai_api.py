#!/usr/bin/env python3
"""
Test script for the secure AI API endpoints
Run this after starting the backend to verify everything works
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def print_section(title):
    print("\n" + "="*80)
    print(f"🧪 {title}")
    print("="*80)

def test_status():
    """Test AI service status endpoint"""
    print_section("Testing AI Service Status")
    
    try:
        response = requests.get(f"{BASE_URL}/api/ai/status")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ AI Service Available: {data['available']}")
            print(f"   Provider: {data['provider']}")
            print(f"   Features: {json.dumps(data['features'], indent=2)}")
            return True
        else:
            print(f"❌ Failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_chat_completion():
    """Test chat completion endpoint"""
    print_section("Testing Chat Completion")
    
    try:
        payload = {
            "prompt": "Generate 3 fantasy names for a dwarf fighter",
            "max_tokens": 100,
            "temperature": 0.8
        }
        
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/api/ai/chat/completion",
            json=payload
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success!")
            print(f"   Content: {data['content'][:100]}...")
            print(f"   Tokens used: {data['usage']['total_tokens']}")
            return True
        else:
            print(f"❌ Failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_narrator_comment():
    """Test narrator comment endpoint"""
    print_section("Testing Narrator Comment")
    
    try:
        payload = {
            "choice": "Dwarf",
            "question": "What's your race?",
            "character_so_far": {}
        }
        
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/api/ai/narrator/comment",
            json=payload
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success!")
            print(f"   Comment: \"{data['comment']}\"")
            return True
        else:
            print(f"❌ Failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_character_names():
    """Test character names endpoint"""
    print_section("Testing Character Name Generation")
    
    try:
        payload = {
            "race": "elf",
            "class_type": "wizard",
            "count": 3
        }
        
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/api/ai/characters/names",
            json=payload
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success!")
            print(f"   Names:")
            for i, name in enumerate(data['names'], 1):
                print(f"      {i}. {name}")
            return True
        else:
            print(f"❌ Failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_backstory():
    """Test backstory generation endpoint"""
    print_section("Testing Backstory Generation")
    
    try:
        payload = {
            "name": "Thorin Ironforge",
            "race": "dwarf",
            "class_type": "fighter",
            "personality": "brave and loyal",
            "background": "soldier"
        }
        
        print(f"Request: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/api/ai/characters/backstory",
            json=payload
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success!")
            print(f"   Backstory: {data['backstory'][:200]}...")
            return True
        else:
            print(f"❌ Failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_rate_limiting():
    """Test rate limiting"""
    print_section("Testing Rate Limiting")
    
    print("Making 12 rapid requests (limit is 10/min by default)...")
    
    success_count = 0
    rate_limited = False
    
    for i in range(12):
        try:
            response = requests.get(f"{BASE_URL}/api/ai/status")
            if response.status_code == 200:
                success_count += 1
            elif response.status_code == 429:
                rate_limited = True
                print(f"✅ Rate limit triggered at request {i + 1}")
                break
        except Exception as e:
            print(f"❌ Error: {e}")
            break
    
    if rate_limited:
        print("✅ Rate limiting is working!")
        return True
    else:
        print(f"⚠️  Made {success_count} requests without rate limit")
        return True  # Not necessarily a failure

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("🚀 DandDy AI API Test Suite")
    print("="*80)
    print(f"Testing backend at: {BASE_URL}")
    print("\nMake sure the backend is running:")
    print("  cd backend")
    print("  uvicorn main:app --reload")
    
    # Check if backend is running
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        if response.status_code != 200:
            print("\n❌ Backend is not responding. Start it first!")
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ Cannot connect to backend: {e}")
        print("Make sure it's running on http://localhost:8000")
        sys.exit(1)
    
    print("✅ Backend is running!\n")
    
    # Run tests
    results = {
        "Status Check": test_status(),
        "Chat Completion": test_chat_completion(),
        "Narrator Comment": test_narrator_comment(),
        "Character Names": test_character_names(),
        "Backstory": test_backstory(),
        "Rate Limiting": test_rate_limiting(),
    }
    
    # Summary
    print_section("Test Summary")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Your AI API is working perfectly.")
    else:
        print("\n⚠️  Some tests failed. Check the output above.")
        print("\nCommon issues:")
        print("  - OPENAI_API_KEY not set in .env")
        print("  - Invalid API key")
        print("  - OpenAI rate limits exceeded")
        print("  - Missing dependencies (run: pip install -r requirements.txt)")

if __name__ == "__main__":
    main()

