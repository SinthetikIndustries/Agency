-- 010_agent_hierarchy.sql
-- Add parent_agent_id to support infinite agent hierarchy

ALTER TABLE agent_identities
  ADD COLUMN IF NOT EXISTS parent_agent_id TEXT REFERENCES agent_identities(id);

CREATE INDEX IF NOT EXISTS idx_agent_identities_parent
  ON agent_identities(parent_agent_id);
