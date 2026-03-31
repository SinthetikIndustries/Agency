-- Migration 014: Resize embedding column from 1536 to 768 dims (nomic-embed-text via Ollama)
ALTER TABLE vault_documents DROP COLUMN IF EXISTS embedding;
ALTER TABLE vault_documents ADD COLUMN embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_vault_documents_embedding
  ON vault_documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
