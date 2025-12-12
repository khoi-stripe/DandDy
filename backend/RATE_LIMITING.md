# AI Rate Limiting System

## Overview

The DandDy API now uses **user-based rate limiting** for all AI endpoints. This system:

- ✅ **Tracks by user ID** for authenticated users (more accurate than IP)
- ✅ **Falls back to IP** for anonymous users
- ✅ **Exempts admins** from all rate limits
- ✅ **Bypasses limits in development mode** for easier testing
- ✅ **Enforces limits in production** for cost control

## Rate Limit Configuration

Rate limits are configured via environment variables in your `.env` file:

```bash
# Rate limiting (per-user limits)
MAX_REQUESTS_PER_USER_PER_MINUTE=10
MAX_REQUESTS_PER_USER_PER_DAY=100
```

### Default Limits

- **Per-minute**: 10 requests
- **Per-day**: 100 requests
- **Character summary cooldown**: 20 seconds

## Development vs Production

### Development Mode (Local Testing)

When `PRODUCTION` environment variable is **NOT set**:
- ✅ **All rate limits are bypassed**
- ✅ All users can make unlimited requests
- ✅ Perfect for local development and testing

### Production Mode

When `PRODUCTION=true`:
- ⚠️ Rate limits are **enforced** for all non-admin users
- ✅ Admins still bypass rate limits
- 💰 Protects your OpenAI API costs

## Admin Exemption

### How to Make Yourself Admin

Admin users bypass ALL rate limits in both development and production. To make yourself an admin:

#### Option 1: Direct Database Update (SQLite)

```bash
cd backend
sqlite3 danddy.db
```

```sql
-- Find your user ID
SELECT id, email, role FROM users WHERE email = 'your@email.com';

-- Make yourself admin
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';

-- Verify
SELECT id, email, role FROM users WHERE email = 'your@email.com';

-- Exit
.quit
```

#### Option 2: Direct Database Update (PostgreSQL/Supabase)

Using your database client (pgAdmin, DBeaver, or Supabase SQL Editor):

```sql
-- Find your user ID
SELECT id, email, role FROM users WHERE email = 'your@email.com';

-- Make yourself admin
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';

-- Verify
SELECT id, email, role FROM users WHERE email = 'your@email.com';
```

#### Option 3: Python Script

Create a script `backend/make_admin.py`:

```python
from database.database import SessionLocal
from models.user import User, UserRole

def make_admin(email: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"❌ User not found: {email}")
            return
        
        user.role = UserRole.ADMIN
        db.commit()
        print(f"✅ {email} is now an admin!")
    finally:
        db.close()

if __name__ == "__main__":
    make_admin("your@email.com")  # Replace with your email
```

Run it:
```bash
cd backend
python make_admin.py
```

## How It Works

### User Identification

```python
def get_client_id(request: Request, user: Optional[User] = None) -> str:
    """
    Authenticated users: "user:{user_id}"
    Anonymous users: "ip:{ip_address}"
    """
    if user:
        return f"user:{user.id}"
    return f"ip:{request.client.host}"
```

### Rate Limit Check

```python
def check_rate_limit(client_id: str, user: Optional[User] = None):
    """
    1. Skip if user is admin
    2. Skip if in development mode
    3. Otherwise enforce per-minute and per-day limits
    """
    if user and user.role == UserRole.ADMIN:
        print(f"⚡ Rate limit bypassed for admin user: {user.email}")
        return
    
    if not os.getenv("PRODUCTION"):
        print(f"🔧 Rate limit bypassed in development mode for: {client_id}")
        return
    
    # Enforce limits...
```

### Frontend Integration

The frontend should include the JWT token in requests to get user-based rate limiting:

```javascript
// Example: Fetch with authentication
const response = await fetch('http://localhost:8000/api/ai/images/generate', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
    },
    body: JSON.stringify({
        prompt: 'A mighty dwarf warrior',
        model: 'dall-e-3'
    })
});
```

## Rate Limit Responses

### Success (Under Limit)

```json
{
    "success": true,
    "url": "https://...",
    "model": "dall-e-3"
}
```

### Per-Minute Limit Exceeded

```json
{
    "detail": "Rate limit exceeded. Max 10 requests per minute."
}
```
Status: `429 Too Many Requests`

### Per-Day Limit Exceeded

```json
{
    "detail": "Daily rate limit exceeded. Max 100 requests per day."
}
```
Status: `429 Too Many Requests`

### Character Generation Cooldown

```json
{
    "detail": "Character generation is cooling down. Please wait about 15 more seconds before starting a new AI-assisted character."
}
```
Status: `429 Too Many Requests`

## Benefits

### For Development
- 🚀 **No friction** - unlimited requests while testing
- 🔧 **Easy debugging** - no rate limit interference
- 💻 **Fast iteration** - test AI features freely

### For Production
- 💰 **Cost control** - prevents abuse and runaway costs
- 👥 **Fair usage** - per-user tracking prevents single user monopolization
- 🛡️ **Admin access** - you're never blocked while testing in production
- 📊 **User-based analytics** - better insights into usage patterns

### Security
- ✅ **Backend enforcement** - cannot be bypassed by frontend manipulation
- ✅ **Proper authentication** - uses JWT tokens
- ✅ **Granular control** - different limits per user role
- ✅ **IP fallback** - still tracks anonymous users

## Testing the System

### Test as Regular User

1. Register a new account (non-admin)
2. Make 11 requests within 1 minute
3. Should get rate limited on the 11th request

### Test as Admin

1. Make yourself admin (see above)
2. Make unlimited requests
3. Should never get rate limited

### Test Development Mode

1. Ensure `PRODUCTION` is NOT set in `.env`
2. Make unlimited requests as any user
3. Should see bypass logs in console:
```
🔧 Rate limit bypassed in development mode for: user:1
```

### Test Production Mode

1. Set `PRODUCTION=true` in `.env`
2. Restart the backend
3. Admin users still unlimited
4. Regular users get rate limited

## Monitoring

The system logs rate limit events:

```bash
# Admin bypass
⚡ Rate limit bypassed for admin user: admin@example.com

# Development bypass
🔧 Rate limit bypassed in development mode for: user:5

# OpenAI rate limits (tracked separately)
[OPENAI RATE DEBUG] {"event":"openai.rate_debug","kind":"images.generate",...}
```

## Future Improvements

Potential enhancements:
- 📊 Redis/database storage (currently in-memory)
- 🎯 Per-feature rate limits (different limits for images vs chat)
- 👥 Role-based tiers (DM role gets higher limits)
- 📈 Usage analytics dashboard
- 🔔 Rate limit warnings before hitting the limit

## Troubleshooting

### "Rate limit exceeded" but you're admin

1. Check your user role in database:
```sql
SELECT email, role FROM users WHERE email = 'your@email.com';
```

2. Make sure you're sending the auth token:
```javascript
'Authorization': `Bearer ${your_token}`
```

3. Check backend logs for bypass message

### Rate limits not working in production

1. Verify `PRODUCTION=true` in `.env`
2. Restart backend after changing env vars
3. Check logs for "DEVELOPMENT MODE" messages (shouldn't appear)

### Frontend not getting rate-limited behavior

1. Frontend should handle 429 responses
2. Check that auth token is being sent
3. Verify token is valid (not expired)

## Questions?

This system provides a balance between developer convenience and production cost control. You get:
- 🔓 **Unrestricted development**
- 🛡️ **Protected production**
- ⚡ **Admin superpowers**
- 👥 **Fair user limits**

