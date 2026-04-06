-- 029_system_group.sql
-- Mark a workspace group as the system-managed group (orchestrator-only visibility)

ALTER TABLE workspace_groups
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
