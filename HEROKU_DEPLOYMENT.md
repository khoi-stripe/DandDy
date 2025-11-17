# 🚀 Heroku Deployment Guide - Secure Setup

## 🔒 Security Model

**Your API key is SAFE because:**
1. ✅ API key stored as Heroku environment variable (never in code)
2. ✅ `.env` file is in `.gitignore` (never committed to Git)
3. ✅ Backend has rate limiting to prevent abuse
4. ✅ CORS configured to only allow your domain
5. ✅ All API calls go through your secure backend proxy

## 📋 Prerequisites

1. Create a free Heroku account: https://signup.heroku.com/
2. Install Heroku CLI: `brew tap heroku/brew && brew install heroku`
3. Have your OpenAI API key ready

## 🚀 Deployment Steps

### 1. Login to Heroku
```bash
heroku login
```

### 2. Create Heroku App
```bash
cd backend
heroku create danddy-api  # Or choose your own name
```

### 3. Set Environment Variables (SECURE - not in code!)
```bash
# Required: OpenAI API Key
heroku config:set OPENAI_API_KEY=your-actual-openai-key-here

# Required: Security
heroku config:set SECRET_KEY=$(openssl rand -hex 32)
heroku config:set ALGORITHM=HS256
heroku config:set ACCESS_TOKEN_EXPIRE_MINUTES=30

# Required: Database (SQLite for free tier)
heroku config:set DATABASE_URL=sqlite:///./danddy.db

# Required: CORS (update with your GitHub Pages URL)
heroku config:set ALLOWED_ORIGINS=https://khoi-stripe.github.io
heroku config:set PRODUCTION=true

# Optional: Rate Limiting
heroku config:set MAX_REQUESTS_PER_USER_PER_MINUTE=10
heroku config:set MAX_REQUESTS_PER_USER_PER_DAY=100
```

### 4. Deploy to Heroku
```bash
# Make sure you're in the backend directory
git init  # If not already a git repo
git add .
git commit -m "Initial Heroku deployment"

# Push to Heroku (this deploys the app)
git push heroku main
```

### 5. Verify Deployment
```bash
# Check if app is running
heroku ps

# View logs
heroku logs --tail

# Test the API
curl https://your-app-name.herokuapp.com/health
```

### 6. Update Frontend Config

After deployment, you'll get a URL like: `https://danddy-api.herokuapp.com`

Update `character-builder/character-builder-config.js`:
```javascript
BACKEND_URL: isLocalDevelopment 
  ? 'http://localhost:8000' 
  : 'https://your-app-name.herokuapp.com',
```

### 7. Push Frontend Changes
```bash
cd ..  # Back to root
git add character-builder/character-builder-config.js
git commit -m "Update backend URL for production"
git push origin main
```

## 🔍 Verify Everything Works

1. Visit your GitHub Pages site
2. Create a character
3. Click "✨ Custom AI Portrait"
4. Should generate without errors!

## 🔐 Security Checklist

- ✅ `.env` file is in `.gitignore`
- ✅ API key set as Heroku config var (not in code)
- ✅ CORS restricted to your domain only
- ✅ Rate limiting enabled
- ✅ PRODUCTION=true set on Heroku

## 💰 Cost

**FREE on Heroku!** 
- 550-1000 dyno hours/month free
- Your app will "sleep" after 30 min of inactivity
- First request after sleep takes ~10-15 seconds to wake up

## 🆘 Troubleshooting

### Check Logs
```bash
heroku logs --tail
```

### Restart App
```bash
heroku restart
```

### Check Environment Variables
```bash
heroku config
```

### Test Backend Directly
```bash
curl https://your-app-name.herokuapp.com/api/ai/status
```

Should return:
```json
{"available": true, "model": "gpt-3.5-turbo"}
```

## 📝 Notes

- Never commit `.env` files
- Never hardcode API keys
- Keep `PRODUCTION=true` on Heroku
- Update `ALLOWED_ORIGINS` if you change your domain

