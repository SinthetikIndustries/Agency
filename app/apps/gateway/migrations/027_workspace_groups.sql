-- 027_workspace_groups.sql
-- Create workspace_groups and workspace_group_members tables

CREATE TABLE IF NOT EXISTS workspace_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  hierarchy_type TEXT NOT NULL DEFAULT 'flat',
  goals JSONB NOT NULL DEFAULT '[]',
  workspace_path TEXT NOT NULL,
  memory_path TEXT NOT NULL,
  created_by TEXT REFERENCES agent_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_group_members (
  group_id TEXT NOT NULL REFERENCES workspace_groups(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_wgm_agent ON workspace_group_members(agent_id);
