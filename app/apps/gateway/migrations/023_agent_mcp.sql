CREATE TABLE agent_mcp (
  agent_id   TEXT REFERENCES agent_identities(id) ON DELETE CASCADE,
  mcp_name   TEXT REFERENCES mcp_servers(name)    ON DELETE CASCADE,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, mcp_name)
);
