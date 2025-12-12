# Rate Limiting Quick Start 🚀

## TL;DR

✅ **Development Mode**: All rate limits are OFF (unlimited requests)  
✅ **Admin Users**: Bypass all rate limits in any mode  
✅ **Production Mode**: Regular users get rate limited  

## 3-Step Setup

### 1️⃣ Make Yourself Admin (Optional but Recommended)

```bash
cd backend
python make_admin.py your@email.com
```

Or list all users first:
```bash
python make_admin.py --list
```

### 2️⃣ Development Mode (Default)

Your `.env` file:
```bash
# DO NOT set PRODUCTION for local dev
# PRODUCTION=true  # ← Keep this commented out!

# Rate limits (only enforced in production for non-admins)
MAX_REQUESTS_PER_USER_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_DAY=100
```

**Result**: Unlimited requests for everyone 🎉

### 3️⃣ Production Mode (Deploy)

Your `.env` file on production server:
```bash
# Enable production mode
PRODUCTION=true

# Rate limits (enforced for non-admins)
MAX_REQUESTS_PER_USER_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_DAY=100
```

**Result**: 
- Regular users: Limited to 10/min, 100/day
- Admin users (you): Unlimited 🎉

## Quick Test

### Test Your Setup

```bash
cd backend
python -c "
from database.database import SessionLocal
from models.user import User

db = SessionLocal()
user = db.query(User).filter(User.email == 'your@email.com').first()
if user:
    print(f'✅ Found: {user.email} (role: {user.role.value})')
    if user.role.value == 'admin':
        print('🎉 You are an ADMIN - no rate limits!')
    else:
        print('👤 You are a {user.role.value} - rate limits apply in production')
else:
    print('❌ User not found')
db.close()
"
```

## What Changed?

### Before
- ❌ Rate limiting by IP address only
- ❌ Always enforced (annoying during development)
- ❌ No way to bypass for testing

### After
- ✅ Rate limiting by user ID (more accurate)
- ✅ Falls back to IP for anonymous users
- ✅ **Automatically disabled in development mode**
- ✅ **Admins bypass in any mode**
- ✅ **Configurable per environment**

## Frontend Usage

No changes required! But for best results, make sure your frontend sends auth tokens:

```javascript
// Good: Gets user-based rate limiting
fetch('/api/ai/images/generate', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
})

// Still works: Falls back to IP-based limiting
fetch('/api/ai/images/generate', {
    headers: {
        'Content-Type': 'application/json'
    }
})
```

## Logs to Expect

### Development Mode (You'll see this a lot)
```
🔧 Rate limit bypassed in development mode for: user:1
🔧 Rate limit bypassed in development mode for: ip:127.0.0.1
```

### Production Mode - Admin User
```
⚡ Rate limit bypassed for admin user: admin@example.com
```

### Production Mode - Regular User
```
(No logs unless they hit the limit)
```

### Rate Limit Hit (Production Only)
```
HTTP 429: Rate limit exceeded. Max 10 requests per minute.
```

## Common Scenarios

### Scenario 1: Local Development
```bash
# No PRODUCTION in .env
```
**You**: Unlimited requests ✅  
**Other users**: Unlimited requests ✅  
**Perfect for**: Testing, debugging, development

### Scenario 2: Production Testing (You Only)
```bash
# In .env
PRODUCTION=true
```
**You (admin)**: Unlimited requests ✅  
**Other users**: Rate limited ⚠️  
**Perfect for**: Testing production config without limits

### Scenario 3: Public Production
```bash
# In .env
PRODUCTION=true
```
**You (admin)**: Unlimited requests ✅  
**Regular users**: 10/min, 100/day ⚠️  
**Perfect for**: Cost control, preventing abuse

## Troubleshooting

### "I'm getting rate limited during development!"

Check your `.env`:
```bash
# This should NOT be set:
# PRODUCTION=true

# Remove it or comment it out!
```

Restart your backend.

### "I'm admin but still getting rate limited!"

1. Verify you're actually admin:
```bash
cd backend
python make_admin.py --list
```

2. Make sure you're sending the auth token in your requests

3. Check backend logs for bypass messages

### "Rate limits aren't working in production!"

1. Verify `PRODUCTION=true` in your production `.env`
2. Restart the backend
3. Test with a non-admin account
4. Check logs (should NOT see "development mode" messages)

## Need More Info?

See `RATE_LIMITING.md` for the complete documentation.

---

**Summary**: Development is now easy (no limits), production is safe (limited for users, unlimited for you) 🎉

