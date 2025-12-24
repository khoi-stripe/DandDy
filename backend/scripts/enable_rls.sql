-- ============================================================================
-- Row Level Security (RLS) Setup for DandDy
-- ============================================================================
-- This script enables RLS on all tables exposed to PostgREST and creates
-- appropriate security policies based on ownership and collaboration patterns.
--
-- Run this in your Supabase SQL Editor to fix the Security Advisor warnings.
-- ============================================================================

-- ============================================================================
-- 1. CHARACTER_COLLABORATORS
-- ============================================================================
-- Access: Character owner OR the collaborator user themselves
-- ============================================================================

ALTER TABLE character_collaborators ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view collaborator records for characters they own
CREATE POLICY "character_collaborators_select_owner"
ON character_collaborators
FOR SELECT
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Users can view their own collaborator records
CREATE POLICY "character_collaborators_select_self"
ON character_collaborators
FOR SELECT
USING (user_id = auth.uid()::integer);

-- Policy: Character owners can insert collaborators
CREATE POLICY "character_collaborators_insert_owner"
ON character_collaborators
FOR INSERT
WITH CHECK (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Character owners can update collaborators
CREATE POLICY "character_collaborators_update_owner"
ON character_collaborators
FOR UPDATE
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Character owners can delete collaborators
CREATE POLICY "character_collaborators_delete_owner"
ON character_collaborators
FOR DELETE
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);


-- ============================================================================
-- 2. SESSIONS
-- ============================================================================
-- Access: Session owner OR character owner OR character collaborators
-- ============================================================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view sessions they created
CREATE POLICY "sessions_select_owner"
ON sessions
FOR SELECT
USING (user_id = auth.uid()::integer);

-- Policy: Users can view sessions for characters they own
CREATE POLICY "sessions_select_character_owner"
ON sessions
FOR SELECT
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Users can view sessions for characters they collaborate on
CREATE POLICY "sessions_select_collaborator"
ON sessions
FOR SELECT
USING (
  character_id IN (
    SELECT character_id FROM character_collaborators WHERE user_id = auth.uid()::integer
  )
);

-- Policy: Users can create sessions for their own characters or collaborated characters
CREATE POLICY "sessions_insert"
ON sessions
FOR INSERT
WITH CHECK (
  user_id = auth.uid()::integer 
  AND (
    character_id IN (
      SELECT id FROM characters WHERE owner_id = auth.uid()::integer
    )
    OR character_id IN (
      SELECT character_id FROM character_collaborators 
      WHERE user_id = auth.uid()::integer 
      AND permission = 'edit'
    )
  )
);

-- Policy: Users can update their own sessions
CREATE POLICY "sessions_update"
ON sessions
FOR UPDATE
USING (
  user_id = auth.uid()::integer
  OR character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
  OR character_id IN (
    SELECT character_id FROM character_collaborators 
    WHERE user_id = auth.uid()::integer 
    AND permission = 'edit'
  )
);

-- Policy: Users can delete their own sessions
CREATE POLICY "sessions_delete"
ON sessions
FOR DELETE
USING (
  user_id = auth.uid()::integer
  OR character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);


-- ============================================================================
-- 3. SESSION_LOGS
-- ============================================================================
-- Access: Follows same pattern as sessions
-- ============================================================================

ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs they created
CREATE POLICY "session_logs_select_owner"
ON session_logs
FOR SELECT
USING (user_id = auth.uid()::integer);

-- Policy: Users can view logs for characters they own
CREATE POLICY "session_logs_select_character_owner"
ON session_logs
FOR SELECT
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Users can view logs for characters they collaborate on
CREATE POLICY "session_logs_select_collaborator"
ON session_logs
FOR SELECT
USING (
  character_id IN (
    SELECT character_id FROM character_collaborators WHERE user_id = auth.uid()::integer
  )
);

-- Policy: Users can create logs for their sessions
CREATE POLICY "session_logs_insert"
ON session_logs
FOR INSERT
WITH CHECK (
  user_id = auth.uid()::integer
  AND (
    character_id IN (
      SELECT id FROM characters WHERE owner_id = auth.uid()::integer
    )
    OR character_id IN (
      SELECT character_id FROM character_collaborators 
      WHERE user_id = auth.uid()::integer 
      AND permission = 'edit'
    )
  )
);

-- Policy: Users can update their own logs
CREATE POLICY "session_logs_update"
ON session_logs
FOR UPDATE
USING (
  user_id = auth.uid()::integer
  OR character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
  OR character_id IN (
    SELECT character_id FROM character_collaborators 
    WHERE user_id = auth.uid()::integer 
    AND permission = 'edit'
  )
);

-- Policy: Users can delete their own logs
CREATE POLICY "session_logs_delete"
ON session_logs
FOR DELETE
USING (
  user_id = auth.uid()::integer
  OR character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);


-- ============================================================================
-- 4. CAMPAIGN_MEMBERS
-- ============================================================================
-- Access: Campaign DM (owner) OR the member user themselves
-- ============================================================================

ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own membership records
CREATE POLICY "campaign_members_select_self"
ON campaign_members
FOR SELECT
USING (user_id = auth.uid()::integer);

-- Policy: Campaign DMs can view all members of their campaigns
CREATE POLICY "campaign_members_select_dm"
ON campaign_members
FOR SELECT
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE dm_id = auth.uid()::integer
  )
);

-- Policy: Members can view other members in the same campaign
CREATE POLICY "campaign_members_select_same_campaign"
ON campaign_members
FOR SELECT
USING (
  campaign_id IN (
    SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()::integer
  )
);

-- Policy: Campaign DMs can add members
CREATE POLICY "campaign_members_insert_dm"
ON campaign_members
FOR INSERT
WITH CHECK (
  campaign_id IN (
    SELECT id FROM campaigns WHERE dm_id = auth.uid()::integer
  )
);

-- Policy: Users can join campaigns (when invited)
CREATE POLICY "campaign_members_insert_self"
ON campaign_members
FOR INSERT
WITH CHECK (user_id = auth.uid()::integer);

-- Policy: Campaign DMs can update member status
CREATE POLICY "campaign_members_update_dm"
ON campaign_members
FOR UPDATE
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE dm_id = auth.uid()::integer
  )
);

-- Policy: Users can update their own membership (e.g., character assignment)
CREATE POLICY "campaign_members_update_self"
ON campaign_members
FOR UPDATE
USING (user_id = auth.uid()::integer);

-- Policy: Campaign DMs can remove members
CREATE POLICY "campaign_members_delete_dm"
ON campaign_members
FOR DELETE
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE dm_id = auth.uid()::integer
  )
);

-- Policy: Users can leave campaigns (delete their own membership)
CREATE POLICY "campaign_members_delete_self"
ON campaign_members
FOR DELETE
USING (user_id = auth.uid()::integer);


-- ============================================================================
-- 5. JOURNAL_ENTRIES
-- ============================================================================
-- Access: Character owner, collaborators, and campaign members (if journal is public)
-- ============================================================================

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own journal entries
CREATE POLICY "journal_entries_select_owner"
ON journal_entries
FOR SELECT
USING (user_id = auth.uid()::integer);

-- Policy: Users can view journal entries for characters they own
CREATE POLICY "journal_entries_select_character_owner"
ON journal_entries
FOR SELECT
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Collaborators can view journal entries for shared characters
CREATE POLICY "journal_entries_select_collaborator"
ON journal_entries
FOR SELECT
USING (
  character_id IN (
    SELECT character_id FROM character_collaborators WHERE user_id = auth.uid()::integer
  )
);

-- Policy: Campaign members can view public journal entries in their campaigns
CREATE POLICY "journal_entries_select_campaign_public"
ON journal_entries
FOR SELECT
USING (
  campaign_id IS NOT NULL
  AND campaign_id IN (
    SELECT cm.campaign_id 
    FROM campaign_members cm
    WHERE cm.user_id = auth.uid()::integer
    AND cm.status = 'active'
  )
  AND character_id IN (
    SELECT cm2.character_id
    FROM campaign_members cm2
    WHERE cm2.campaign_id = journal_entries.campaign_id
    AND cm2.journal_visibility = 'public'
  )
);

-- Policy: Users can create journal entries for their characters
CREATE POLICY "journal_entries_insert"
ON journal_entries
FOR INSERT
WITH CHECK (
  user_id = auth.uid()::integer
  AND (
    character_id IN (
      SELECT id FROM characters WHERE owner_id = auth.uid()::integer
    )
    OR character_id IN (
      SELECT character_id FROM character_collaborators 
      WHERE user_id = auth.uid()::integer 
      AND permission = 'edit'
    )
  )
);

-- Policy: Users can update their own journal entries
CREATE POLICY "journal_entries_update"
ON journal_entries
FOR UPDATE
USING (
  user_id = auth.uid()::integer
  OR character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
  OR character_id IN (
    SELECT character_id FROM character_collaborators 
    WHERE user_id = auth.uid()::integer 
    AND permission = 'edit'
  )
);

-- Policy: Users can delete their own journal entries
CREATE POLICY "journal_entries_delete"
ON journal_entries
FOR DELETE
USING (
  user_id = auth.uid()::integer
  OR character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);


-- ============================================================================
-- 6. CHARACTER_UPDATES
-- ============================================================================
-- Access: Follows same pattern as journal_entries (since they're linked)
-- ============================================================================

ALTER TABLE character_updates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view character updates for their characters
CREATE POLICY "character_updates_select_character_owner"
ON character_updates
FOR SELECT
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);

-- Policy: Collaborators can view character updates for shared characters
CREATE POLICY "character_updates_select_collaborator"
ON character_updates
FOR SELECT
USING (
  character_id IN (
    SELECT character_id FROM character_collaborators WHERE user_id = auth.uid()::integer
  )
);

-- Policy: Campaign members can view updates for public journals in their campaigns
CREATE POLICY "character_updates_select_campaign_public"
ON character_updates
FOR SELECT
USING (
  journal_entry_id IN (
    SELECT je.id 
    FROM journal_entries je
    JOIN campaign_members cm ON je.campaign_id = cm.campaign_id
    WHERE cm.user_id = auth.uid()::integer
    AND cm.status = 'active'
    AND je.character_id IN (
      SELECT cm2.character_id
      FROM campaign_members cm2
      WHERE cm2.campaign_id = je.campaign_id
      AND cm2.journal_visibility = 'public'
    )
  )
);

-- Policy: Users can create character updates for their characters
CREATE POLICY "character_updates_insert"
ON character_updates
FOR INSERT
WITH CHECK (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
  OR character_id IN (
    SELECT character_id FROM character_collaborators 
    WHERE user_id = auth.uid()::integer 
    AND permission = 'edit'
  )
);

-- Policy: Users can update character updates for their characters
CREATE POLICY "character_updates_update"
ON character_updates
FOR UPDATE
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
  OR character_id IN (
    SELECT character_id FROM character_collaborators 
    WHERE user_id = auth.uid()::integer 
    AND permission = 'edit'
  )
);

-- Policy: Users can delete character updates for their characters
CREATE POLICY "character_updates_delete"
ON character_updates
FOR DELETE
USING (
  character_id IN (
    SELECT id FROM characters WHERE owner_id = auth.uid()::integer
  )
);


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify RLS is enabled and policies are created
-- ============================================================================

-- Check which tables have RLS enabled
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
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

-- Check all policies for these tables
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN (
    'character_collaborators',
    'sessions',
    'session_logs', 
    'campaign_members',
    'journal_entries',
    'character_updates'
  )
ORDER BY tablename, policyname;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. This script assumes you're using Supabase Auth (auth.uid())
--    If you're not using Supabase Auth, you'll need to modify the policies
--    to use your authentication mechanism.
--
-- 2. The policies use auth.uid()::integer because your user IDs are integers.
--
-- 3. After running this script, the Security Advisor warnings should be resolved.
--
-- 4. Test your application thoroughly after enabling RLS to ensure all
--    queries work correctly with the new policies.
--
-- 5. If you need to disable RLS temporarily (for debugging):
--    ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
--
-- 6. To drop a policy (if you need to modify it):
--    DROP POLICY policy_name ON table_name;
-- ============================================================================

