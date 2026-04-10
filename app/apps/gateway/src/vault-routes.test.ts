// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerVaultRoutes } from './vault-routes.js'

function makeDb(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    queryOne: vi.fn().mockResolvedValue({ count: 0 }),
    query: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

async function buildApp(dbOverrides = {}) {
  const app = Fastify()
  const db = makeDb(dbOverrides)
  await registerVaultRoutes(app, { db: db as any })
  await app.ready()
  return { app, db }
}

// ─── GET /vault/status ────────────────────────────────────────────────────────

describe('GET /vault/status', () => {
  it('returns shape with enabled=false', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.enabled).toBe(false)
    expect(body).toHaveProperty('documentCount')
    expect(body.lastSyncAt).toBeNull()
  })

  it('returns document count from db', async () => {
    const { app } = await buildApp({ queryOne: vi.fn().mockResolvedValue({ count: 7 }) })
    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    expect(res.json().documentCount).toBe(7)
  })
})

// ─── GET /vault/search ────────────────────────────────────────────────────────

describe('GET /vault/search', () => {
  it('returns 400 when q is missing', async () => {
    const { app } = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/vault/search' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/q parameter/i)
  })

  it('returns results for valid query', async () => {
    const rows = [{ id: '1', relative_path: 'notes/foo.md', title: 'Foo', type: 'document', snippet: 'hello' }]
    const { app, db } = await buildApp()
    ;(db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rows)
    const res = await app.inject({ method: 'GET', url: '/vault/search?q=foo' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results).toHaveLength(1)
    expect(body.count).toBe(1)
  })

  it('caps limit at 50', async () => {
    const { app, db } = await buildApp()
    ;(db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const res = await app.inject({ method: 'GET', url: '/vault/search?q=foo&limit=999' })
    expect(res.statusCode).toBe(200)
    const callArgs = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(callArgs[1][2]).toBe(50) // third param is the limit
  })
})
