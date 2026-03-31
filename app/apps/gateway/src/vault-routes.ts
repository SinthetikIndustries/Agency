// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'
import type { VaultSync } from '@agency/vault-sync'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

interface VaultRouteOptions {
  db: DatabaseClient
  vaultSync: VaultSync | null
}

export async function registerVaultRoutes(
  app: FastifyInstance,
  opts: VaultRouteOptions
): Promise<void> {
  const { db, vaultSync } = opts

  // GET /vault/status
  app.get('/vault/status', async (_req, reply) => {
    const docCount = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM vault_documents`
    )
    const errorCount = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM vault_sync_events WHERE status = 'error'`
    )
    const lastSync = await db.queryOne<{ synced_at: string }>(
      `SELECT synced_at FROM vault_sync_events ORDER BY synced_at DESC LIMIT 1`
    )
    return reply.send({
      enabled: vaultSync !== null,
      documentCount: docCount?.count ?? 0,
      errorCount: errorCount?.count ?? 0,
      lastSyncAt: lastSync?.synced_at ?? null,
    })
  })

  // POST /vault/sync — trigger manual full sync
  app.post('/vault/sync', async (_req, reply) => {
    if (!vaultSync) {
      return reply.status(503).send({ error: 'Vault sync not enabled' })
    }
    vaultSync.fullSync().catch((err: unknown) =>
      console.error('[vault-routes] Manual sync error:', err)
    )
    return reply.status(202).send({ message: 'Sync started' })
  })

  // GET /vault/validate — validate frontmatter without syncing
  app.get('/vault/validate', async (_req, reply) => {
    if (!vaultSync) {
      return reply.status(503).send({ error: 'Vault sync not enabled' })
    }
    const result = await vaultSync.validate()
    return reply.send(result)
  })

  // GET /vault/search?q=query&limit=10
  app.get('/vault/search', async (request, reply) => {
    const { q, limit: limitStr } = request.query as { q?: string; limit?: string }
    if (!q) return reply.status(400).send({ error: 'q parameter required' })
    const limit = Math.min(Number(limitStr ?? '10') || 10, 50)
    const rows = await db.query<{ id: string; relative_path: string; title: string; type: string; snippet: string }>(
      `SELECT id, relative_path,
              COALESCE(frontmatter->>'title', split_part(relative_path, '/', -1)) AS title,
              COALESCE(frontmatter->>'type', 'document') AS type,
              LEFT(raw_markdown, 300) AS snippet
       FROM vault_documents
       WHERE status = 'active'
         AND (to_tsvector('english', COALESCE(raw_markdown,'')) @@ plainto_tsquery('english', $1)
              OR raw_markdown ILIKE '%' || $2 || '%' ESCAPE '\\\\')
       LIMIT $3`,
      [q, escapeLike(q), limit]
    )
    return reply.send({ results: rows, count: rows.length })
  })

  // GET /vault/related/:slug
  app.get('/vault/related/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const limit = 10
    const outbound = await db.query<{ id: string; relative_path: string; title: string; link_text: string }>(
      `SELECT vd.id, vd.relative_path,
              COALESCE(vd.frontmatter->>'title', split_part(vd.relative_path, '/', -1)) AS title,
              vl.link_text
       FROM vault_links vl
       JOIN vault_documents vd ON vd.id = vl.to_id
       WHERE vl.from_id = (SELECT id FROM vault_documents WHERE relative_path ILIKE '%' || $1 || '%' ESCAPE '\\\\' LIMIT 1)
         AND vl.to_id IS NOT NULL
       LIMIT $2`,
      [escapeLike(slug), limit]
    )
    const inbound = await db.query<{ id: string; relative_path: string; title: string; link_text: string }>(
      `SELECT vd.id, vd.relative_path,
              COALESCE(vd.frontmatter->>'title', split_part(vd.relative_path, '/', -1)) AS title,
              vl.link_text
       FROM vault_links vl
       JOIN vault_documents vd ON vd.id = vl.from_id
       WHERE vl.to_id = (SELECT id FROM vault_documents WHERE relative_path ILIKE '%' || $1 || '%' ESCAPE '\\\\' LIMIT 1)
       LIMIT $2`,
      [escapeLike(slug), limit]
    )
    return reply.send({
      outbound: outbound.map(r => ({ ...r, direction: 'outbound' })),
      inbound: inbound.map(r => ({ ...r, direction: 'inbound' })),
    })
  })

  // GET /vault/graph-status — entity graph stats
  app.get('/vault/graph-status', async (_req, reply) => {
    const nodes = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM vault_entities`
    )
    const edges = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM vault_links`
    )
    const unresolved = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM vault_links WHERE to_id IS NULL`
    )
    return reply.send({
      nodes: nodes?.count ?? 0,
      edges: edges?.count ?? 0,
      unresolvedLinks: unresolved?.count ?? 0,
    })
  })
}
