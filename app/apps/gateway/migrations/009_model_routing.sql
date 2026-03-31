-- Migration 009: Model routing and profiles
-- Adds per-agent model config and reusable routing profiles

-- Per-agent model config (JSON stored as TEXT)
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS model_config TEXT;

-- Reusable routing profiles
CREATE TABLE IF NOT EXISTS routing_profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  chain       TEXT NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
