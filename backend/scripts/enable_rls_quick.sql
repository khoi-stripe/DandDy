-- ============================================================================
-- QUICK FIX: Enable RLS to satisfy Supabase Security Advisor
-- ============================================================================
-- This script enables Row Level Security on all affected tables.
-- 
-- Since you're using FastAPI with direct PostgreSQL connection (service_role),
-- your backend will continue working normally (service_role bypasses RLS).
-- 
-- This blocks PostgREST API access while allowing your backend to work.
-- ============================================================================
--
-- HOW TO USE:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Copy-paste this entire file
-- 3. Click "Run"
-- 4. Check Advisors → Security Advisor (warnings should be gone)
-- 5. Test your app (it should work normally)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE character_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_updates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFICATION: Check RLS is enabled
-- ============================================================================
SELECT 
  schemaname, 
  tablename, 
  CASE 
    WHEN rowsecurity THEN '✅ RLS ENABLED'
    ELSE '❌ RLS DISABLED'
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'character_collaborators',
    'sessions', 
    'session_logs',
    'campaign_members',
    'journal_entries',
    'character_updates'
  )
ORDER BY tablename;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. ✅ No policies created = PostgREST API is completely blocked
-- 2. ✅ Your FastAPI backend uses service_role which bypasses RLS
-- 3. ✅ This satisfies the Supabase Security Advisor
-- 4. ✅ Your app will continue working normally
-- 
-- If you see errors after running this:
-- - Make sure your DATABASE_URL uses service_role or postgres role
-- - Check that your connection string has the right password
-- - Restart your FastAPI backend
--
-- To disable RLS (if you have issues):
-- ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
-- ============================================================================

