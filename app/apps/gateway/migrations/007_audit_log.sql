-- Migration 007: Audit log

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,          -- e.g. 'agent.create', 'approval.approve', 'skill.install'
  actor       TEXT NOT NULL,          -- 'system' | 'user' | agent_id
  target_type TEXT,                   -- 'agent' | 'skill' | 'approval' | 'session' | ...
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_target     ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
