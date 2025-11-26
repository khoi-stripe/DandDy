# 🚀 Quick Start: Secure API Setup (5 Minutes)

Get your DandDy app using secure API keys in 5 minutes!

## Step 1: Install Dependencies (1 min)

```bash
cd backend
pip install -r requirements.txt
```

## Step 2: Create `.env` File (1 min)

```bash
cd backend
cp env.example .env
```

Edit `.env` and add your OpenAI API key:

```bash
OPENAI_API_KEY=sk-your-actual-key-here
```

**Get your key:** https://platform.openai.com/api-keys

## Step 3: Start Backend (1 min)

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

## Step 4: Test It (1 min)

```bash
# In a new terminal
cd backend
python test_ai_api.py
```

You should see all tests pass! ✅

## Step 5: Use in Frontend (1 min)

### Option A: Use the secure service wrapper

Add to your HTML:
```html
<script src="character-builder-services-secure.js"></script>
```

Replace calls to `AIService` with `SecureAIService`:

```javascript
// OLD (insecure)
const comment = await AIService.generateNarratorComment(context);

// NEW (secure)
const comment = await SecureAIService.generateNarratorComment(context);
```

### Option B: Direct fetch calls

```javascript
const response = await fetch('http://localhost:8000/api/ai/chat/completion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "Generate a dwarf name",
    max_tokens: 100
  })
});
const data = await response.json();
console.log(data.content);
```

## 🎉 Done!

Your API keys are now secure! They never leave the server.

---

## What Changed?

### ❌ BEFORE (Insecure)
- API key in localStorage: `localStorage.setItem('openai_key', 'sk-...')`
- Direct calls: `fetch('https://api.openai.com/...')`
- Key visible in DevTools and network tab

### ✅ AFTER (Secure)
- API key in server `.env`: `OPENAI_API_KEY=sk-...`
- Proxied calls: `fetch('http://localhost:8000/api/ai/...')`
- Key never exposed to browser

---

## Available Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ai/status` | Check if AI is available |
| `POST /api/ai/chat/completion` | Generate text completions |
| `POST /api/ai/narrator/comment` | Generate narrator comments |
| `POST /api/ai/characters/names` | Generate character names |
| `POST /api/ai/characters/backstory` | Generate backstories |
| `POST /api/ai/images/generate` | Generate DALL-E images |

See `SECURE_API_GUIDE.md` for full documentation.

---

## Troubleshooting

### "OpenAI API key required"
Make sure `.env` exists and has `OPENAI_API_KEY=sk-...`

### "Cannot connect to backend"
Make sure backend is running: `uvicorn main:app --reload`

### "Rate limit exceeded"
Adjust limits in `.env`:
```bash
MAX_REQUESTS_PER_USER_PER_MINUTE=20
```

### "CORS error"
Add your frontend URL to `.env`:
```bash
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Next Steps

1. ✅ Test with `python test_ai_api.py`
2. ✅ Update frontend to use secure endpoints
3. ✅ Remove API key input from UI (no longer needed!)
4. 📖 Read `SECURE_API_GUIDE.md` for production deployment

**Need help?** Check `SECURE_API_GUIDE.md` for detailed examples.

