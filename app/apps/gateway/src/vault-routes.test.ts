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

function makeSyncQueryOneSequence(docCount: number, errorCount: number, lastSyncAt: string | null) {
  let call = 0
  return vi.fn().mockImplementation(() => {
    call++
    if (call === 1) return Promise.resolve({ count: docCount })
    if (call === 2) return Promise.resolve({ count: errorCount })
    return Promise.resolve(lastSyncAt ? { synced_at: lastSyncAt } : null)
  })
}

async function buildApp(vaultSync: unknown = null, dbOverrides = {}) {
  const app = Fastify()
  const db = makeDb(dbOverrides)
  await registerVaultRoutes(app, { db: db as any, vaultSync: vaultSync as any })
  await app.ready()
  return { app, db }
}

// ─── GET /vault/status ────────────────────────────────────────────────────────

describe('GET /vault/status', () => {
  it('returns shape with enabled=false when vaultSync is null', async () => {
    const { app } = await buildApp(null)
    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.enabled).toBe(false)
    expect(body).toHaveProperty('documentCount')
    expect(body).toHaveProperty('errorCount')
    expect(body).toHaveProperty('lastSyncAt')
  })

  it('returns enabled=true when vaultSync is provided', async () => {
    const { app } = await buildApp({ fullSync: vi.fn(), validate: vi.fn() })
    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    expect(res.statusCode).toBe(200)
    expect(res.json().enabled).toBe(true)
  })

  it('returns correct counts from db', async () => {
    const app = Fastify()
    const db = { queryOne: makeSyncQueryOneSequence(7, 2, '2026-01-01T00:00:00Z'), query: vi.fn() }
    await registerVaultRoutes(app, { db: db as any, vaultSync: null })
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    const body = res.json()
    expect(body.documentCount).toBe(7)
    expect(body.errorCount).toBe(2)
    expect(body.lastSyncAt).toBe('2026-01-01T00:00:00Z')
  })

  it('returns null lastSyncAt when no sync events exist', async () => {
    const app = Fastify()
    const db = { queryOne: makeSyncQueryOneSequence(0, 0, null), query: vi.fn() }
    await registerVaultRoutes(app, { db: db as any, vaultSync: null })
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/vault/status' })
    expect(res.json().lastSyncAt).toBeNull()
  })
})

// ─── POST /vault/sync ─────────────────────────────────────────────────────────

describe('POST /vault/sync', () => {
  it('returns 503 when vaultSync is null', async () => {
    const { app } = await buildApp(null)
    const res = await app.inject({ method: 'POST', url: '/vault/sync' })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatch(/not enabled/i)
  })

  it('returns 202 and fires sync when vaultSync is present', async () => {
    const mockVaultSync = { fullSync: vi.fn().mockResolvedValue(undefined), validate: vi.fn() }
    const { app } = await buildApp(mockVaultSync)
    const res = await app.inject({ method: 'POST', url: '/vault/sync' })
    expect(res.statusCode).toBe(202)
    expect(res.json().message).toMatch(/sync started/i)
    await new Promise(r => setTimeout(r, 10)) // let fire-and-forget settle
    expect(mockVaultSync.fullSync).toHaveBeenCalled()
  })
})

// ─── GET /vault/validate ──────────────────────────────────────────────────────

describe('GET /vault/validate', () => {
  it('returns 503 when vaultSync is null', async () => {
    const { app } = await buildApp(null)
    const res = await app.inject({ method: 'GET', url: '/vault/validate' })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatch(/not enabled/i)
  })

  it('returns validation result from vaultSync', async () => {
    const mockResult = { valid: true, errors: [] }
    const mockVaultSync = { fullSync: vi.fn(), validate: vi.fn().mockResolvedValue(mockResult) }
    const { app } = await buildApp(mockVaultSync)
    const res = await app.inject({ method: 'GET', url: '/vault/validate' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(mockResult)
  })
})

// ─── GET /vault/search ────────────────────────────────────────────────────────

describe('GET /vault/search', () => {
  it('returns 400 when q is missing', async () => {
    const { app } = await buildApp(null)
    const res = await app.inject({ method: 'GET', url: '/vault/search' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/q parameter/i)
  })

  it('returns results for valid query', async () => {
    const rows = [{ id: '1', relative_path: 'notes/foo.md', title: 'Foo', type: 'document', snippet: 'hello' }]
    const { app, db } = await buildApp(null)
    ;(db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rows)
    const res = await app.inject({ method: 'GET', url: '/vault/search?q=foo' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results).toHaveLength(1)
    expect(body.count).toBe(1)
  })

  it('caps limit at 50', async () => {
    const { app, db } = await buildApp(null)
    ;(db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const res = await app.inject({ method: 'GET', url: '/vault/search?q=foo&limit=999' })
    expect(res.statusCode).toBe(200)
    const callArgs = (db.query as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(callArgs[1][2]).toBe(50) // third param is the limit
  })
})

// ─── GET /vault/related/:slug ─────────────────────────────────────────────────

describe('GET /vault/related/:slug', () => {
  it('returns outbound and inbound arrays', async () => {
    const outbound = [{ id: '2', relative_path: 'notes/bar.md', title: 'Bar', link_text: '[[bar]]' }]
    const { app, db } = await buildApp(null)
    ;(db.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(outbound)
      .mockResolvedValueOnce([])
    const res = await app.inject({ method: 'GET', url: '/vault/related/foo' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.outbound).toHaveLength(1)
    expect(body.outbound[0].direction).toBe('outbound')
    expect(body.inbound).toHaveLength(0)
  })
})

// ─── GET /vault/graph-status ──────────────────────────────────────────────────

describe('GET /vault/graph-status', () => {
  it('returns node, edge, and unresolved link counts', async () => {
    const app = Fastify()
    let call = 0
    const db = {
      queryOne: vi.fn().mockImplementation(() => {
        call++
        if (call === 1) return Promise.resolve({ count: 10 }) // nodes
        if (call === 2) return Promise.resolve({ count: 25 }) // edges
        return Promise.resolve({ count: 3 })                  // unresolved
      }),
      query: vi.fn(),
    }
    await registerVaultRoutes(app, { db: db as any, vaultSync: null })
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/vault/graph-status' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.nodes).toBe(10)
    expect(body.edges).toBe(25)
    expect(body.unresolvedLinks).toBe(3)
  })
})
