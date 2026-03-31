CREATE TABLE tool_overrides (
  tool_name  TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
