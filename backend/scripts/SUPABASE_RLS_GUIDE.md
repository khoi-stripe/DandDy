# Supabase RLS Security Advisory - Solutions

## The Problem

Your Supabase Security Advisor is showing RLS warnings because **PostgREST is enabled** by default on all Supabase projects. This exposes your database tables via a public REST API.

However, your app uses **custom FastAPI authentication** (not Supabase Auth), which means:
- ✅ Your backend handles all authentication and authorization
- ✅ Your frontend talks to FastAPI (not directly to Supabase)
- ❌ PostgREST is exposing your database without protection

## Architecture Overview

```
Frontend (HTML/JS)
    ↓ (authenticated requests)
FastAPI Backend (your custom auth)
    ↓ (database queries)
Supabase PostgreSQL
    ↓ (PostgREST API - CURRENTLY EXPOSED!)
Public Internet ⚠️
```

## Solution Options

### Option 1: Disable PostgREST (RECOMMENDED) ✅

**Use this if:** Your frontend only talks to FastAPI, never directly to Supabase.

**How to disable PostgREST:**

1. Go to your Supabase dashboard
2. Navigate to **Settings** → **API**
3. Find the **PostgREST** section
4. **Disable** the PostgREST API

**Pros:**
- ✅ Simple - no code changes needed
- ✅ More secure - removes unnecessary attack surface
- ✅ Your FastAPI backend continues to work normally
- ✅ No performance impact from RLS checks

**Cons:**
- ❌ Can't use Supabase's auto-generated REST API (but you're not using it anyway)
- ❌ Can't use Supabase JavaScript client for direct database access

**After disabling:**
- The Security Advisor warnings will disappear
- Your FastAPI backend will continue working normally
- The database is only accessible via your backend's connection pool

---

### Option 2: Enable RLS with Service Role Bypass

**Use this if:** You want to keep PostgREST enabled for future use or administrative tools.

Since you use custom authentication, you'll need to:
1. Enable RLS on all tables
2. Use the **service_role** key in your backend (bypasses RLS)
3. Create permissive policies for PostgREST API access (if needed later)

**Step 1: Update your backend database connection**

In your `.env` file, ensure you're using the **service_role** key:

```bash
# Option A: Connection string with service_role password
DATABASE_URL=postgresql://postgres:[service_role_password]@db.xxx.supabase.co:5432/postgres

# Option B: If you have a direct connection string from Supabase
DATABASE_URL=postgresql://postgres.xxx:[service_role_password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

The service_role connection bypasses RLS, so your FastAPI backend will work normally.

**Step 2: Run the RLS setup script**

In your Supabase SQL Editor, run the SQL script I created:
```bash
backend/scripts/enable_rls.sql
```

This enables RLS on all tables, which will:
- ✅ Block unauthorized PostgREST API access
- ✅ Allow your service_role backend to bypass RLS
- ✅ Satisfy the Security Advisor

**However, there's a problem:** The policies in `enable_rls.sql` use `auth.uid()` which won't work with your custom auth. You'd need to modify them or create service accounts.

---

### Option 3: Enable RLS with No Policies (Block All PostgREST Access)

**Use this if:** You want to keep PostgREST enabled but block all direct access.

Run this simple SQL in Supabase SQL Editor:

```sql
-- Enable RLS on all tables (blocks all PostgREST access)
ALTER TABLE character_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_updates ENABLE ROW LEVEL SECURITY;

-- No policies = no access via PostgREST
-- But service_role (your backend) bypasses RLS
```

Then ensure your backend uses the service_role connection string.

**Pros:**
- ✅ Simple - just 6 SQL commands
- ✅ Satisfies Security Advisor
- ✅ Blocks all PostgREST access
- ✅ Your backend continues working (service_role bypasses RLS)

**Cons:**
- ❌ PostgREST API becomes completely unusable (even for admins)

---

## Recommended Approach

**For your use case, I recommend Option 1 (Disable PostgREST)** because:

1. ✅ You're using FastAPI for all backend logic
2. ✅ Your frontend doesn't need direct database access
3. ✅ Simpler security model (fewer moving parts)
4. ✅ Better performance (no RLS overhead)
5. ✅ Fewer things to maintain and secure

## How to Check Your Current Setup

### 1. Check if your frontend uses Supabase client

Search your frontend code for:
```bash
grep -r "supabase.from" character-builder/ admin/
grep -r "supabase-js" character-builder/ admin/
grep -r "@supabase/supabase-js" character-builder/ admin/
```

If nothing is found, you're **not using PostgREST** and should disable it.

### 2. Check your database connection

Look at your `.env` file:
```bash
cat backend/.env | grep DATABASE_URL
```

If it shows a direct PostgreSQL connection (not using the Supabase REST API), you're good to disable PostgREST.

### 3. Verify PostgREST is not needed

Look at your `package.json` or JavaScript imports:
```bash
grep -r "supabase" package.json 2>/dev/null || echo "No package.json found"
```

## Migration Steps (Option 1 - Disable PostgREST)

1. **Backup your database** (just in case):
   - Go to Database → Backups in Supabase dashboard
   - Or use `pg_dump`

2. **Disable PostgREST**:
   - Settings → API → Disable PostgREST

3. **Test your application**:
   - Login to your frontend
   - Create/edit a character
   - Verify all features work

4. **Verify the warnings are gone**:
   - Go to Advisors → Security Advisor
   - The RLS warnings should disappear

5. **Done!** ✅

## Migration Steps (Option 3 - Enable RLS, Block PostgREST)

1. **Update your .env to use service_role connection**:
   ```bash
   # Get your service_role password from:
   # Supabase Dashboard → Settings → Database → Connection String
   # Use the "Session pooler" connection string with service_role role
   DATABASE_URL=postgresql://postgres.[your-project]:[password]@[host]:6543/postgres?pgbouncer=true
   ```

2. **Run the simple RLS enable script**:
   ```sql
   -- In Supabase SQL Editor
   ALTER TABLE character_collaborators ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
   ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;
   ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
   ALTER TABLE character_updates ENABLE ROW LEVEL SECURITY;
   ```

3. **Restart your backend**:
   ```bash
   cd backend
   # Stop and restart your FastAPI server
   ```

4. **Test your application** thoroughly

5. **Verify the warnings are gone** in Security Advisor

## Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgREST API Documentation](https://postgrest.org/en/stable/)
- [FastAPI Security Best Practices](https://fastapi.tiangolo.com/tutorial/security/)

## Questions?

If you're not sure which option to choose, ask yourself:

- ❓ Does my frontend ever call `supabase.from()` or use `@supabase/supabase-js`?
  - **NO** → Option 1 (Disable PostgREST)
  - **YES** → Option 2 (Enable RLS with proper policies)

- ❓ Do I need the PostgREST API for admin tools or future features?
  - **NO** → Option 1 (Disable PostgREST)
  - **YES** → Option 2 (Enable RLS with proper policies)

- ❓ I just want the warnings to go away quickly:
  - → Option 3 (Enable RLS, block PostgREST)

