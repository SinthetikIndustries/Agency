-- Add auto-generated name and pinning support to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
