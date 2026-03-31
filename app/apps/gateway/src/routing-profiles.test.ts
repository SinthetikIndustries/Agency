// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerRoutingProfileRoutes } from './routing-profiles.js'
import type { RoutingProfile } from './routing-profiles.js'

function makeApp(profilesMap: Map<string, RoutingProfile>) {
  const app = Fastify()
  const mockDb = {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(undefined),
  }
  registerRoutingProfileRoutes(app, mockDb as any, profilesMap)
  return { app, mockDb }
}

describe('routing profile routes', () => {
  it('GET /routing-profiles returns empty list', async () => {
    const { app } = makeApp(new Map())
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/routing-profiles' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ profiles: [] })
  })

  it('POST /routing-profiles creates a profile', async () => {
    const map = new Map<string, RoutingProfile>()
    const { app, mockDb } = makeApp(map)
    await app.ready()
    const res = await app.inject({
      method: 'POST', url: '/routing-profiles',
      payload: { name: 'Test', chain: [{ model: 'gpt-4.1', provider: 'openai' }] },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
    expect(body.profile.name).toBe('Test')
    expect(map.size).toBe(1)
    expect(mockDb.execute).toHaveBeenCalled()
  })

  it('POST /routing-profiles rejects empty chain', async () => {
    const { app } = makeApp(new Map())
    await app.ready()
    const res = await app.inject({
      method: 'POST', url: '/routing-profiles',
      payload: { name: 'Bad', chain: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('DELETE /routing-profiles/:id removes from map', async () => {
    const profile: RoutingProfile = {
      id: 'abc', name: 'X', description: '', chain: [{ model: 'gpt-4.1', provider: 'openai' }], createdAt: new Date().toISOString(),
    }
    const map = new Map([['abc', profile]])
    const { app } = makeApp(map)
    await app.ready()
    const res = await app.inject({ method: 'DELETE', url: '/routing-profiles/abc' })
    expect(res.statusCode).toBe(200)
    expect(map.size).toBe(0)
  })

  it('DELETE /routing-profiles/:id returns 404 for unknown id', async () => {
    const { app } = makeApp(new Map())
    await app.ready()
    const res = await app.inject({ method: 'DELETE', url: '/routing-profiles/nope' })
    expect(res.statusCode).toBe(404)
  })
})
