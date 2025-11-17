# 🚀 Render Deployment Guide - Secure & Free

## 🔒 Security Model

**Your API key is SAFE because:**
1. ✅ API key stored as Render environment variable (never in code)
2. ✅ `.env` file is in `.gitignore` (never committed to Git)
3. ✅ Backend has rate limiting to prevent abuse
4. ✅ CORS configured to only allow your GitHub Pages domain
5. ✅ All API calls go through your secure backend proxy

**Render is reputable:**
- Founded by ex-Stripe engineers
- SOC 2 Type II certified
- Used by thousands of companies
- Environment variables encrypted at rest

## 💰 Cost

**100% FREE!**
- 750 hours/month free tier
- No credit card required
- App sleeps after 15 min of inactivity
- ~50 second cold start after sleep

## 🚀 Deployment Steps (Easy!)

### Option A: Deploy via GitHub (Recommended - Automatic)

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com/
   - Sign up with GitHub (or create account)

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select your `DandDy` repository
   - Click "Connect"

3. **Configure Service**
   - **Name:** `danddy-api` (or your choice)
   - **Region:** Choose closest to you (US West/East)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`

4. **Add Environment Variables** (Click "Advanced" → "Add Environment Variable")
   
   **Required:**
   ```
   OPENAI_API_KEY=your-actual-openai-key-here
   SECRET_KEY=<click "Generate" button>
   DATABASE_URL=sqlite:///./danddy.db
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   ALLOWED_ORIGINS=https://khoi-stripe.github.io
   PRODUCTION=true
   ```
   
   **Optional (Rate Limiting):**
   ```
   MAX_REQUESTS_PER_USER_PER_MINUTE=10
   MAX_REQUESTS_PER_USER_PER_DAY=100
   ```

5. **Deploy!**
   - Click "Create Web Service"
   - Wait 3-5 minutes for first deploy
   - You'll get a URL like: `https://danddy-api.onrender.com`

### Option B: Deploy via render.yaml (Alternative)

If you want automatic deployment from the repo root:

1. The `render.yaml` file is already in your repo
2. Go to Render Dashboard → "New +" → "Blueprint"
3. Connect your GitHub repo
4. Render will read `render.yaml` automatically
5. **Important:** Still need to set `OPENAI_API_KEY` manually in dashboard
   - Go to your service → "Environment" → Add `OPENAI_API_KEY`

## 🔧 Update Frontend

After deployment, copy your Render URL (e.g., `https://danddy-api.onrender.com`)

**Update:** `character-builder/character-builder-config.js`

Change line 11:
```javascript
const PRODUCTION_BACKEND_URL = 'https://danddy-api.onrender.com';
```

Then commit and push:
```bash
git add character-builder/character-builder-config.js
git commit -m "Update backend URL to Render"
git push origin main
```

## ✅ Test Your Deployment

### 1. Test Backend Health
```bash
curl https://your-app-name.onrender.com/health
```

Should return: `{"status":"healthy"}`

### 2. Test AI Status
```bash
curl https://your-app-name.onrender.com/api/ai/status
```

Should return: `{"available":true,"model":"gpt-3.5-turbo"}`

### 3. Test on GitHub Pages
1. Wait 2-3 minutes for GitHub Pages to rebuild
2. Visit: https://khoi-stripe.github.io/DandDy/
3. Create a character
4. Click "✨ Custom AI Portrait"
5. Should generate successfully!

## ⚡ Important Notes

### Cold Starts
- Free tier apps sleep after 15 min of inactivity
- First request after sleep takes ~50 seconds
- Subsequent requests are fast
- **Solution:** You can ping the health endpoint periodically to keep it awake

### Automatic Deploys
- Render auto-deploys on every push to `main` branch
- Check deploy logs in Render dashboard

### View Logs
- Render Dashboard → Your Service → "Logs" tab
- Real-time log streaming

## 🔐 Security Checklist

Before going live, verify:

- ✅ `.env` file is in `.gitignore`
- ✅ `OPENAI_API_KEY` set in Render dashboard (not in code)
- ✅ `ALLOWED_ORIGINS=https://khoi-stripe.github.io` (exact match)
- ✅ `PRODUCTION=true` on Render
- ✅ Rate limiting configured
- ✅ No API keys in any committed files

## 🆘 Troubleshooting

### Check Environment Variables
- Render Dashboard → Your Service → "Environment"
- Make sure `OPENAI_API_KEY` is set

### View Logs
- Render Dashboard → Your Service → "Logs"
- Look for errors during startup

### Redeploy
- Render Dashboard → Your Service → "Manual Deploy" → "Clear build cache & deploy"

### Test CORS
If you get CORS errors:
```bash
curl -H "Origin: https://khoi-stripe.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  https://your-app-name.onrender.com/api/ai/status
```

Should include `access-control-allow-origin` header.

## 📊 Monitor Usage

- **OpenAI Usage:** https://platform.openai.com/usage
- **Render Usage:** Dashboard shows request counts
- **Rate Limits:** Backend logs will show if users hit limits

## 🔄 Keep Awake (Optional)

To prevent cold starts, use a free service like:
- **Cron-job.org** - Ping your health endpoint every 10 minutes
- **UptimeRobot** - Free monitoring + keeps app awake

Example cron job:
```
*/10 * * * * curl https://your-app-name.onrender.com/health
```

## 🎉 You're Done!

Your setup is now:
- ✅ Secure (API key never exposed)
- ✅ Free (Render free tier)
- ✅ Fast (except first request after sleep)
- ✅ Scalable (upgrade to paid if needed)
- ✅ Reliable (backed by ex-Stripe engineers)

Enjoy your AI-powered D&D character builder! 🎲

