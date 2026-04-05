// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { DatabaseClient } from '@agency/orchestrator/db'
import type { AuditLogger } from './audit.js'

export interface WorkspaceGroup {
  id: string
  name: string
  description: string | null
  hierarchyType: string
  goals: string[]
  workspacePath: string
  memoryPath: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface GroupMember {
  groupId: string
  agentId: string
  role: string
  joinedAt: string
  agentName?: string
  agentSlug?: string
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50)
}

export async function registerGroupRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  auditLogger: AuditLogger,
): Promise<void> {
  const sharedDir = join(homedir(), '.agency', 'shared')

  // GET /groups — list all groups
  app.get('/groups', async (_req, reply) => {
    const rows = await db.query<WorkspaceGroup & { member_count: string }>(
      `SELECT g.*, COUNT(m.agent_id)::text as member_count
       FROM workspace_groups g
       LEFT JOIN workspace_group_members m ON m.group_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    )
    return reply.send({ groups: rows.map(r => ({
      ...r,
      goals: Array.isArray(r.goals) ? r.goals : (typeof r.goals === 'string' ? JSON.parse(r.goals) : []),
      memberCount: parseInt(r.member_count ?? '0', 10),
    })) })
  })

  // POST /groups — create group
  app.post('/groups', async (req, reply) => {
    const body = req.body as { name: string; slug?: string; description?: string; hierarchyType?: string; goals?: string[] }
    if (!body.name) return reply.status(400).send({ error: 'name is required' })

    const id = randomUUID()
    const slug = body.slug ?? slugify(body.name)
    const workspacePath = join(sharedDir, slug, 'workspace')
    const memoryPath = join(sharedDir, slug, 'memory')

    await mkdir(workspacePath, { recursive: true })
    await mkdir(memoryPath, { recursive: true })

    await db.execute(
      `INSERT INTO workspace_groups (id, name, description, hierarchy_type, goals, workspace_path, memory_path, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [id, body.name, body.description ?? null, body.hierarchyType ?? 'flat', JSON.stringify(body.goals ?? []), workspacePath, memoryPath]
    )

    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [id])
    void auditLogger.log({ action: 'group.create', actor: 'user', targetType: 'group', targetId: id, details: { name: body.name, slug } })
    return reply.status(201).send({ group })
  })

  // GET /groups/:id
  app.get<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [req.params.id])
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const members = await db.query<GroupMember & { agent_name: string; agent_slug: string }>(
      `SELECT m.*, a.name as agent_name, a.slug as agent_slug
       FROM workspace_group_members m
       JOIN agent_identities a ON a.id = m.agent_id
       WHERE m.group_id = $1
       ORDER BY m.joined_at ASC`,
      [req.params.id]
    )

    return reply.send({
      group: {
        ...group,
        goals: Array.isArray(group.goals) ? group.goals : (typeof group.goals === 'string' ? JSON.parse(group.goals as unknown as string) : []),
      },
      members: members.map(m => ({
        agentId: m.agentId ?? (m as unknown as Record<string,string>)['agent_id'],
        role: m.role,
        joinedAt: m.joinedAt ?? (m as unknown as Record<string,string>)['joined_at'],
        agentName: m.agentName ?? (m as unknown as Record<string,string>)['agent_name'],
        agentSlug: m.agentSlug ?? (m as unknown as Record<string,string>)['agent_slug'],
      })),
    })
  })

  // PATCH /groups/:id
  app.patch<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    const body = req.body as { name?: string; description?: string; hierarchyType?: string; goals?: string[] }
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.name !== undefined) { sets.push(`name=$${i++}`); vals.push(body.name) }
    if (body.description !== undefined) { sets.push(`description=$${i++}`); vals.push(body.description) }
    if (body.hierarchyType !== undefined) { sets.push(`hierarchy_type=$${i++}`); vals.push(body.hierarchyType) }
    if (body.goals !== undefined) { sets.push(`goals=$${i++}`); vals.push(JSON.stringify(body.goals)) }
    if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' })
    sets.push(`updated_at=NOW()`)
    vals.push(req.params.id)
    await db.execute(`UPDATE workspace_groups SET ${sets.join(',')} WHERE id=$${i}`, vals)
    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [req.params.id])
    if (!group) return reply.status(404).send({ error: 'Group not found' })
    void auditLogger.log({ action: 'group.update', actor: 'user', targetType: 'group', targetId: req.params.id })
    return reply.send({ group })
  })

  // DELETE /groups/:id — deletes DB record, preserves directory
  app.delete<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [req.params.id])
    if (!group) return reply.status(404).send({ error: 'Group not found' })
    await db.execute('DELETE FROM workspace_groups WHERE id=$1', [req.params.id])
    void auditLogger.log({ action: 'group.delete', actor: 'user', targetType: 'group', targetId: req.params.id })
    return reply.send({ success: true, message: 'Group deleted. Shared directory preserved on disk.' })
  })

  // POST /groups/:id/members — add agent to group
  app.post<{ Params: { id: string } }>('/groups/:id/members', async (req, reply) => {
    const body = req.body as { agentId: string; role?: string }
    if (!body.agentId) return reply.status(400).send({ error: 'agentId is required' })

    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [req.params.id])
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const agent = await db.queryOne<{ id: string; additional_workspace_paths: string[] | null }>(
      "SELECT id, additional_workspace_paths FROM agent_identities WHERE (id=$1 OR slug=$1) AND status != 'deleted'",
      [body.agentId]
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    await db.execute(
      `INSERT INTO workspace_group_members (group_id, agent_id, role, joined_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (group_id, agent_id) DO UPDATE SET role=$3`,
      [req.params.id, agent.id, body.role ?? 'member']
    )

    // Add group workspace path to agent's additional_workspace_paths
    const existing = agent.additional_workspace_paths ?? []
    const workspacePath = group.workspacePath ?? (group as unknown as Record<string, string>)['workspace_path']
    if (!existing.includes(workspacePath)) {
      const updated = [...existing, workspacePath]
      await db.execute(
        'UPDATE agent_identities SET additional_workspace_paths=$1, updated_at=NOW() WHERE id=$2',
        [updated, agent.id]
      )
    }

    void auditLogger.log({ action: 'group.member_add', actor: 'user', targetType: 'group', targetId: req.params.id, details: { agentId: agent.id } })
    return reply.status(201).send({ success: true })
  })

  // DELETE /groups/:id/members/:agentId — remove agent from group
  app.delete<{ Params: { id: string; agentId: string } }>('/groups/:id/members/:agentId', async (req, reply) => {
    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [req.params.id])
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const agent = await db.queryOne<{ id: string; additional_workspace_paths: string[] | null }>(
      "SELECT id, additional_workspace_paths FROM agent_identities WHERE (id=$1 OR slug=$1) AND status != 'deleted'",
      [req.params.agentId]
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    await db.execute(
      'DELETE FROM workspace_group_members WHERE group_id=$1 AND agent_id=$2',
      [req.params.id, agent.id]
    )

    // Remove group workspace path from agent's additional_workspace_paths
    const existing = agent.additional_workspace_paths ?? []
    const workspacePath = group.workspacePath ?? (group as unknown as Record<string, string>)['workspace_path']
    const updated = existing.filter(p => p !== workspacePath)
    await db.execute(
      'UPDATE agent_identities SET additional_workspace_paths=$1, updated_at=NOW() WHERE id=$2',
      [updated, agent.id]
    )

    void auditLogger.log({ action: 'group.member_remove', actor: 'user', targetType: 'group', targetId: req.params.id, details: { agentId: agent.id } })
    return reply.send({ success: true })
  })
}
