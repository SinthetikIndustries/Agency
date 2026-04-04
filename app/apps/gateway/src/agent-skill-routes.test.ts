// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerAgentSkillRoutes } from './agent-skill-routes.js'

function makeApp() {
  const app = Fastify()
  const mockDb = {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(undefined),
  }
  const mockSkillsManager = {
    listAgentSkills: vi.fn().mockResolvedValue([]),
    enableAgentSkill: vi.fn().mockResolvedValue(undefined),
    disableAgentSkill: vi.fn().mockResolvedValue(undefined),
  }
  const mockAuditLogger = { log: vi.fn() }
  registerAgentSkillRoutes(app, mockDb as any, mockSkillsManager as any, mockAuditLogger as any)
  return { app, mockDb, mockSkillsManager, mockAuditLogger }
}

describe('GET /agents/:slug/skills', () => {
  it('returns skills for agent', async () => {
    const { app, mockDb, mockSkillsManager } = makeApp()
    mockDb.queryOne.mockResolvedValueOnce({ id: 'agent-1' })
    mockSkillsManager.listAgentSkills.mockResolvedValueOnce([
      { id: '1', name: 'bash', type: 'tool', enabled: true }
    ])
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/my-agent/skills' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.skills).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('returns 404 for unknown agent', async () => {
    const { app } = makeApp()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/nobody/skills' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 500 when listAgentSkills throws', async () => {
    const { app, mockDb, mockSkillsManager } = makeApp()
    mockDb.queryOne.mockResolvedValueOnce({ id: 'agent-1' })
    mockSkillsManager.listAgentSkills.mockRejectedValueOnce(new Error('db error'))
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/my-agent/skills' })
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('db error')
  })
})

describe('POST /agents/:slug/skills/:name/enable', () => {
  it('enables skill and calls enableAgentSkill', async () => {
    const { app, mockDb, mockSkillsManager } = makeApp()
    mockDb.queryOne.mockResolvedValueOnce({ id: 'agent-1' })
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/agents/my-agent/skills/bash/enable' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    expect(mockSkillsManager.enableAgentSkill).toHaveBeenCalledWith('agent-1', 'bash')
  })

  it('returns 404 for unknown agent', async () => {
    const { app } = makeApp()
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/agents/nobody/skills/bash/enable' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 when enableAgentSkill throws', async () => {
    const { app, mockDb, mockSkillsManager } = makeApp()
    mockDb.queryOne.mockResolvedValueOnce({ id: 'agent-1' })
    mockSkillsManager.enableAgentSkill.mockRejectedValueOnce(new Error('already enabled'))
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/agents/my-agent/skills/bash/enable' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('already enabled')
  })
})

describe('POST /agents/:slug/skills/:name/disable', () => {
  it('disables skill and calls disableAgentSkill', async () => {
    const { app, mockDb, mockSkillsManager } = makeApp()
    mockDb.queryOne.mockResolvedValueOnce({ id: 'agent-1' })
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/agents/my-agent/skills/bash/disable' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
    expect(mockSkillsManager.disableAgentSkill).toHaveBeenCalledWith('agent-1', 'bash')
  })

  it('returns 404 for unknown agent', async () => {
    const { app } = makeApp()
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/agents/nobody/skills/bash/disable' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 when disableAgentSkill throws', async () => {
    const { app, mockDb, mockSkillsManager } = makeApp()
    mockDb.queryOne.mockResolvedValueOnce({ id: 'agent-1' })
    mockSkillsManager.disableAgentSkill.mockRejectedValueOnce(new Error('not enabled'))
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/agents/my-agent/skills/bash/disable' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('not enabled')
  })
})
