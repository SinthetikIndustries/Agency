// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'

// ── linkMemoryToBrainNode ─────────────────────────────────────────────────────
// Called when a memory item is promoted to canon status.

async function linkMemoryToBrainNode(
  db: DatabaseClient,
  memoryId: string,
  agentSlug: string,
  content: string,
  memoryType: string
): Promise<void> {
  const gridPath = `GRID/MEMORY/${memoryType}/canon/${memoryId}`
  const canonSectionNode = await db.queryOne<{ id: string }>(
    'SELECT id FROM brain_nodes WHERE grid_path = $1',
    [`GRID/MEMORY/semantic/canon`]
  )

  const node = await db.queryOne<{ id: string }>(
    `INSERT INTO brain_nodes (type, label, content, grid_path, grid_tier, confidence, source)
     VALUES ('memory', $1, $2, $3, 3, 0.9, $4)
     ON CONFLICT (grid_path) WHERE grid_path IS NOT NULL
     DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
     RETURNING id`,
    [`${agentSlug}/${memoryType}`, content.slice(0, 100), gridPath, agentSlug]
  )

  if (node && canonSectionNode) {
    await db.execute(
      `INSERT INTO brain_edges (from_id, to_id, type, weight, source)
       VALUES ($1, $2, 'contains', 0.8, 'system')
       ON CONFLICT (from_id, to_id, type) DO NOTHING`,
      [canonSectionNode.id, node.id]
    )

    await db.execute(
      'UPDATE memory_entries SET brain_node_id = $1 WHERE id = $2',
      [node.id, memoryId]
    )
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function registerMemoryRoutes(
  app: FastifyInstance,
  { db }: { db: DatabaseClient }
): Promise<void> {

  // POST /memory/propose — create a proposal for WARD review
  app.post('/memory/propose', async (request, reply) => {
    const { agent_id, content, type, metadata } = request.body as {
      agent_id: string
      content: string
      type: string
      metadata?: Record<string, unknown>
    }

    if (!agent_id || !content || !type) {
      return reply.status(400).send({ error: 'agent_id, content, and type are required' })
    }

    const VALID_TYPES = ['episodic', 'semantic', 'working', 'procedural', 'reflective']
    if (!VALID_TYPES.includes(type)) {
      return reply.status(400).send({ error: `Invalid memory type: ${type}` })
    }

    const agent = await db.queryOne<{ id: string }>(
      'SELECT id FROM agent_identities WHERE id = $1 AND status != $2',
      [agent_id, 'deleted']
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    const row = await db.queryOne<{ id: string }>(
      `INSERT INTO memory_entries
         (agent_id, type, content, memory_status, scope_type, scope_id, visibility, trust_level)
       VALUES ($1, $2, $3, 'proposal', 'agent', $1, 'private', 1)
       RETURNING id`,
      [agent_id, type, content]
    )

    return reply.status(201).send({ id: row?.id, status: 'proposal' })
  })

  // GET /memory/proposals — list all proposals awaiting WARD review
  app.get('/memory/proposals', async (_request, reply) => {
    const rows = await db.query<{
      id: string; agent_id: string; type: string; content: string
      created_at: string; trust_level: number
    }>(
      `SELECT id, agent_id, type, content, created_at, trust_level
       FROM memory_entries
       WHERE memory_status = 'proposal'
       ORDER BY created_at ASC`
    )
    return reply.send({ proposals: rows, count: rows.length })
  })

  // POST /memory/proposals/:id/promote — promote proposal to canon (WARD only)
  app.post('/memory/proposals/:id/promote', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { promoted_by } = request.body as { promoted_by: string }

    if (!promoted_by) {
      return reply.status(400).send({ error: 'promoted_by is required' })
    }

    const entry = await db.queryOne<{
      id: string; agent_id: string; type: string; content: string; memory_status: string
    }>(
      'SELECT id, agent_id, type, content, memory_status FROM memory_entries WHERE id = $1',
      [id]
    )
    if (!entry) return reply.status(404).send({ error: 'Memory entry not found' })
    if (entry.memory_status !== 'proposal') {
      return reply.status(409).send({ error: `Cannot promote memory with status: ${entry.memory_status}` })
    }

    await db.execute(
      `UPDATE memory_entries
       SET memory_status = 'canon', trust_level = 5, visibility = 'global',
           promoted_by = $1, promoted_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [promoted_by, id]
    )

    // Resolve agent slug for brain node label
    const agentRow = await db.queryOne<{ slug: string }>(
      'SELECT slug FROM agent_identities WHERE id = $1',
      [entry.agent_id]
    )
    const agentSlug = agentRow?.slug ?? entry.agent_id

    await linkMemoryToBrainNode(db, id, agentSlug, entry.content, entry.type)

    return reply.send({ ok: true, id, status: 'canon' })
  })

  // POST /memory/proposals/:id/reject — reject proposal → deprecated
  app.post('/memory/proposals/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { reason } = request.body as { reason?: string }

    const entry = await db.queryOne<{ memory_status: string }>(
      'SELECT memory_status FROM memory_entries WHERE id = $1',
      [id]
    )
    if (!entry) return reply.status(404).send({ error: 'Memory entry not found' })
    if (entry.memory_status !== 'proposal') {
      return reply.status(409).send({ error: `Cannot reject memory with status: ${entry.memory_status}` })
    }

    await db.execute(
      `UPDATE memory_entries
       SET memory_status = 'deprecated', updated_at = NOW()
       WHERE id = $1`,
      [id]
    )

    return reply.send({ ok: true, id, status: 'deprecated', reason: reason ?? null })
  })
}
