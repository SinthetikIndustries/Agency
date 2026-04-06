// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'

interface AgentRow {
  slug: string
  name: string
  workspace_path: string
  additional_workspace_paths: string[] | null
}

interface GroupRow {
  id: string
  name: string
  workspace_path: string
  is_system: boolean
}

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
): Promise<void> {
  app.get<{ Params: { slug: string } }>('/agents/:slug/workspaces', async (request, reply) => {
    const { slug } = request.params

    const agent = await db.queryOne<AgentRow>(
      "SELECT slug, name, workspace_path, additional_workspace_paths FROM agent_identities WHERE slug=$1 AND status != 'deleted'",
      [slug]
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    const primary = { path: agent.workspace_path }
    const additionalPaths = agent.additional_workspace_paths ?? []

    // Build map of other agents' primary workspace paths for secondary classification
    const otherAgents = await db.query<AgentRow>(
      "SELECT slug, name, workspace_path FROM agent_identities WHERE slug != $1 AND status != 'deleted'",
      [slug]
    )
    const agentByPath = new Map(otherAgents.map(a => [a.workspace_path, a]))

    const secondary = additionalPaths
      .filter(p => agentByPath.has(p))
      .map(p => {
        const a = agentByPath.get(p)!
        return { path: p, agentName: a.name, agentSlug: a.slug }
      })

    // Group workspaces: orchestrator sees all groups, others see only their memberships (system excluded)
    let groupRows: GroupRow[]
    if (slug === 'orchestrator') {
      groupRows = await db.query<GroupRow>(
        'SELECT id, name, workspace_path, is_system FROM workspace_groups ORDER BY is_system DESC, created_at ASC'
      )
    } else {
      groupRows = await db.query<GroupRow>(
        `SELECT g.id, g.name, g.workspace_path, g.is_system
         FROM workspace_groups g
         JOIN workspace_group_members m ON m.group_id = g.id
         JOIN agent_identities a ON a.id = m.agent_id
         WHERE a.slug = $1 AND g.is_system = FALSE`,
        [slug]
      )
    }

    const groupWorkspaces = groupRows.map(g => ({
      path: g.workspace_path,
      groupId: g.id,
      groupName: g.name,
      isSystemGroup: g.is_system,
    }))

    return reply.send({ primary, secondary, groupWorkspaces })
  })
}
