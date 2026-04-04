// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerSkillRoutes } from './skill-routes.js'

function makeApp() {
  const app = Fastify()
  const mockSkillsManager = {
    enableSkill: vi.fn().mockResolvedValue({ name: 'bash', status: 'installed' }),
    disableSkill: vi.fn().mockResolvedValue({ name: 'bash', status: 'disabled' }),
  }
  const mockAuditLogger = { log: vi.fn() }
  registerSkillRoutes(app, mockSkillsManager as any, mockAuditLogger as any)
  return { app, mockSkillsManager, mockAuditLogger }
}

describe('POST /skills/:name/enable', () => {
  it('enables skill and returns ok', async () => {
    const { app, mockSkillsManager } = makeApp()
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/skills/bash/enable' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: true })
    expect(mockSkillsManager.enableSkill).toHaveBeenCalledWith('bash')
  })

  it('returns 404 when skill not installed', async () => {
    const { app, mockSkillsManager } = makeApp()
    mockSkillsManager.enableSkill.mockRejectedValueOnce(new Error("Skill 'nope' is not installed"))
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/skills/nope/enable' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for generic manager error', async () => {
    const { app, mockSkillsManager } = makeApp()
    mockSkillsManager.enableSkill.mockRejectedValueOnce(new Error('something went wrong'))
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/skills/bash/enable' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('something went wrong')
  })
})

describe('POST /skills/:name/disable', () => {
  it('disables skill and returns ok', async () => {
    const { app, mockSkillsManager } = makeApp()
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/skills/bash/disable' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: true })
    expect(mockSkillsManager.disableSkill).toHaveBeenCalledWith('bash')
  })

  it('returns 404 when skill not installed', async () => {
    const { app, mockSkillsManager } = makeApp()
    mockSkillsManager.disableSkill.mockRejectedValueOnce(new Error("Skill 'nope' is not installed"))
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/skills/nope/disable' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 400 for generic manager error', async () => {
    const { app, mockSkillsManager } = makeApp()
    mockSkillsManager.disableSkill.mockRejectedValueOnce(new Error('something went wrong'))
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/skills/bash/disable' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('something went wrong')
  })
})
