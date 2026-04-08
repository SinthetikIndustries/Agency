// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerMeRoutes } from './me-routes.js'

vi.mock('@agency/config', () => ({
  agencyDir: '/tmp/test-agency',
}))

import { promises as fs } from 'fs'
import { join } from 'path'

const mockDb = {
  queryOne: vi.fn().mockResolvedValue(null),
}

async function buildApp(configOverrides = {}) {
  const app = Fastify()
  // mock auth: inject preHandler that sets request.user
  app.addHook('preHandler', (req: any, _reply, done) => {
    req.user = { id: 'test' }
    done()
  })
  await fs.mkdir('/tmp/test-agency', { recursive: true })
  await fs.writeFile(
    '/tmp/test-agency/config.json',
    JSON.stringify({ firstRun: false, name: 'Dan', ...configOverrides })
  )
  registerMeRoutes(app, { db: mockDb as any })
  return app
}

describe('GET /me', () => {
  it('returns name and onboarded=true when firstRun=false', async () => {
    const app = await buildApp({ firstRun: false, name: 'Dan' })
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ name: 'Dan', onboarded: true })
  })

  it('returns onboarded=false when firstRun=true', async () => {
    const app = await buildApp({ firstRun: true, name: '' })
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(200)
    expect(res.json().onboarded).toBe(false)
  })

  it('returns name="" when name not set in config', async () => {
    const app = await buildApp({ firstRun: false, name: undefined })
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.json().name).toBe('')
  })

  it('treats missing config.json as first-run (onboarded=false)', async () => {
    await fs.rm('/tmp/test-agency/config.json', { force: true })
    const app = Fastify()
    registerMeRoutes(app, { db: mockDb as any })
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(200)
    expect(res.json().onboarded).toBe(false)
  })
})
