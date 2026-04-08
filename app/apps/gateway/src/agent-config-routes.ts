// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'

const CONFIG_FILE_TYPES = [
  // ── Core (all programs) ───────────────────────────────────────────────────
  'identity', 'soul', 'user', 'state',
  'memory', 'history', 'permissions', 'profile',
  'prompt', 'links',
  // ── SYST-specific ─────────────────────────────────────────────────────────
  'directives', 'decisions', 'coordination', 'governance',
  // ── CTRL-specific (reserved for when CTRL is implemented) ─────────────────
  'authority', 'routing', 'tasking', 'safeguards', 'subprogram-management',
  // ── Legacy (general agent conventions, kept for backward compat) ──────────
  'heartbeat', 'capabilities', 'scratch',
] as const
type ConfigFileType = typeof CONFIG_FILE_TYPES[number]

export async function registerAgentConfigRoutes(
  app: FastifyInstance,
  { db }: { db: DatabaseClient }
): Promise<void> {

  // GET /agents/:slug/config — list all config files for an agent
  app.get('/agents/:slug/config', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const agent = await db.queryOne<{ id: string }>(
      'SELECT id FROM agent_identities WHERE slug = $1 AND status != $2',
      [slug, 'deleted']
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    const rows = await db.query<{ file_type: string; content: string; updated_at: string; updated_by: string }>(
      `SELECT file_type, content, updated_at, updated_by
       FROM agent_config_files WHERE agent_id = $1
       ORDER BY CASE file_type
         WHEN 'identity'     THEN 1
         WHEN 'soul'         THEN 2
         WHEN 'user'         THEN 3
         WHEN 'heartbeat'    THEN 4
         WHEN 'capabilities' THEN 5
         WHEN 'scratch'      THEN 6
       END`,
      [agent.id]
    )
    return reply.send({ files: rows })
  })

  // GET /agents/:slug/config/:type — get single config file
  app.get('/agents/:slug/config/:type', async (request, reply) => {
    const { slug, type } = request.params as { slug: string; type: string }
    if (!CONFIG_FILE_TYPES.includes(type as ConfigFileType)) {
      return reply.status(400).send({ error: `Invalid config file type: ${type}` })
    }
    const row = await db.queryOne<{ content: string; updated_at: string; updated_by: string }>(
      `SELECT acf.content, acf.updated_at, acf.updated_by
       FROM agent_config_files acf
       JOIN agent_identities ai ON ai.id = acf.agent_id
       WHERE ai.slug = $1 AND acf.file_type = $2 AND ai.status != 'deleted'`,
      [slug, type]
    )
    if (!row) return reply.status(404).send({ error: 'Config file not found' })
    return reply.send(row)
  })

  // PUT /agents/:slug/config/:type — update config file content
  app.put('/agents/:slug/config/:type', async (request, reply) => {
    const { slug, type } = request.params as { slug: string; type: string }
    const { content } = request.body as { content: string }

    if (!CONFIG_FILE_TYPES.includes(type as ConfigFileType)) {
      return reply.status(400).send({ error: `Invalid config file type: ${type}` })
    }
    if (typeof content !== 'string') {
      return reply.status(400).send({ error: 'content must be a string' })
    }

    const agent = await db.queryOne<{ id: string }>(
      'SELECT id FROM agent_identities WHERE slug = $1 AND status != $2',
      [slug, 'deleted']
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    const updated = await db.queryOne<{ id: string; brain_node_id: string | null }>(
      `UPDATE agent_config_files
       SET content = $1, updated_at = NOW(), updated_by = 'user'
       WHERE agent_id = $2 AND file_type = $3
       RETURNING id, brain_node_id`,
      [content, agent.id, type]
    )
    if (!updated) return reply.status(404).send({ error: 'Config file not found' })

    // Sync to brain node if linked
    if (updated.brain_node_id) {
      await db.execute(
        `UPDATE brain_nodes
         SET content = $1, updated_at = NOW(), version = version + 1
         WHERE id = $2`,
        [content, updated.brain_node_id]
      )
    }

    return reply.send({ ok: true, type, updated_at: new Date().toISOString() })
  })
}
