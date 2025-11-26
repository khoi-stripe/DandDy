# PostgreSQL Setup Guide

## Phase 1: Add PostgreSQL Database (CURRENT)

### What This Does
- Adds a PostgreSQL database to your Render deployment
- Database is ready when you need user accounts (Phase 2)
- No frontend changes needed yet
- Still uses SQLite locally for development

### Deployment Steps

#### Option A: Deploy via Git Push (Recommended)

1. **Commit and push the changes**:
   ```bash
   git add -A
   git commit -m "feat: add PostgreSQL database to Render"
   git push origin main
   ```

2. **Render will automatically**:
   - Detect the `databases` section in `render.yaml`
   - Create a new PostgreSQL database named `danddy-db`
   - Connect it to your web service via `DATABASE_URL` environment variable
   - Run migrations (tables will be created automatically)

3. **Monitor the deployment**:
   - Go to: https://dashboard.render.com
   - Look for your `danddy-api` service
   - Click on it to see deployment logs
   - Should see: "Database danddy-db created" or similar

#### Option B: Manual Setup in Dashboard

If auto-deploy doesn't work, create the database manually:

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Create PostgreSQL Database**:
   - Click "New +" → "PostgreSQL"
   - Name: `danddy-db`
   - Database: `danddy`
   - User: `danddy`
   - Region: Same as your web service (US-West usually)
   - Plan: **Free** (90 days free, then $7/month)
   - Click "Create Database"

3. **Connect to Web Service**:
   - Go to your `danddy-api` web service
   - Click "Environment" tab
   - Find `DATABASE_URL`
   - Change from SQLite to: Click "Generate Value" → Select `danddy-db` → `connectionString`
   - Click "Save Changes"

4. **Trigger Deploy**:
   - Your service will automatically redeploy
   - Tables will be created on first run

### Verify It's Working

1. **Check Logs**:
   ```
   Go to your danddy-api service → Logs tab
   Look for: "Database tables created successfully" or similar
   ```

2. **Test the API**:
   ```bash
   # Should still work (uses AI proxy, not database yet)
   curl https://danddy-api.onrender.com/api/ai/status
   ```

3. **Check Database**:
   - Go to `danddy-db` in Render dashboard
   - Click "Connect" → Copy the connection string
   - Use a tool like TablePlus or psql to connect
   - You should see tables: `users`, `characters`, `campaigns`

### What Changed?

**Files Modified**:
- `render.yaml` - Added PostgreSQL database configuration
- `backend/database/database.py` - Updated default to SQLite (local) but accepts PostgreSQL from env
- `backend/env.example` - Added PostgreSQL connection string format

**What Happens**:
- **Local development**: Still uses SQLite (`danddy.db` file)
- **Production (Render)**: Uses PostgreSQL database
- **Frontend**: No changes! Still using localStorage
- **Backend**: Tables are created, but not used yet (waiting for Phase 2)

### Costs

- **Render Web Service**: Free tier (or $7/month)
- **Render PostgreSQL**: **Free for 90 days**, then $7/month
- **Total**: $0-14/month

### Next Steps (Phase 2 - Later)

When you're ready to add user accounts:
1. Add login/register UI to frontend
2. Update frontend to save characters to database
3. Users can access characters from any device

### Troubleshooting

**Problem**: Deploy fails with "Database not found"
**Solution**: Make sure database name in `render.yaml` matches dashboard

**Problem**: "relation 'users' does not exist"
**Solution**: Tables not created yet. Check that `main.py` has:
```python
Base.metadata.create_all(bind=engine)
```

**Problem**: Can't connect to database locally
**Solution**: That's expected! Local uses SQLite. PostgreSQL is only on Render.

### Rollback (if needed)

If something goes wrong, you can revert:

```bash
git revert HEAD
git push origin main
```

This will switch back to SQLite on Render.

