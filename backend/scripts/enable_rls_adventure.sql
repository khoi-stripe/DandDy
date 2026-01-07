-- ============================================================================
-- Row Level Security (RLS) for Adventure Tables
-- ============================================================================
-- This script enables RLS on adventure_runs and adventure_turns tables.
-- Run this in your Supabase SQL Editor to fix the Security Advisor warnings.
-- ============================================================================

-- ============================================================================
-- 1. ADVENTURE_RUNS
-- ============================================================================
-- Access: Adventure owner only
-- ============================================================================

ALTER TABLE adventure_runs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own adventures
CREATE POLICY "adventure_runs_select_owner"
ON adventure_runs
FOR SELECT
USING (owner_id = auth.uid()::integer);

-- Policy: Users can create adventures they own
CREATE POLICY "adventure_runs_insert_owner"
ON adventure_runs
FOR INSERT
WITH CHECK (owner_id = auth.uid()::integer);

-- Policy: Users can update their own adventures
CREATE POLICY "adventure_runs_update_owner"
ON adventure_runs
FOR UPDATE
USING (owner_id = auth.uid()::integer);

-- Policy: Users can delete their own adventures
CREATE POLICY "adventure_runs_delete_owner"
ON adventure_runs
FOR DELETE
USING (owner_id = auth.uid()::integer);


-- ============================================================================
-- 2. ADVENTURE_TURNS
-- ============================================================================
-- Access: Users can access turns for adventures they own
-- ============================================================================

ALTER TABLE adventure_turns ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view turns for their adventures
CREATE POLICY "adventure_turns_select_owner"
ON adventure_turns
FOR SELECT
USING (
  adventure_id IN (
    SELECT id FROM adventure_runs WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Users can create turns for their adventures
CREATE POLICY "adventure_turns_insert_owner"
ON adventure_turns
FOR INSERT
WITH CHECK (
  adventure_id IN (
    SELECT id FROM adventure_runs WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Users can update turns for their adventures
CREATE POLICY "adventure_turns_update_owner"
ON adventure_turns
FOR UPDATE
USING (
  adventure_id IN (
    SELECT id FROM adventure_runs WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Users can delete turns for their adventures
CREATE POLICY "adventure_turns_delete_owner"
ON adventure_turns
FOR DELETE
USING (
  adventure_id IN (
    SELECT id FROM adventure_runs WHERE owner_id = auth.uid()::integer
  )
);


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check RLS is enabled
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('adventure_runs', 'adventure_turns')
ORDER BY tablename;

-- Check policies
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('adventure_runs', 'adventure_turns')
ORDER BY tablename, policyname;

