# 🔐 API Key Security Implementation

**Complete solution for securing OpenAI API keys in your DandDy app**

---

## 📖 Start Here

Choose your path based on how much time you have:

### ⚡ 5 Minute Quick Start
👉 **[QUICKSTART_SECURE_API.md](QUICKSTART_SECURE_API.md)**

Get the secure backend running with 5 simple commands.

### 📚 Complete Guide
👉 **[SECURE_API_GUIDE.md](SECURE_API_GUIDE.md)**

Full documentation with examples, API reference, and production deployment guide.

### 🔍 Understand the Problem
👉 **[SECURITY_COMPARISON.md](SECURITY_COMPARISON.md)**

Visual comparison of insecure vs secure architecture, with real attack examples.

### 📋 Executive Summary
👉 **[API_KEY_SECURITY_SUMMARY.md](API_KEY_SECURITY_SUMMARY.md)**

Overview of what was built and why you need it.

---

## 🗂️ What's Included

### Backend (Secure Server-Side API)

```
backend/
├── routes/ai.py              ✨ NEW - Secure AI proxy with 6 endpoints
├── main.py                   ✅ UPDATED - Added AI router and env loading
├── requirements.txt          ✅ UPDATED - Added openai and httpx
├── env.example               ✨ NEW - Environment config template
└── test_ai_api.py            ✨ NEW - Automated test suite
```

**Features:**
- ✅ Rate limiting (10 req/min, 100 req/day - configurable)
- ✅ Input validation with Pydantic
- ✅ Error handling without leaking secrets
- ✅ Usage tracking for cost monitoring
- ✅ CORS protection

### Frontend (Secure Client)

```
character-builder/
├── character-builder-config.js             ✅ UPDATED - Added BACKEND_URL
└── character-builder-services.js           ✅ UPDATED - Calls the backend proxy (no client-side API keys)
```

**Usage:**
```javascript
// Use AIService (it calls the backend proxy; no browser key required)
const comment = await AIService.generateNarratorComment(context);
const names = await AIService.generateNames('elf', 'wizard', 3);
const backstory = await AIService.generateBackstory(character);
```

### Documentation

```
📖 Documentation/
├── QUICKSTART_SECURE_API.md        ⚡ 5-minute setup guide
├── SECURE_API_GUIDE.md             📚 Complete implementation guide
├── SECURITY_COMPARISON.md          🔍 Before/after visual comparison
├── API_KEY_SECURITY_SUMMARY.md     📋 Executive summary
└── README_API_SECURITY.md          📖 This file!
```

---

## 🚀 Quick Start (Copy & Paste)

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Create and configure .env
cp env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-your-key-here

# 3. Start the backend
uvicorn main:app --reload --port 8000

# 4. Test it (in another terminal)
cd backend
python test_ai_api.py

# 5. Update frontend (in your HTML)
# No extra script tag needed: the app ships via the bundled JS (manager.bundle.js / builder.bundle.js).
# Ensure your frontend config has BACKEND_URL pointing at your backend.
```

**That's it!** Your API keys are now secure. 🎉

---

## 🎯 The Problem This Solves

### Before (Insecure) ❌

```javascript
// API key stored in browser
localStorage.setItem('openai_key', 'sk-abc123...');

// Direct call to OpenAI (key exposed!)
fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': `Bearer sk-abc123...` }
});
```

**Anyone can:**
- Open DevTools → Application → Local Storage → steal your key
- Open DevTools → Network → see your key in requests
- Use browser extensions to exfiltrate your key
- Run up unlimited charges on your OpenAI account

### After (Secure) ✅

```javascript
// NO API key needed in browser!
fetch('http://localhost:8000/api/ai/chat/completion', {
  method: 'POST',
  body: JSON.stringify({ prompt: '...' })
});
```

**Key is safe:**
- Stored in `.env` on server (never exposed to browser)
- Rate limiting prevents abuse
- Input validation prevents exploits
- Easy to rotate without frontend changes

---

## 🛣️ API Endpoints

All endpoints are at `http://localhost:8000/api/ai/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/status` | GET | Check if AI is available |
| `/chat/completion` | POST | Generate text completions |
| `/narrator/comment` | POST | Generate narrator comments |
| `/characters/names` | POST | Generate character names |
| `/characters/backstory` | POST | Generate backstories |
| `/images/generate` | POST | Generate DALL-E images |

**Example:**
```bash
curl -X POST http://localhost:8000/api/ai/characters/names \
  -H "Content-Type: application/json" \
  -d '{"race":"elf", "class_type":"wizard", "count":3}'
```

Response:
```json
{
  "success": true,
  "names": ["Elara Moonwhisper", "Thranduil Starweaver", "Galadriel Brightwood"]
}
```

See [SECURE_API_GUIDE.md](SECURE_API_GUIDE.md) for complete API reference.

---

## 📊 Comparison Table

| Feature | Before | After |
|---------|--------|-------|
| **API Key Location** | localStorage ❌ | .env (server) ✅ |
| **Key Exposure** | Visible in DevTools ❌ | Hidden ✅ |
| **Rate Limiting** | None ❌ | Built-in ✅ |
| **Cost Control** | None ❌ | Per-user limits ✅ |
| **Attack Surface** | Huge ❌ | Minimal ✅ |
| **Key Rotation** | Update all clients ❌ | Change .env only ✅ |

---

## 🧪 Testing

### Automated Tests
```bash
cd backend
python test_ai_api.py
```

You should see:
```
🧪 Testing AI Service Status
✅ AI Service Available: True

🧪 Testing Chat Completion
✅ Success!

🧪 Testing Narrator Comment
✅ Success!
   Comment: "Ah, the classic dwarf. I hope you like ale. ( ._. )"

...

🎉 All tests passed! Your AI API is working perfectly.
```

### Manual Test
```bash
# Terminal 1: Start backend
cd backend
uvicorn main:app --reload

# Terminal 2: Test endpoint
curl http://localhost:8000/api/ai/status
```

---

## 🔧 Configuration

### Environment Variables (backend/.env)

```bash
# Required
OPENAI_API_KEY=sk-your-actual-key-here

# Optional (with defaults)
MAX_REQUESTS_PER_USER_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_DAY=100
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend Config (character-builder-config.js)

```javascript
window.CONFIG = {
  BACKEND_URL: 'http://localhost:8000',  // Point to your backend
  ENABLE_AI: true
};
```

---

## 🛡️ Security Features

### 1. Rate Limiting
Prevent abuse and control costs:
- 10 requests per minute per user (default)
- 100 requests per day per user (default)
- Returns `429 Too Many Requests` when exceeded

### 2. Input Validation
All inputs validated with Pydantic models:
- Length limits on text fields
- Enum validation for options
- Type checking for all parameters

### 3. Error Handling
Graceful error handling:
- OpenAI errors caught and sanitized
- No sensitive information leaked
- Fallback responses for non-critical failures

### 4. CORS Protection
Configurable allowed origins:
```bash
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

---

## 💰 Cost Savings

### Without Rate Limiting
Someone steals your key and generates images:
```
100,000 images × $0.04 = $4,000 💸
```

### With Rate Limiting (100/day)
Even if key is compromised:
```
100 requests × $0.04 = $4/day max 💰
```

Plus you can:
- Block abusive users
- Track usage per user
- Set custom limits
- Get alerted on anomalies

---

## 📈 Migration Path

### Phase 1: Setup Backend (5 min)
1. Install dependencies
2. Create `.env` with API key
3. Start backend
4. Test with `test_ai_api.py`

### Phase 2: Test Integration (10 min)
1. Ensure `BACKEND_URL` points at your backend
2. Test one feature (e.g., narrator comments) using `AIService`
3. Verify it works (no browser API key required)

### Phase 3: Full Migration (30 min)
1. Remove API key input from UI (no longer needed)
2. Remove any localStorage-based API key code
3. Ensure all AI calls go through the backend proxy
4. Test all features

### Phase 4: Cleanup
1. Remove old insecure code
2. Update documentation
3. Deploy to production

---

## 🚀 Production Deployment

### Required
```bash
export OPENAI_API_KEY=sk-prod-key
export SECRET_KEY=random-secret-for-jwt
export ALLOWED_ORIGINS=https://yourdomain.com
```

### Recommended
- Use HTTPS only
- Enable authentication (require login)
- Use Redis for rate limiting
- Monitor usage per user
- Set up billing alerts
- Rotate keys regularly

See [SECURE_API_GUIDE.md](SECURE_API_GUIDE.md) for production deployment guide.

---

## ❓ FAQ

**Q: Is this compatible with my current code?**  
A: Yes. Point the frontend at the backend proxy (`BACKEND_URL`) and keep using `AIService`.

**Q: Do I need to change my frontend?**  
A: Minimal. Remove client-side API key storage/UI and ensure `BACKEND_URL` is set.

**Q: What about the Python portrait generator script?**  
A: That's server-side code, it's fine to use API keys there:
```bash
export OPENAI_API_KEY='sk-...'
python scripts/generate_all_portraits.py
```

**Q: Can I keep using client-side keys?**  
A: Not recommended. It's a major security risk. Anyone can steal your key and run up charges.

**Q: How do I know if someone is abusing my API?**  
A: Check logs, monitor OpenAI dashboard, implement per-user usage tracking.

**Q: What if I want users to use their own keys?**  
A: Store encrypted keys in your database (server-side), associate with user accounts. Never in browser storage.

---

## 📚 Resources

### Internal Documentation
- [QUICKSTART_SECURE_API.md](QUICKSTART_SECURE_API.md) - Get started quickly
- [SECURE_API_GUIDE.md](SECURE_API_GUIDE.md) - Complete implementation
- [SECURITY_COMPARISON.md](SECURITY_COMPARISON.md) - Visual comparison
- [API_KEY_SECURITY_SUMMARY.md](API_KEY_SECURITY_SUMMARY.md) - Overview

### External Resources
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)

---

## 🎉 What You Get

✅ **Complete secure backend implementation**  
✅ **Rate limiting and cost control**  
✅ **Drop-in frontend service wrapper**  
✅ **Automated test suite**  
✅ **Comprehensive documentation**  
✅ **Production deployment guide**  
✅ **Security best practices**

---

## 🏁 Next Steps

1. **Read** [QUICKSTART_SECURE_API.md](QUICKSTART_SECURE_API.md)
2. **Setup** backend (5 minutes)
3. **Test** with `python test_ai_api.py`
4. **Integrate** frontend gradually
5. **Deploy** to production

---

**🔒 Remember:** Never trust the client with secrets!

Good luck securing your API keys! 🚀

