// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/gateway/src/routing-profiles.ts
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { PostgresClient } from '@agency/orchestrator/db'
import type { RoutingChainStep } from '@agency/shared-types'

export interface RoutingProfile {
  id: string
  name: string
  description: string
  chain: RoutingChainStep[]
  createdAt: string
}

function rowToProfile(r: Record<string, string>): RoutingProfile {
  return {
    id: r['id']!,
    name: r['name']!,
    description: r['description'] ?? '',
    chain: JSON.parse(r['chain'] ?? '[]') as RoutingChainStep[],
    createdAt: r['created_at']!,
  }
}

export async function loadRoutingProfiles(db: PostgresClient): Promise<Map<string, RoutingProfile>> {
  const rows = await db.query<Record<string, string>>(
    'SELECT * FROM routing_profiles ORDER BY created_at ASC'
  )
  const map = new Map<string, RoutingProfile>()
  for (const r of rows) map.set(r['id']!, rowToProfile(r))
  return map
}

export function registerRoutingProfileRoutes(
  app: FastifyInstance,
  db: PostgresClient,
  profilesMap: Map<string, RoutingProfile>
) {
  app.get('/routing-profiles', async () => {
    return { profiles: Array.from(profilesMap.values()) }
  })

  app.post('/routing-profiles', async (request, reply) => {
    const body = request.body as { name?: string; description?: string; chain?: RoutingChainStep[] }
    if (!body?.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!Array.isArray(body.chain) || body.chain.length === 0) {
      return reply.status(400).send({ error: 'chain must be a non-empty array' })
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.execute(
      'INSERT INTO routing_profiles (id, name, description, chain, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, body.name.trim(), body.description?.trim() ?? '', JSON.stringify(body.chain), now]
    )
    const profile: RoutingProfile = {
      id, name: body.name.trim(),
      description: body.description?.trim() ?? '',
      chain: body.chain,
      createdAt: now,
    }
    profilesMap.set(id, profile)
    return reply.status(201).send({ ok: true, profile })
  })

  app.patch('/routing-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = profilesMap.get(id)
    if (!existing) return reply.status(404).send({ error: 'Routing profile not found' })

    const body = request.body as { name?: string; description?: string; chain?: RoutingChainStep[] }
    if (body.chain !== undefined && (!Array.isArray(body.chain) || body.chain.length === 0)) {
      return reply.status(400).send({ error: 'chain must be a non-empty array' })
    }

    const updated: RoutingProfile = {
      ...existing,
      name: body.name?.trim() ?? existing.name,
      description: body.description?.trim() ?? existing.description,
      chain: body.chain ?? existing.chain,
    }
    await db.execute(
      'UPDATE routing_profiles SET name=$1, description=$2, chain=$3 WHERE id=$4',
      [updated.name, updated.description, JSON.stringify(updated.chain), id]
    )
    profilesMap.set(id, updated)
    return { ok: true, profile: updated }
  })

  app.delete('/routing-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    if (!profilesMap.has(id)) return reply.status(404).send({ error: 'Routing profile not found' })
    await db.execute('DELETE FROM routing_profiles WHERE id=$1', [id])
    profilesMap.delete(id)
    return { ok: true }
  })
}
