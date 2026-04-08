-- Migration 033: Rename orchestrator agent to system (SYST)
-- The orchestrator agent is repurposed as the top-level System program (SYST).
-- CTRL will be a new separate agent.

-- Rename slug and id in agent_identities
UPDATE agent_identities
SET slug         = 'system',
    name         = 'System',
    workspace_path = 'agents/system',
    updated_at   = NOW()
WHERE id = 'orchestrator';

UPDATE agent_identities
SET id = 'system'
WHERE id = 'orchestrator';

-- Update brain node grid path from instances to GRID/SYSTEM/SYST
UPDATE brain_nodes
SET grid_path  = 'GRID/SYSTEM/SYST',
    label      = 'System',
    content    = 'Top program of the Agency installation. Highest governing system mind. Owns total-system perspective, sovereign system identity, and system-level state.',
    updated_at = NOW()
WHERE grid_path = 'GRID/PROGRAMS/instances/orchestrator';

-- Update agent config file brain nodes that lived under instances/orchestrator
UPDATE brain_nodes
SET grid_path  = REPLACE(grid_path, 'GRID/PROGRAMS/instances/orchestrator/', 'GRID/SYSTEM/SYST/'),
    updated_at = NOW()
WHERE grid_path LIKE 'GRID/PROGRAMS/instances/orchestrator/%';

-- Update workspace_group_members if orchestrator was a member
UPDATE workspace_group_members
SET agent_id = 'system'
WHERE agent_id = 'orchestrator';

-- Update agent_identities parent references
UPDATE agent_identities
SET parent_agent_id = 'system'
WHERE parent_agent_id = 'orchestrator';

-- Update sessions that referenced orchestrator
UPDATE sessions
SET agent_id = 'system'
WHERE agent_id = 'orchestrator';

-- Update agent_config_files
UPDATE agent_config_files
SET agent_id = 'system'
WHERE agent_id = 'orchestrator';
