// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'
import type { McpManager, McpServerDbConfig } from './mcp-manager.js'
import type { AuditLogger } from './audit.js'
import type { HooksManager } from './hooks-manager.js'

export function registerMcpRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  mcpManager: McpManager,
  auditLogger: AuditLogger,
  hooksManager?: HooksManager
): void {
  // ── Global MCP server management ─────────────────────────────────────────

  app.get('/mcp/servers', async () => {
    const rows = await db.query<{
      name: string
      config: unknown
      enabled: boolean
      status: string
      error: string | null
      created_at: string
    }>('SELECT name, config, enabled, status, error, created_at FROM mcp_servers ORDER BY created_at')

    // Merge with in-memory connection state (more up-to-date status)
    const connections = new Map(mcpManager.getConnections().map(c => [c.name, c]))
    return {
      servers: rows.map(row => {
        const live = connections.get(row.name)
        return {
          name: row.name,
          config: row.config,
          enabled: row.enabled,
          status: live?.status ?? row.status,
          error: live?.error ?? row.error ?? null,
          tools: live?.tools ?? [],
          connectedAt: live?.connectedAt ?? null,
        }
      }),
    }
  })

  app.post('/mcp/servers', async (request, reply) => {
    const body = request.body as { name?: string; config?: unknown } | undefined
    const name = body?.name?.trim()
    if (!name) return reply.status(400).send({ error: 'name is required' })
    if (!body?.config || typeof body.config !== 'object') {
      return reply.status(400).send({ error: 'config must be an object' })
    }
    const cfg = body.config as Record<string, unknown>
    if (!('command' in cfg) && !('url' in cfg)) {
      return reply.status(400).send({ error: 'config must contain "command" (stdio) or "url" (http)' })
    }
    try {
      const conn = await mcpManager.addServer(name, cfg as McpServerDbConfig)
      void auditLogger.log({ action: 'mcp.server.add', actor: 'user', targetType: 'mcp_server', targetId: name })
      return reply.status(201).send({ ok: true, server: conn })
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  app.delete('/mcp/servers/:name', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      await mcpManager.removeServer(name)
      void auditLogger.log({ action: 'mcp.server.remove', actor: 'user', targetType: 'mcp_server', targetId: name })
      return { ok: true }
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message })
    }
  })

  app.post('/mcp/servers/:name/enable', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      const conn = await mcpManager.enableServer(name)
      void auditLogger.log({ action: 'mcp.server.enable', actor: 'user', targetType: 'mcp_server', targetId: name })
      void hooksManager?.fire('mcp.connected', { serverName: name })
      return { ok: true, server: conn }
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message })
    }
  })

  app.post('/mcp/servers/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      await mcpManager.disableServer(name)
      void auditLogger.log({ action: 'mcp.server.disable', actor: 'user', targetType: 'mcp_server', targetId: name })
      void hooksManager?.fire('mcp.disconnected', { serverName: name })
      return { ok: true }
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message })
    }
  })

  app.post('/mcp/servers/:name/reconnect', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      const conn = await mcpManager.reconnect(name)
      return { ok: true, server: conn }
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message })
    }
  })

  // ── Per-agent MCP ─────────────────────────────────────────────────────────

  app.get('/agents/:slug/mcp', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const agent = await db.queryOne<{ id: string }>('SELECT id FROM agent_identities WHERE slug = $1', [slug])
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    const servers = await db.query<{ name: string; config: unknown; enabled: boolean; status: string; error: string | null }>(
      'SELECT name, config, enabled, status, error FROM mcp_servers ORDER BY created_at'
    )
    const agentRows = await db.query<{ mcp_name: string; enabled: boolean }>(
      'SELECT mcp_name, enabled FROM agent_mcp WHERE agent_id = $1',
      [agent.id]
    )
    const agentMap = new Map(agentRows.map(r => [r.mcp_name, r.enabled]))
    const connections = new Map(mcpManager.getConnections().map(c => [c.name, c]))

    return {
      servers: servers.map(s => ({
        name: s.name,
        config: s.config,
        globallyEnabled: s.enabled,
        status: connections.get(s.name)?.status ?? s.status,
        agentEnabled: agentMap.get(s.name) ?? true,
      })),
    }
  })

  app.post('/agents/:slug/mcp/:name/enable', async (request, reply) => {
    const { slug, name } = request.params as { slug: string; name: string }
    const agent = await db.queryOne<{ id: string }>('SELECT id FROM agent_identities WHERE slug = $1', [slug])
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    await db.execute(
      `INSERT INTO agent_mcp (agent_id, mcp_name, enabled, updated_at)
       VALUES ($1, $2, true, now())
       ON CONFLICT (agent_id, mcp_name) DO UPDATE SET enabled = true, updated_at = now()`,
      [agent.id, name]
    )
    void auditLogger.log({ action: 'agent_mcp.enable', actor: 'user', targetType: 'agent_mcp', targetId: `${slug}/${name}` })
    return { ok: true }
  })

  app.post('/agents/:slug/mcp/:name/disable', async (request, reply) => {
    const { slug, name } = request.params as { slug: string; name: string }
    const agent = await db.queryOne<{ id: string }>('SELECT id FROM agent_identities WHERE slug = $1', [slug])
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    await db.execute(
      `INSERT INTO agent_mcp (agent_id, mcp_name, enabled, updated_at)
       VALUES ($1, $2, false, now())
       ON CONFLICT (agent_id, mcp_name) DO UPDATE SET enabled = false, updated_at = now()`,
      [agent.id, name]
    )
    void auditLogger.log({ action: 'agent_mcp.disable', actor: 'user', targetType: 'agent_mcp', targetId: `${slug}/${name}` })
    return { ok: true }
  })
}
