// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { promises as fs } from 'fs'

vi.mock('@agency/config', () => ({
  agencyDir: '/tmp/test-agency-onboard',
}))

import { registerOnboardingRoutes } from './onboarding-routes.js'

const VALID_BODY = {
  name: 'Dan',
  sex: 'male',
  timezone: 'America/Chicago',
  country: 'US',
  state: 'Texas',
  city: 'Austin',
  role: 'Software Engineer',
  autonomy: 'balanced',
  goals: 'Build things faster with AI',
}

async function buildApp(createSessionFn: () => Promise<{ id: string }> = async () => ({ id: 'sess-123' })) {
  const app = Fastify()
  app.addHook('preHandler', (req: any, _reply, done) => {
    req.user = { id: 'test' }
    done()
  })
  await fs.mkdir('/tmp/test-agency-onboard', { recursive: true })
  await fs.writeFile(
    '/tmp/test-agency-onboard/config.json',
    JSON.stringify({ firstRun: true })
  )
  registerOnboardingRoutes(app, { createSession: createSessionFn })
  return app
}

describe('POST /onboarding', () => {
  it('returns ok and sessionId', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/onboarding', payload: VALID_BODY })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, sessionId: 'sess-123' })
  })

  it('writes name and sets firstRun=false in config', async () => {
    const app = await buildApp()
    await app.inject({ method: 'POST', url: '/onboarding', payload: VALID_BODY })
    const raw = await fs.readFile('/tmp/test-agency-onboard/config.json', 'utf8')
    const config = JSON.parse(raw)
    expect(config.name).toBe('Dan')
    expect(config.firstRun).toBe(false)
    expect(config.onboarding.city).toBe('Austin')
  })

  it('rejects missing name with 400', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/onboarding', payload: { ...VALID_BODY, name: '' } })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid autonomy with 400', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/onboarding', payload: { ...VALID_BODY, autonomy: 'hacker' } })
    expect(res.statusCode).toBe(400)
  })
})
