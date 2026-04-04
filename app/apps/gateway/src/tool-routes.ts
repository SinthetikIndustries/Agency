// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'
import type { ToolRegistry } from '@agency/tool-registry'
import type { AuditLogger } from './audit.js'
import type { HooksManager } from './hooks-manager.js'

export function registerToolRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  toolRegistry: ToolRegistry,
  auditLogger: AuditLogger,
  hooksManager?: HooksManager
): void {
  app.get('/tools', async () => {
    const tools = toolRegistry.list()
    const overrides = await db.query<{ tool_name: string; enabled: boolean }>(
      'SELECT tool_name, enabled FROM tool_overrides'
    )
    const overrideMap = new Map(overrides.map(r => [r.tool_name, r.enabled]))
    return {
      tools: tools.map(t => ({
        ...t,
        enabled: overrideMap.get(t.name) ?? true,
      })),
    }
  })

  app.post('/tools/:name/enable', async (request, reply) => {
    const { name } = request.params as { name: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!toolRegistry.get(name)) return reply.status(404).send({ error: `Tool "${name}" not found` })
    await db.execute(
      `INSERT INTO tool_overrides (tool_name, enabled, updated_at)
       VALUES ($1, true, now())
       ON CONFLICT (tool_name) DO UPDATE SET enabled = true, updated_at = now()`,
      [name]
    )
    void auditLogger.log({ action: 'tool.enable', actor: 'user', targetType: 'tool', targetId: name })
    hooksManager?.fire('tool.enabled', { toolName: name }).catch(e => console.error('[Hooks] tool.enabled fire failed:', e))
    return { ok: true }
  })

  app.post('/tools/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!toolRegistry.get(name)) return reply.status(404).send({ error: `Tool "${name}" not found` })
    await db.execute(
      `INSERT INTO tool_overrides (tool_name, enabled, updated_at)
       VALUES ($1, false, now())
       ON CONFLICT (tool_name) DO UPDATE SET enabled = false, updated_at = now()`,
      [name]
    )
    void auditLogger.log({ action: 'tool.disable', actor: 'user', targetType: 'tool', targetId: name })
    hooksManager?.fire('tool.disabled', { toolName: name }).catch(e => console.error('[Hooks] tool.disabled fire failed:', e))
    return { ok: true }
  })
}
