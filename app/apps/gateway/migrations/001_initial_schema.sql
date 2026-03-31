-- Migration 001: Initial schema
-- Creates all core tables for Agency Phase 2

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agent profiles
CREATE TABLE IF NOT EXISTS agent_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  description       TEXT,
  system_prompt     TEXT NOT NULL DEFAULT '',
  model_tier        TEXT NOT NULL DEFAULT 'strong',
  model_override    TEXT,
  allowed_tools     JSONB NOT NULL DEFAULT '[]',
  behavior_settings JSONB NOT NULL DEFAULT '{}',
  tags              JSONB NOT NULL DEFAULT '[]',
  built_in          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent identities
CREATE TABLE IF NOT EXISTS agent_identities (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  slug                        TEXT UNIQUE NOT NULL,
  lifecycle_type              TEXT NOT NULL DEFAULT 'always_on',
  wake_mode                   TEXT NOT NULL DEFAULT 'auto',
  current_profile_id          TEXT,
  shell_permission_level      TEXT NOT NULL DEFAULT 'none',
  agent_management_permission TEXT NOT NULL DEFAULT 'approval_required',
  workspace_path              TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active',
  created_by                  TEXT NOT NULL DEFAULT 'system',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  client      TEXT NOT NULL DEFAULT 'cli',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  role        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  tool_calls  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approvals
CREATE TABLE IF NOT EXISTS approvals (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  tool_name     TEXT,
  tool_input    JSONB,
  status        TEXT NOT NULL DEFAULT 'pending',
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  note          TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_agent_id ON approvals(agent_id);
