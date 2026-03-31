// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { registerVaultRoutes } from './vault-routes.js'

describe('vault routes', () => {
  it('GET /vault/status returns sync status shape', async () => {
    const app = Fastify()
    const mockDb = {
      queryOne: vi.fn().mockResolvedValue({ count: '3', last_sync: new Date().toISOString() }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }
    await registerVaultRoutes(app, { db: mockDb as any, vaultSync: null })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('enabled')
    expect(body).toHaveProperty('documentCount')
    expect(body).toHaveProperty('errorCount')
    expect(body).toHaveProperty('lastSyncAt')
  })
})
