-- Migration: Add columns for Past Adventures feature
-- Run this migration to add left_at timestamp to campaign_members
-- and ended_at timestamp to campaigns table

-- Add left_at column to campaign_members
-- Records when a user left the campaign (status changed to LEFT)
ALTER TABLE campaign_members ADD COLUMN left_at TIMESTAMP NULL;

-- Add ended_at column to campaigns
-- Records when campaign was completed or archived
ALTER TABLE campaigns ADD COLUMN ended_at TIMESTAMP NULL;

-- Create index for efficient querying of past campaigns
CREATE INDEX IF NOT EXISTS idx_campaign_members_left_at ON campaign_members(left_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_ended_at ON campaigns(ended_at);











