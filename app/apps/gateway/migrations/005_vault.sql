CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vault_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path         TEXT UNIQUE NOT NULL,
  type         TEXT,
  version      INT NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'draft',
  checksum     TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_markdown TEXT NOT NULL,
  embedding    VECTOR(1536),
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_entities (
  entity_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id     UUID NOT NULL REFERENCES vault_entities(entity_id) ON DELETE CASCADE,
  to_id       UUID REFERENCES vault_entities(entity_id) ON DELETE SET NULL,
  link_type   TEXT NOT NULL DEFAULT 'wikilink',
  UNIQUE(from_id, to_id, link_type)
);

CREATE TABLE IF NOT EXISTS vault_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  version     INT NOT NULL,
  content     TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_sync_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES vault_documents(id) ON DELETE SET NULL,
  status      TEXT NOT NULL CHECK (status IN ('synced', 'skipped', 'error')),
  warnings    JSONB NOT NULL DEFAULT '[]',
  errors      JSONB NOT NULL DEFAULT '[]',
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_documents_type_idx ON vault_documents (type);
CREATE INDEX IF NOT EXISTS vault_entities_document_id_idx ON vault_entities (document_id);
CREATE INDEX IF NOT EXISTS vault_entities_entity_type_idx ON vault_entities (entity_type);
CREATE INDEX IF NOT EXISTS vault_sync_events_document_id_idx ON vault_sync_events (document_id);
