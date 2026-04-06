// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerWorkspaceRoutes } from './workspace-routes.js'

function makeMockDb() {
  return {
    queryOne: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeApp(db = makeMockDb()) {
  const app = Fastify()
  registerWorkspaceRoutes(app, db as any)
  return { app, db }
}

const orchestratorRow = {
  slug: 'orchestrator',
  name: 'System',
  workspace_path: '/home/user/.agency/agents/orchestrator',
  additional_workspace_paths: [
    '/home/user/.agency/agents/aria',
    '/home/user/.agency/shared/system/workspace',
  ],
}

const ariaRow = {
  slug: 'aria',
  name: 'Aria',
  workspace_path: '/home/user/.agency/agents/aria',
  additional_workspace_paths: ['/home/user/.agency/shared/team/workspace'],
}

const systemGroup = {
  id: 'sys-1',
  name: 'Agency System',
  workspace_path: '/home/user/.agency/shared/system/workspace',
  is_system: true,
}

const teamGroup = {
  id: 'team-1',
  name: 'Team',
  workspace_path: '/home/user/.agency/shared/team/workspace',
  is_system: false,
}

describe('GET /agents/:slug/workspaces', () => {
  it('returns 404 for unknown agent', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(null)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/unknown/workspaces' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Agent not found')
  })

  it('classifies secondary paths for orchestrator', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(orchestratorRow)
    db.query
      .mockResolvedValueOnce([ariaRow])                // all other agents
      .mockResolvedValueOnce([systemGroup, teamGroup]) // all groups for orchestrator
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/orchestrator/workspaces' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.primary).toEqual({ path: '/home/user/.agency/agents/orchestrator' })
    expect(body.secondary).toHaveLength(1)
    expect(body.secondary[0]).toMatchObject({ path: '/home/user/.agency/agents/aria', agentName: 'Aria', agentSlug: 'aria' })
    expect(body.groupWorkspaces).toHaveLength(2)
    expect(body.groupWorkspaces[0]).toMatchObject({ groupId: 'sys-1', groupName: 'Agency System', isSystemGroup: true })
    expect(body.groupWorkspaces[1]).toMatchObject({ groupId: 'team-1', groupName: 'Team', isSystemGroup: false })
  })

  it('returns empty secondary for non-orchestrator agents', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(ariaRow)
    db.query
      .mockResolvedValueOnce([orchestratorRow]) // all other agents
      .mockResolvedValueOnce([teamGroup])        // aria's groups
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/aria/workspaces' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.secondary).toHaveLength(0)
    expect(body.groupWorkspaces).toHaveLength(1)
    expect(body.groupWorkspaces[0]).toMatchObject({ groupId: 'team-1', isSystemGroup: false })
  })

  it('orchestrator sees all groups including system group', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(orchestratorRow)
    db.query
      .mockResolvedValueOnce([ariaRow])
      .mockResolvedValueOnce([systemGroup, teamGroup])
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/orchestrator/workspaces' })
    const body = res.json()
    expect(body.groupWorkspaces.some((g: { isSystemGroup: boolean }) => g.isSystemGroup)).toBe(true)
  })

  it('non-orchestrator agents do not see system group', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(ariaRow)
    db.query
      .mockResolvedValueOnce([orchestratorRow])
      .mockResolvedValueOnce([teamGroup])
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/aria/workspaces' })
    const body = res.json()
    expect(body.groupWorkspaces.some((g: { isSystemGroup: boolean }) => g.isSystemGroup)).toBe(false)
  })
})
