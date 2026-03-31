-- Add file_path to vault_sync_events so errorCount can reflect current state
-- (errors where the same path hasn't subsequently synced successfully)
ALTER TABLE vault_sync_events ADD COLUMN IF NOT EXISTS file_path text;

CREATE INDEX IF NOT EXISTS vault_sync_events_file_path_idx ON vault_sync_events (file_path);
