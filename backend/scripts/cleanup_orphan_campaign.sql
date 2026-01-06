-- Cleanup script for campaigns that can't be accessed through the UI
-- This happens when the creator's character wasn't assigned due to a bug

-- First, let's see the problem campaigns (creator has no character assigned)
SELECT 
    c.id as campaign_id,
    c.name as campaign_name,
    c.status,
    c.dm_id as creator_user_id,
    u.email as creator_email,
    cm.id as membership_id,
    cm.character_id,
    cm.status as member_status
FROM campaigns c
JOIN users u ON c.dm_id = u.id
LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = c.dm_id
WHERE c.status = 'active'
ORDER BY c.created_at DESC;

-- To delete a specific campaign by ID (replace CAMPAIGN_ID with actual ID):
-- DELETE FROM campaigns WHERE id = CAMPAIGN_ID;

-- To end a campaign (mark as completed) instead of deleting:
-- UPDATE campaigns SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = CAMPAIGN_ID;

-- To delete the "Quest for Tamiflu" campaign specifically:
-- DELETE FROM campaigns WHERE name = 'Quest for Tamiflu' AND status = 'active';







