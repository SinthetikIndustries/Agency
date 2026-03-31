-- Migration 012: Per-agent skill overrides
-- Adds agent_skills for per-agent enable/disable of globally installed skills.
-- (ALTER TABLE skills type columns were added in 011_skills_type.sql)

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id    TEXT NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  skill_name  TEXT NOT NULL REFERENCES skills(name) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_name);
