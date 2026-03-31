-- Migration 002: Model usage tracking

CREATE TABLE IF NOT EXISTS model_usage (
  id             TEXT PRIMARY KEY,
  session_id     TEXT REFERENCES sessions(id),
  agent_id       TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  input_tokens   INT NOT NULL DEFAULT 0,
  output_tokens  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_usage_session_id ON model_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_agent_id ON model_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_created_at ON model_usage(created_at);
