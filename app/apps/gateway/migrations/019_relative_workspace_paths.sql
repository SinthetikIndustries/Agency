-- 019_relative_workspace_paths.sql
-- Convert workspace paths from absolute to relative (relative to ~/.agency).
-- Primary path becomes 'agents/{slug}', making the install portable.

-- Fix primary workspace paths that are still absolute
UPDATE agent_identities
SET workspace_path = 'agents/' || slug
WHERE workspace_path LIKE '/%';

-- Rebuild main agent's additional workspace paths as relative
UPDATE agent_identities
SET additional_workspace_paths = ARRAY(
  SELECT 'agents/' || ai.slug
  FROM agent_identities ai
  WHERE ai.slug != 'main' AND ai.status != 'deleted'
)
WHERE slug = 'main';

-- Clear additional workspace paths for non-main agents (no cross-references needed)
UPDATE agent_identities
SET additional_workspace_paths = '{}'
WHERE slug != 'main';
