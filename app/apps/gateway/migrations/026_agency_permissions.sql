-- 026_agency_permissions.sql
-- Add agency_permissions JSONB and autonomous_mode to agent_identities

ALTER TABLE agent_identities
  ADD COLUMN IF NOT EXISTS agency_permissions JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS autonomous_mode BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing agent_management_permission data to new JSONB format
UPDATE agent_identities SET agency_permissions = CASE
  WHEN agent_management_permission = 'autonomous'
    THEN '{"agentCreate":"autonomous","agentDelete":"request","agentUpdate":"autonomous","groupCreate":"autonomous","groupUpdate":"autonomous","groupDelete":"request","shellRun":"deny"}'::jsonb
  ELSE
    '{"agentCreate":"deny","agentDelete":"deny","agentUpdate":"request","groupCreate":"request","groupUpdate":"request","groupDelete":"deny","shellRun":"deny"}'::jsonb
END
WHERE agency_permissions = '{}';
