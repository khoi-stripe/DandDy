# 🔐 Secure API Key Usage Guide

This guide explains how to safely use API keys in the DandDy application.

## 🚨 The Problem

**BEFORE (Insecure):**
- ❌ API keys stored in browser localStorage
- ❌ Direct API calls from frontend JavaScript to OpenAI
- ❌ Keys visible in DevTools and network requests
- ❌ Anyone can steal your key and run up charges

**AFTER (Secure):**
- ✅ API keys stored server-side in environment variables
- ✅ Frontend calls your backend, backend calls OpenAI
- ✅ Keys never exposed to the browser
- ✅ Built-in rate limiting to prevent abuse

## 🏗️ Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Browser   │ ---> │   Backend   │ ---> │  OpenAI API │
│  (Frontend) │      │   (Proxy)   │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
     NO KEY            HAS KEY              VALIDATES KEY
```

## 📋 Setup Instructions

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

New dependencies added:
- `openai` - Official OpenAI Python SDK
- `httpx` - Modern HTTP client for async requests

### 2. Create Environment File

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp env.example .env
```

Edit `.env` and add your real API key:

```bash
# .env
OPENAI_API_KEY=sk-your-actual-openai-key-here
MAX_REQUESTS_PER_USER_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_DAY=100
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**🔒 IMPORTANT: Never commit `.env` to git!**

### 3. Start the Backend

```bash
cd backend
source venv/bin/activate  # or venv/Scripts/activate on Windows
uvicorn main:app --reload --port 8000
```

The backend will now:
- ✅ Load API key from `.env`
- ✅ Expose secure AI endpoints at `/api/ai/*`
- ✅ Apply rate limiting
- ✅ Handle errors gracefully

### 4. Update Frontend to Use Backend

Instead of calling OpenAI directly, call your backend:

**OLD (Insecure):**
```javascript
// DON'T DO THIS
const apiKey = localStorage.getItem('openai_key');
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ ... })
});
```

**NEW (Secure):**
```javascript
// DO THIS
const response = await fetch('http://localhost:8000/api/ai/chat/completion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "Generate a D&D character name",
    max_tokens: 100
  })
});
const data = await response.json();
console.log(data.content);
```

## 🛣️ Available Endpoints

### Check AI Service Status
```http
GET /api/ai/status
```

Response:
```json
{
  "available": true,
  "provider": "openai",
  "features": {
    "chat": true,
    "images": true
  }
}
```

### Generate Chat Completion
```http
POST /api/ai/chat/completion
```

Request:
```json
{
  "prompt": "Generate 3 fantasy names for a dwarf fighter",
  "system_prompt": "You are a creative D&D assistant",
  "max_tokens": 200,
  "temperature": 0.8
}
```

Response:
```json
{
  "success": true,
  "content": "1. Thorin Ironforge\n2. Grimli Stonehelm\n3. Balin Deepdelver",
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 30,
    "total_tokens": 50
  }
}
```

### Generate Character Names
```http
POST /api/ai/characters/names
```

Request:
```json
{
  "race": "elf",
  "class_type": "wizard",
  "count": 3
}
```

Response:
```json
{
  "success": true,
  "names": ["Elara Moonwhisper", "Thranduil Starweaver", "Galadriel Brightwood"]
}
```

### Generate Character Backstory
```http
POST /api/ai/characters/backstory
```

Request:
```json
{
  "name": "Thorin",
  "race": "dwarf",
  "class_type": "fighter",
  "personality": "brave and loyal",
  "background": "soldier"
}
```

Response:
```json
{
  "success": true,
  "backstory": "Thorin Ironforge served in the mountain guard for twenty years..."
}
```

### Generate Narrator Comment
```http
POST /api/ai/narrator/comment
```

Request:
```json
{
  "choice": "dwarf",
  "question": "What's your race?",
  "character_so_far": {}
}
```

Response:
```json
{
  "success": true,
  "comment": "Ah, the classic dwarf. I hope you like ale and grudges. ( ._. )"
}
```

### Generate DALL-E Image
```http
POST /api/ai/images/generate
```

Request:
```json
{
  "prompt": "Fantasy D&D dwarf fighter with heavy armor and a sword",
  "size": "1024x1024",
  "quality": "standard"
}
```

Response:
```json
{
  "success": true,
  "url": "https://oaidalleapiprodscus.blob.core.windows.net/...",
  "revised_prompt": "A detailed fantasy illustration..."
}
```

## 🛡️ Security Features

### 1. Rate Limiting
- **Per minute:** 10 requests (configurable)
- **Per day:** 100 requests (configurable)
- Based on client IP address
- Returns `429 Too Many Requests` when exceeded

### 2. Input Validation
- All inputs are validated with Pydantic models
- Length limits on all text fields
- Enum validation for options like size and quality

### 3. Error Handling
- OpenAI errors are caught and returned as proper HTTP errors
- Sensitive information is never exposed
- Fallback responses for non-critical failures

### 4. Environment Isolation
- API keys stored in `.env` (gitignored)
- Different keys for dev/staging/production
- Easy to rotate keys without code changes

## 🔄 Migration Steps for Existing Code

### Step 1: Update `character-builder-services.js`

Replace the direct OpenAI calls with backend calls:

```javascript
// OLD: Direct OpenAI call
async generateCompletion(prompt, systemPrompt = null) {
  const apiKey = StorageService.getAPIKey();
  const response = await fetch(CONFIG.OPENAI_API_URL, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [...] })
  });
  // ...
}

// NEW: Backend proxy call
async generateCompletion(prompt, systemPrompt = null) {
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/chat/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system_prompt: systemPrompt })
  });
  const data = await response.json();
  return data.success ? data.content : null;
}
```

### Step 2: Update Config

Add backend URL to your config:

```javascript
// character-builder-config.js
const CONFIG = {
  BACKEND_URL: 'http://localhost:8000',
  ENABLE_AI: true,
  // Remove: OPENAI_API_URL, OPENAI_MODEL
};
```

### Step 3: Remove API Key Storage

Since keys are now on the backend, remove:
- API key input fields from settings
- localStorage API key storage
- Any UI that asks users for API keys

## 🚀 Production Deployment

### Environment Variables

Set these on your production server:

```bash
# Required
OPENAI_API_KEY=sk-your-production-key

# Recommended
MAX_REQUESTS_PER_USER_PER_MINUTE=5
MAX_REQUESTS_PER_USER_PER_DAY=50
ALLOWED_ORIGINS=https://yourdomain.com
SECRET_KEY=your-secure-random-secret
```

### Additional Security Measures

1. **Authentication:** Require users to log in before making AI requests
2. **Database-backed rate limiting:** Use Redis instead of in-memory dict
3. **Monitoring:** Track API usage per user for billing/abuse detection
4. **HTTPS only:** Ensure all traffic is encrypted
5. **API key rotation:** Regularly rotate your OpenAI keys

### Example with Authentication

If you want to require login before AI requests:

```python
# routes/ai.py
from utils.auth import get_current_user

@router.post("/chat/completion")
async def chat_completion(
    request: ChatCompletionRequest,
    current_user: User = Depends(get_current_user)  # Require auth
):
    # Use current_user.id for rate limiting
    check_rate_limit(str(current_user.id))
    # ... rest of the code
```

## 📊 Monitoring Usage

Track OpenAI usage to avoid surprise bills:

```python
# Add to routes/ai.py
import json
from datetime import datetime

def log_usage(user_id: str, endpoint: str, tokens: int):
    """Log API usage for monitoring"""
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'user_id': user_id,
        'endpoint': endpoint,
        'tokens': tokens
    }
    # Write to database or file
    with open('api_usage.log', 'a') as f:
        f.write(json.dumps(log_entry) + '\n')
```

Then monitor your logs and OpenAI dashboard regularly.

## ❓ FAQ

**Q: Do I still need to enter an API key in the frontend?**  
A: No! Users never see or interact with API keys. You set it once on the server.

**Q: What if I want to let users provide their own keys?**  
A: Bad idea security-wise, but if needed: Store encrypted keys in database (server-side), never in localStorage.

**Q: How do I test without using real API calls?**  
A: Set `OPENAI_API_KEY=""` in `.env` and the endpoints will return `503 Service Unavailable`. Or add mock responses for testing.

**Q: Can I use this with other AI providers?**  
A: Yes! The backend proxy pattern works with any API. Just swap OpenAI for Google's Gemini, Anthropic's Claude, etc.

**Q: What about the Python script that generates portraits?**  
A: That's fine! It's server-side code. Just use:
```bash
export OPENAI_API_KEY='sk-...'
python scripts/generate_all_portraits.py
```

## 📚 Additional Resources

- [OpenAI API Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [FastAPI Security Guide](https://fastapi.tiangolo.com/tutorial/security/)

---

**🎉 You're all set!** Your API keys are now secure and your users can enjoy AI features without any risk.

