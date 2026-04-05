-- 028_group_memory.sql
-- Add group_id to memory_entries for shared group memory

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES workspace_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memory_entries_group_id ON memory_entries(group_id);
