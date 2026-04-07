-- Migration 031: Grid Foundation
-- Extends brain_nodes with Grid metadata and creates Grid-specific tables

-- ── Extend brain_nodes ────────────────────────────────────────────────────────

ALTER TABLE brain_nodes
  ADD COLUMN IF NOT EXISTS grid_path    TEXT,
  ADD COLUMN IF NOT EXISTS grid_tier    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grid_locked  BOOLEAN  NOT NULL DEFAULT false;

-- grid_tier: 0=content (not a Grid node), 1=layer, 2=section, 3=endpoint
-- grid_locked: true for structural nodes that cannot be deleted via API

-- Unique partial index so ON CONFLICT (grid_path) WHERE grid_path IS NOT NULL works correctly
CREATE UNIQUE INDEX IF NOT EXISTS brain_nodes_grid_path_unique_idx
  ON brain_nodes(grid_path) WHERE grid_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS brain_nodes_grid_tier_idx ON brain_nodes(grid_tier) WHERE grid_tier > 0;

-- ── Agent config files ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_config_files (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT    NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  file_type     TEXT    NOT NULL CHECK (file_type IN ('identity','soul','user','heartbeat','capabilities','scratch')),
  content       TEXT    NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT    NOT NULL DEFAULT 'system',
  brain_node_id UUID    REFERENCES brain_nodes(id) ON DELETE SET NULL,
  UNIQUE (agent_id, file_type)
);

CREATE INDEX IF NOT EXISTS acf_agent_id_idx ON agent_config_files(agent_id);
CREATE INDEX IF NOT EXISTS acf_brain_node_id_idx ON agent_config_files(brain_node_id) WHERE brain_node_id IS NOT NULL;

-- ── Subprogram registry ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subprograms (
  id            TEXT    PRIMARY KEY,  -- 'MON', 'COMP', 'INDX', etc.
  label         TEXT    NOT NULL,     -- 'Monitor', 'Compactor', etc.
  description   TEXT    NOT NULL DEFAULT '',
  responsibility TEXT   NOT NULL DEFAULT '',  -- one-sentence purpose
  status        TEXT    NOT NULL DEFAULT 'inactive'
                        CHECK (status IN ('inactive','running','idle','error')),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  last_error    TEXT,
  run_count     INT     NOT NULL DEFAULT 0,
  config        JSONB   NOT NULL DEFAULT '{}',
  brain_node_id UUID    REFERENCES brain_nodes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Link agents and zones to their brain nodes ────────────────────────────────

ALTER TABLE agent_identities
  ADD COLUMN IF NOT EXISTS brain_node_id UUID REFERENCES brain_nodes(id) ON DELETE SET NULL;

ALTER TABLE workspace_groups
  ADD COLUMN IF NOT EXISTS brain_node_id UUID REFERENCES brain_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_brain_node_id_idx ON agent_identities(brain_node_id) WHERE brain_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wg_brain_node_id_idx ON workspace_groups(brain_node_id) WHERE brain_node_id IS NOT NULL;

-- ── Memory lifecycle fields ───────────────────────────────────────────────────

-- Add missing columns that LIFE worker and lifecycle system depend on.
-- expires_at already exists from migration 004; updated_at does not.
ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;  -- null = never expires

-- Extend allowed memory types to cover the full Grid MEMORY taxonomy
ALTER TABLE memory_entries
  DROP CONSTRAINT IF EXISTS memory_entries_type_check;
ALTER TABLE memory_entries
  ADD CONSTRAINT memory_entries_type_check
  CHECK (type IN ('episodic','semantic','working','procedural','reflective'));

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS memory_status  TEXT NOT NULL DEFAULT 'active'
                                          CHECK (memory_status IN ('active','proposal','canon','deprecated','archived')),
  ADD COLUMN IF NOT EXISTS scope_type     TEXT NOT NULL DEFAULT 'agent'
                                          CHECK (scope_type IN ('system','agent','zone','global')),
  ADD COLUMN IF NOT EXISTS scope_id       TEXT,          -- agent_id, zone id, or null for system/global
  ADD COLUMN IF NOT EXISTS visibility     TEXT NOT NULL DEFAULT 'private'
                                          CHECK (visibility IN ('private','zone','global')),
  ADD COLUMN IF NOT EXISTS trust_level    SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS promoted_by    TEXT,
  ADD COLUMN IF NOT EXISTS promoted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brain_node_id  UUID REFERENCES brain_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS me_memory_status_idx ON memory_entries(memory_status);
CREATE INDEX IF NOT EXISTS me_scope_idx ON memory_entries(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS me_visibility_idx ON memory_entries(visibility);
