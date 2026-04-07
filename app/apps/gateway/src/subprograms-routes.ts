// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'
import { SubprogramRunner } from '@agency/orchestrator/subprograms/runner'

export async function registerSubprogramRoutes(
  app: FastifyInstance,
  { db }: { db: DatabaseClient }
): Promise<void> {
  const runner = new SubprogramRunner(db)

  // GET /subprograms — list all registered subprograms
  app.get('/subprograms', async (_request, reply) => {
    const rows = await db.query<{
      id: string; label: string; description: string; responsibility: string
      status: string; enabled: boolean; last_run_at: string | null
      next_run_at: string | null; run_count: number; updated_at: string
    }>(
      `SELECT id, label, description, responsibility, status, enabled,
              last_run_at, next_run_at, run_count, updated_at
       FROM subprograms
       ORDER BY id ASC`
    )
    return reply.send({ subprograms: rows, count: rows.length })
  })

  // GET /subprograms/:id — get single subprogram with config and last_error
  app.get('/subprograms/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await db.queryOne<{
      id: string; label: string; description: string; responsibility: string
      status: string; enabled: boolean; last_run_at: string | null
      next_run_at: string | null; last_error: string | null
      run_count: number; config: Record<string, unknown>
      brain_node_id: string | null; created_at: string; updated_at: string
    }>(
      `SELECT id, label, description, responsibility, status, enabled,
              last_run_at, next_run_at, last_error, run_count, config,
              brain_node_id, created_at, updated_at
       FROM subprograms WHERE id = $1`,
      [id]
    )
    if (!row) return reply.status(404).send({ error: 'Subprogram not found' })
    return reply.send(row)
  })

  // POST /subprograms/:id/run — manually trigger a subprogram
  app.post('/subprograms/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string }
    const sp = await db.queryOne<{ id: string }>(
      'SELECT id FROM subprograms WHERE id = $1', [id]
    )
    if (!sp) return reply.status(404).send({ error: 'Subprogram not found' })

    // Fire and forget — don't await so the response returns immediately
    void runner.run(id).catch(err => console.error(`[SubprogramRoutes] Manual run of ${id} failed:`, err))

    return reply.send({ queued: true, id })
  })

  // PUT /subprograms/:id — enable/disable or update config
  app.put('/subprograms/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { enabled?: boolean; config?: Record<string, unknown> }

    const sp = await db.queryOne<{ id: string }>(
      'SELECT id FROM subprograms WHERE id = $1', [id]
    )
    if (!sp) return reply.status(404).send({ error: 'Subprogram not found' })

    const updates: string[] = ['updated_at = NOW()']
    const params: unknown[] = []

    if (typeof body.enabled === 'boolean') {
      params.push(body.enabled)
      updates.push(`enabled = $${params.length}`)
    }
    if (body.config !== undefined) {
      params.push(JSON.stringify(body.config))
      updates.push(`config = $${params.length}`)
    }

    if (params.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' })
    }

    params.push(id)
    await db.execute(
      `UPDATE subprograms SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    )

    return reply.send({ ok: true, id })
  })
}
