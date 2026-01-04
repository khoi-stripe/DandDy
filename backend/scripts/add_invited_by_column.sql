-- Migration: Add invited_by_id column to campaign_members table
-- This column tracks which user invited each member to the campaign
-- NULL for campaign creators or members who joined via invite code

ALTER TABLE campaign_members ADD COLUMN invited_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Note: Existing invitations will have NULL invited_by_id
-- Only new invitations created after this migration will track the inviter





