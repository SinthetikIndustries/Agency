// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'
import { generateEmbedding, toVectorLiteral } from './embedding.js'

interface BrainRouteOptions {
  db: DatabaseClient
  ollamaUrl: string
}

interface BrainNode {
  id: string
  type: string
  label: string
  content: string | null
  metadata: Record<string, unknown>
  confidence: number
  source: string
  created_at: string
  updated_at: string
  version: number
}

interface BrainEdge {
  id: string
  from_id: string
  to_id: string
  type: string
  weight: number
  bidirectional: boolean
  metadata: Record<string, unknown>
  source: string
  created_at: string
}

export async function registerBrainRoutes(
  app: FastifyInstance,
  opts: BrainRouteOptions
): Promise<void> {
  const { db, ollamaUrl } = opts

  // ── Status ────────────────────────────────────────────────────────────────

  app.get('/brain/status', async (_req, reply) => {
    const [nodeCount, edgeCount, recentNode] = await Promise.all([
      db.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM brain_nodes'),
      db.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM brain_edges'),
      db.queryOne<{ updated_at: string }>(
        'SELECT updated_at FROM brain_nodes ORDER BY updated_at DESC LIMIT 1'
      ),
    ])
    return reply.send({
      nodeCount: nodeCount?.count ?? 0,
      edgeCount: edgeCount?.count ?? 0,
      lastUpdated: recentNode?.updated_at ?? null,
    })
  })

  // ── Graph payload (for 3D visualization) ─────────────────────────────────

  app.get('/brain/graph', async (_req, reply) => {
    const nodes = await db.query<{
      id: string; type: string; label: string; confidence: number
      source: string; created_at: string; degree: number
      grid_path: string | null; grid_tier: number; grid_locked: boolean
    }>(
      `SELECT bn.id, bn.type, bn.label, bn.confidence, bn.source, bn.created_at,
              bn.grid_path, bn.grid_tier, bn.grid_locked,
              (COUNT(be_out.id) + COUNT(be_in.id))::int AS degree
       FROM brain_nodes bn
       LEFT JOIN brain_edges be_out ON be_out.from_id = bn.id
       LEFT JOIN brain_edges be_in  ON be_in.to_id = bn.id
       GROUP BY bn.id
       ORDER BY bn.grid_tier DESC, bn.type, bn.label`
    )

    const edges = await db.query<{
      id: string; from_id: string; to_id: string
      type: string; weight: number; bidirectional: boolean
    }>(
      `SELECT id, from_id, to_id, type, weight, bidirectional
       FROM brain_edges`
    )

    return reply.send({ nodes, edges })
  })

  // ── Node CRUD ─────────────────────────────────────────────────────────────

  app.get('/brain/nodes', async (request, reply) => {
    const { type, source, limit: limitStr } = request.query as {
      type?: string; source?: string; limit?: string
    }
    const limit = Math.min(Number(limitStr ?? '100') || 100, 500)

    const conditions: string[] = []
    const params: unknown[] = []

    if (type) { conditions.push(`type = $${params.push(type)}`)}
    if (source) { conditions.push(`source = $${params.push(source)}`)}
    params.push(limit)

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const nodes = await db.query<BrainNode>(
      `SELECT id, type, label, content, metadata, confidence, source, created_at, updated_at, version
       FROM brain_nodes ${where}
       ORDER BY updated_at DESC
       LIMIT $${params.length}`,
      params
    )
    return reply.send({ nodes, count: nodes.length })
  })

  app.get('/brain/nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const node = await db.queryOne<BrainNode>(
      `SELECT id, type, label, content, metadata, confidence, source, created_at, updated_at, version
       FROM brain_nodes WHERE id = $1`,
      [id]
    )
    if (!node) return reply.status(404).send({ error: 'Node not found' })
    return reply.send(node)
  })

  app.post('/brain/nodes', async (request, reply) => {
    const { type = 'concept', label, content, metadata = {}, confidence = 1.0, source = 'user' } =
      request.body as Partial<BrainNode>

    if (!label) return reply.status(400).send({ error: 'label required' })

    // Generate embedding from label + content
    const textForEmbed = [label, content].filter(Boolean).join('\n\n')
    const embedding = await generateEmbedding(textForEmbed, ollamaUrl)

    const embeddingClause = embedding
      ? `$7::vector`
      : 'NULL'
    const params: unknown[] = [type, label, content ?? null, metadata, confidence, source]
    if (embedding) params.push(toVectorLiteral(embedding))

    const node = await db.queryOne<BrainNode>(
      `INSERT INTO brain_nodes (type, label, content, metadata, confidence, source, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, ${embeddingClause})
       RETURNING id, type, label, content, metadata, confidence, source, created_at, updated_at, version`,
      params
    )
    return reply.status(201).send(node)
  })

  app.put('/brain/nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<BrainNode>

    const existing = await db.queryOne<BrainNode>(
      'SELECT * FROM brain_nodes WHERE id = $1', [id]
    )
    if (!existing) return reply.status(404).send({ error: 'Node not found' })

    // Write history before updating
    await db.query(
      `INSERT INTO brain_node_history (node_id, content, metadata, confidence, changed_by, version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, existing.content, existing.metadata, existing.confidence,
       updates.source ?? 'user', existing.version]
    )

    // Regenerate embedding if label or content changed
    const params: unknown[] = []
    const sets: string[] = []

    if (updates.label !== undefined) { sets.push(`label = $${params.push(updates.label)}`)}
    if (updates.content !== undefined) { sets.push(`content = $${params.push(updates.content)}`)}
    if (updates.type !== undefined) { sets.push(`type = $${params.push(updates.type)}`)}
    if (updates.confidence !== undefined) { sets.push(`confidence = $${params.push(updates.confidence)}`)}
    if (updates.metadata !== undefined) { sets.push(`metadata = $${params.push(updates.metadata)}`)}

    if (updates.label !== undefined || updates.content !== undefined) {
      const textForEmbed = [
        updates.label ?? existing.label,
        updates.content ?? existing.content,
      ].filter(Boolean).join('\n\n')
      const embedding = await generateEmbedding(textForEmbed, ollamaUrl)
      if (embedding) {
        sets.push(`embedding = $${params.push(toVectorLiteral(embedding))}::vector`)
      }
    }

    sets.push(`updated_at = NOW()`)
    sets.push(`version = version + 1`)

    params.push(id)
    const node = await db.queryOne<BrainNode>(
      `UPDATE brain_nodes SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, type, label, content, metadata, confidence, source, created_at, updated_at, version`,
      params
    )
    return reply.send(node)
  })

  app.delete('/brain/nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const node = await db.queryOne<{ grid_locked: boolean }>(
      'SELECT grid_locked FROM brain_nodes WHERE id = $1', [id]
    )
    if (!node) return reply.status(404).send({ error: 'Node not found' })
    if (node.grid_locked) {
      return reply.status(403).send({ error: 'Cannot delete a locked Grid structural node' })
    }
    await db.execute('DELETE FROM brain_nodes WHERE id = $1', [id])
    return reply.send({ ok: true })
  })

  // ── Edge CRUD ─────────────────────────────────────────────────────────────

  app.get('/brain/edges', async (request, reply) => {
    const { fromId, toId, type } = request.query as {
      fromId?: string; toId?: string; type?: string
    }
    const conditions: string[] = []
    const params: unknown[] = []

    if (fromId) conditions.push(`from_id = $${params.push(fromId)}`)
    if (toId) conditions.push(`to_id = $${params.push(toId)}`)
    if (type) conditions.push(`type = $${params.push(type)}`)

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const edges = await db.query<BrainEdge>(
      `SELECT id, from_id, to_id, type, weight, bidirectional, metadata, source, created_at
       FROM brain_edges ${where}
       ORDER BY created_at DESC`,
      params
    )
    return reply.send({ edges, count: edges.length })
  })

  app.post('/brain/edges', async (request, reply) => {
    const {
      from_id, to_id,
      type = 'references',
      weight = 1.0,
      bidirectional = false,
      metadata = {},
      source = 'user',
    } = request.body as Partial<BrainEdge>

    if (!from_id || !to_id) return reply.status(400).send({ error: 'from_id and to_id required' })

    const edge = await db.queryOne<BrainEdge>(
      `INSERT INTO brain_edges (from_id, to_id, type, weight, bidirectional, metadata, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (from_id, to_id, type) DO UPDATE
         SET weight = EXCLUDED.weight,
             bidirectional = EXCLUDED.bidirectional,
             metadata = EXCLUDED.metadata
       RETURNING id, from_id, to_id, type, weight, bidirectional, metadata, source, created_at`,
      [from_id, to_id, type, weight, bidirectional, metadata, source]
    )
    return reply.status(201).send(edge)
  })

  app.delete('/brain/edges/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await db.query('DELETE FROM brain_edges WHERE id = $1', [id])
    return reply.send({ ok: true })
  })

  // ── Semantic search ───────────────────────────────────────────────────────

  app.get('/brain/search', async (request, reply) => {
    const { q, limit: limitStr, type } = request.query as {
      q?: string; limit?: string; type?: string
    }
    if (!q) return reply.status(400).send({ error: 'q required' })
    const limit = Math.min(Number(limitStr ?? '20') || 20, 100)

    const embedding = await generateEmbedding(q, ollamaUrl)

    let results: Array<{
      id: string; type: string; label: string; content: string | null
      confidence: number; score: number
    }>

    if (embedding) {
      // Vector similarity search
      const typeClause = type ? `AND type = '${type.replace(/'/g, "''")}'` : ''
      results = await db.query(
        `SELECT id, type, label, LEFT(content, 500) AS content, confidence,
                1 - (embedding <=> $1::vector) AS score
         FROM brain_nodes
         WHERE embedding IS NOT NULL ${typeClause}
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [toVectorLiteral(embedding), limit]
      )
    } else {
      // Fallback: full-text search
      const typeClause = type ? `AND type = $2` : ''
      const params: unknown[] = [q]
      if (type) params.push(type)
      params.push(limit)
      results = await db.query(
        `SELECT id, type, label, LEFT(content, 500) AS content, confidence, 0.5 AS score
         FROM brain_nodes
         WHERE (label ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%')
           ${typeClause}
         ORDER BY confidence DESC
         LIMIT $${params.length}`,
        params
      )
    }

    return reply.send({ results, count: results.length, semantic: !!embedding })
  })

  // ── Multi-hop traversal ───────────────────────────────────────────────────

  app.get('/brain/traverse/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { depth: depthStr } = request.query as { depth?: string }
    const depth = Math.min(Number(depthStr ?? '3') || 3, 6)

    const rows = await db.query<{
      id: string; type: string; label: string; confidence: number; depth: number
      via_edge_id: string | null; via_edge_type: string | null
    }>(
      `WITH RECURSIVE neighborhood AS (
         SELECT id, type, label, confidence, 0 AS depth,
                NULL::uuid AS via_edge_id, NULL::text AS via_edge_type
         FROM brain_nodes WHERE id = $1

         UNION

         SELECT bn.id, bn.type, bn.label, bn.confidence, n.depth + 1,
                be.id AS via_edge_id, be.type AS via_edge_type
         FROM neighborhood n
         JOIN brain_edges be ON (
           be.from_id = n.id
           OR (be.bidirectional AND be.to_id = n.id)
         )
         JOIN brain_nodes bn ON bn.id = CASE
           WHEN be.from_id = n.id THEN be.to_id
           ELSE be.from_id
         END
         WHERE n.depth < $2
       )
       SELECT DISTINCT ON (id) id, type, label, confidence, depth, via_edge_id, via_edge_type
       FROM neighborhood
       ORDER BY id, depth ASC`,
      [id, depth]
    )

    return reply.send({ nodes: rows, count: rows.length, rootId: id, depth })
  })

  // ── Node history ──────────────────────────────────────────────────────────

  app.get('/brain/nodes/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string }
    const history = await db.query(
      `SELECT id, content, metadata, confidence, changed_by, changed_at, version
       FROM brain_node_history
       WHERE node_id = $1
       ORDER BY version DESC
       LIMIT 50`,
      [id]
    )
    return reply.send({ history, nodeId: id })
  })

  // ── Candidate connections (emergent discovery) ────────────────────────────

  app.get('/brain/candidates', async (_req, reply) => {
    const candidates = await db.query<{
      node_a_id: string; node_a_label: string
      node_b_id: string; node_b_label: string
      shared_neighbors: number
    }>(
      `SELECT a.id AS node_a_id, a.label AS node_a_label,
              b.id AS node_b_id, b.label AS node_b_label,
              COUNT(*) AS shared_neighbors
       FROM brain_edges e1
       JOIN brain_edges e2 ON e2.to_id = e1.to_id AND e2.from_id != e1.from_id
       JOIN brain_nodes a ON a.id = e1.from_id
       JOIN brain_nodes b ON b.id = e2.from_id
       WHERE NOT EXISTS (
         SELECT 1 FROM brain_edges
         WHERE (from_id = a.id AND to_id = b.id)
            OR (from_id = b.id AND to_id = a.id)
       )
       GROUP BY a.id, a.label, b.id, b.label
       HAVING COUNT(*) > 1
       ORDER BY shared_neighbors DESC
       LIMIT 20`
    )
    return reply.send({ candidates, count: candidates.length })
  })
}
