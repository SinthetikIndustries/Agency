-- Migration 032: SENS audit log flag
-- Adds sens_processed flag to audit_log for SENS worker tracking

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS sens_processed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS audit_log_sens_unprocessed_idx
  ON audit_log(created_at)
  WHERE sens_processed = false;
