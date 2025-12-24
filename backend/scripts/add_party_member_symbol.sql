-- Migration: Add symbol column to campaign_members table
-- This column stores a unique symbol (e.g., ▣, ◆, ▲) for each party member in a campaign
-- Symbols are randomly assigned when a user joins a campaign

ALTER TABLE campaign_members ADD COLUMN symbol VARCHAR(4);

-- Note: Existing members will have NULL symbols until they are assigned
-- You can run the following to assign symbols to existing members if needed:
-- (This would need to be done via a Python script since it requires random assignment logic)

