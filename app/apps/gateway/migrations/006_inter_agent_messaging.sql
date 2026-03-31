CREATE TABLE IF NOT EXISTS agent_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id    TEXT NOT NULL,
  to_agent_id      TEXT NOT NULL,
  priority         TEXT NOT NULL CHECK (priority IN ('high', 'normal')),
  subject          TEXT NOT NULL,
  payload          JSONB NOT NULL,
  correlation_id   UUID,
  reply_to_id      UUID REFERENCES agent_messages(id) ON DELETE SET NULL,
  ttl              INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'delivered', 'read', 'expired', 'dead')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS parked_tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_id        UUID,
  agent_id                TEXT NOT NULL,
  waiting_for_message_id  UUID REFERENCES agent_messages(id) ON DELETE CASCADE,
  context_snapshot        JSONB NOT NULL DEFAULT '{}',
  parked_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at              TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'resumed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS agent_messages_to_agent_idx ON agent_messages (to_agent_id, status);
CREATE INDEX IF NOT EXISTS agent_messages_from_agent_idx ON agent_messages (from_agent_id);
CREATE INDEX IF NOT EXISTS agent_messages_correlation_idx ON agent_messages (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_messages_status_idx ON agent_messages (status);
CREATE INDEX IF NOT EXISTS parked_tasks_agent_idx ON parked_tasks (agent_id, status);
CREATE INDEX IF NOT EXISTS parked_tasks_message_idx ON parked_tasks (waiting_for_message_id);
