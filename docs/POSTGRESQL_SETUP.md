# PostgreSQL Setup Guide

## Current Setup: Supabase + Render

### Architecture
- **Frontend**: GitHub Pages (static hosting)
- **Backend API**: Render (FastAPI)
- **Database**: Supabase (PostgreSQL)

### What This Does
- Uses Supabase's free PostgreSQL database for production
- Still uses SQLite locally for development
- Backend on Render connects to Supabase via `DATABASE_URL`

### Configuration

#### Render Environment Variables

In your Render dashboard (`danddy-api` service → Environment), set:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Supabase connection string |
| `SECRET_KEY` | Auto-generated |
| `OPENAI_API_KEY` | Your OpenAI key |

#### Supabase Connection String

Find it in: Supabase Dashboard → Project Settings → Database → Connection string (URI)

Format:
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### Local Development

Local development still uses SQLite (`backend/danddy.db`). No changes needed.

```bash
cd backend
python -m uvicorn main:app --reload
```

### Verify It's Working

1. **Check Render Logs**:
   - Go to your `danddy-api` service → Logs tab
   - Look for successful startup messages

2. **Test the API**:
   ```bash
   curl https://danddy-api.onrender.com/api/ai/status
   ```

3. **Check Supabase**:
   - Go to Supabase Dashboard → Table Editor
   - You should see tables: `users`, `characters`, `campaigns`, etc.

### What Changed?

**Files**:
- `render.yaml` - Database URL set manually (points to Supabase)
- `backend/database/database.py` - Accepts any PostgreSQL URL from env

**Environments**:
- **Local**: SQLite (`danddy.db` file)
- **Production**: Supabase PostgreSQL

### Costs

| Service | Cost |
|---------|------|
| GitHub Pages | Free |
| Render Web Service | Free tier |
| Supabase PostgreSQL | Free tier (500MB, no expiration) |
| **Total** | **$0/month** |

### Troubleshooting

**Problem**: "relation 'users' does not exist"
**Solution**: Tables not created yet. Check that `main.py` has:
```python
Base.metadata.create_all(bind=engine)
```

**Problem**: Connection refused to Supabase
**Solution**: 
- Check `DATABASE_URL` is correct in Render dashboard
- Ensure Supabase project is active (not paused)
- Use the "URI" connection string format, not individual params

**Problem**: SSL connection error
**Solution**: Supabase requires SSL. The connection string should work by default, but if issues arise, append `?sslmode=require` to the URL.
