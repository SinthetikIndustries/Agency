-- Migration 013: Add additional_workspace_paths to agent_identities
-- Allows agents to be granted read/write access to directories outside
-- their primary workspace (e.g. project folders, shared directories).

ALTER TABLE agent_identities
  ADD COLUMN IF NOT EXISTS additional_workspace_paths text[] NOT NULL DEFAULT '{}';
