-- Migration 017: Agent task scheduler tables
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id          TEXT PRIMARY KEY,
  agent_slug  TEXT NOT NULL,
  label       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  schedule    TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'recurring',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_runs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_runs_task_id ON scheduled_runs(task_id);
