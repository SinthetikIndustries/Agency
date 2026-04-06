-- Migration 030: The Brain — property graph knowledge store

CREATE TABLE IF NOT EXISTS brain_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL DEFAULT 'concept',
  label       TEXT NOT NULL,
  content     TEXT,
  embedding   VECTOR(768),
  metadata    JSONB NOT NULL DEFAULT '{}',
  confidence  FLOAT NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source      TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version     INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS brain_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id       UUID NOT NULL REFERENCES brain_nodes(id) ON DELETE CASCADE,
  to_id         UUID NOT NULL REFERENCES brain_nodes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'references',
  weight        FLOAT NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  bidirectional BOOLEAN NOT NULL DEFAULT false,
  metadata      JSONB NOT NULL DEFAULT '{}',
  source        TEXT NOT NULL DEFAULT 'system',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_id, to_id, type)
);

CREATE TABLE IF NOT EXISTS brain_node_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES brain_nodes(id) ON DELETE CASCADE,
  content     TEXT,
  metadata    JSONB,
  confidence  FLOAT,
  changed_by  TEXT NOT NULL DEFAULT 'system',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version     INT NOT NULL
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS brain_edges_from_id_idx ON brain_edges(from_id);
CREATE INDEX IF NOT EXISTS brain_edges_to_id_idx ON brain_edges(to_id);
CREATE INDEX IF NOT EXISTS brain_edges_type_idx ON brain_edges(type);
CREATE INDEX IF NOT EXISTS brain_nodes_type_idx ON brain_nodes(type);
CREATE INDEX IF NOT EXISTS brain_nodes_source_idx ON brain_nodes(source);
CREATE INDEX IF NOT EXISTS brain_node_history_node_id_idx ON brain_node_history(node_id);

-- Vector index for semantic search (ivfflat, 10 lists for small-medium scale)
CREATE INDEX IF NOT EXISTS brain_nodes_embedding_idx
  ON brain_nodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
