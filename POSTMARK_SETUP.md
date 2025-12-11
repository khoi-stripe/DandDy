# Postmark Password Reset Setup Guide

## ✅ What's Already Implemented

Your password reset flow is **fully implemented**:
- ✅ Backend: Email service with Postmark API integration
- ✅ Backend: `/auth/password/forgot` and `/auth/password/reset` endpoints
- ✅ Frontend: Password reset modal with token auto-fill from email links
- ✅ Security: Non-enumeration, generic responses, background email tasks

## 🔧 Configuration Required

### 1. Local Development Setup

Add these to your `backend/.env` file:

```bash
# Postmark Configuration
POSTMARK_SERVER_TOKEN=your-postmark-server-token-here
EMAIL_FROM=no-reply@danddy.app
EMAIL_REPLY_TO=

# Frontend URL for reset links (local development)
FRONTEND_RESET_BASE=http://localhost:8080/index.html
```

**Where to get your Postmark Server Token:**
1. Log in to your Postmark account
2. Go to your Server (e.g., "DandDy-dev")
3. Click on "API Tokens" 
4. Copy the "Server API token"

**Where to get your EMAIL_FROM:**
- Use the verified sender email you set up in Postmark (e.g., `no-reply@danddy.app`)
- Make sure it's verified in Postmark before using it

### 2. Production Setup (Render)

I've already updated your `render.yaml` with the email configuration. Now you need to:

1. **Go to Render Dashboard** → Your `danddy-api` service → Environment

2. **Add these environment variables:**

   - **POSTMARK_SERVER_TOKEN**
     - Value: Your Postmark Server API token
     - Keep this secret! (Already configured with `sync: false`)

   - **EMAIL_FROM**
     - Already set to: `no-reply@danddy.app`
     - Change if you're using a different verified sender

   - **FRONTEND_RESET_BASE**
     - Already set to: `https://khoi-stripe.github.io/danddy/index.html`
     - This is where users will be redirected from the email link

3. **Save and redeploy** your service

---

## 🧪 Testing the Flow

### Local Testing (Development)

1. **Start your backend:**
   ```bash
   cd backend
   source venv/bin/activate
   python main.py
   ```

2. **Test the forgot password endpoint:**
   ```bash
   curl -X POST http://localhost:8000/api/auth/password/forgot \
     -H "Content-Type: application/json" \
     -d '{"email": "your-test-email@example.com"}'
   ```

3. **Check the response:**
   - In development (no `PRODUCTION` env var), you'll get:
     ```json
     {
       "message": "If an account with that email exists...",
       "debug_reset_token": "eyJ...",
       "reset_url": "http://localhost:8080/index.html#reset-token=eyJ..."
     }
     ```

4. **Visit the reset_url:**
   - Open the `reset_url` in your browser
   - The password reset modal should automatically open
   - The reset token should be pre-filled
   - Enter a new password and submit

5. **Verify you can log in** with the new password

### Production Testing

1. **Deploy to Render** with the environment variables configured

2. **Request a password reset:**
   ```bash
   curl -X POST https://your-api.onrender.com/api/auth/password/forgot \
     -H "Content-Type: application/json" \
     -d '{"email": "your-real-email@example.com"}'
   ```

3. **Check the response:**
   - In production, you should ONLY see:
     ```json
     {
       "message": "If an account with that email exists, a password reset link has been sent."
     }
   ```
   - **NO debug_reset_token or reset_url should be exposed!**

4. **Check your email:**
   - You should receive an email from Postmark
   - Click the link in the email
   - The password reset modal should open with the token pre-filled
   - Complete the password reset

5. **Verify you can log in** with the new password

---

## 🔒 Security Checklist

- [x] Reset tokens are JWT-based with 1-hour expiration
- [x] Production never returns tokens in HTTP responses
- [x] Generic messages prevent email enumeration
- [x] Email sending happens in background tasks (non-blocking)
- [x] URL hash fragments don't appear in server logs
- [x] Token is removed from browser URL bar after auto-fill
- [ ] Consider adding rate limiting to `/auth/password/forgot` (future enhancement)

---

## 📧 Email Template

The email sent to users will look like this:

**Subject:** Reset your DandDy password

**Body:**
```
Someone requested a password reset for your DandDy account.

If this was you, click the link below to set a new password:
https://khoi-stripe.github.io/danddy/index.html#reset-token=eyJ...

If you did not request this, you can safely ignore this email.
```

---

## 🐛 Troubleshooting

### Email not sending locally?

1. Check that `POSTMARK_SERVER_TOKEN` and `EMAIL_FROM` are set in `.env`
2. Check backend logs for error messages starting with ⚠️ or ❌
3. Verify your Postmark sender is verified
4. Make sure you're not in Postmark sandbox mode (or use @danddy.app recipient)

### Email not sending in production?

1. Check Render environment variables are set correctly
2. Check Render logs for Postmark API errors
3. Verify `PRODUCTION=true` is set in Render
4. Check Postmark dashboard for failed sends

### Reset token not working?

1. Check that the token hasn't expired (1 hour lifetime)
2. Verify `SECRET_KEY` matches between token creation and verification
3. Check for JWT decode errors in backend logs

---

## 🎯 Next Steps (Optional)

Consider these enhancements:
- Rate limiting on `/auth/password/forgot` (per-IP and per-email)
- "Password changed" notification email
- Custom email templates in Postmark
- Email analytics and tracking

