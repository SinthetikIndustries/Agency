CREATE TABLE mcp_servers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  config     JSONB NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  status     TEXT NOT NULL DEFAULT 'disconnected',
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
