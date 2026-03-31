-- Migration 003: Skills registry

CREATE TABLE IF NOT EXISTS skills (
  id           TEXT PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,
  version      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'installed',
  manifest     JSONB NOT NULL DEFAULT '{}',
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
