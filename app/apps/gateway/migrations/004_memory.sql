-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('episodic', 'semantic', 'working')),
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS memory_entries_agent_id_idx ON memory_entries (agent_id);
CREATE INDEX IF NOT EXISTS memory_entries_type_idx ON memory_entries (type);
CREATE INDEX IF NOT EXISTS memory_entries_expires_at_idx ON memory_entries (expires_at) WHERE expires_at IS NOT NULL;
-- pgvector cosine similarity index
CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx ON memory_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
