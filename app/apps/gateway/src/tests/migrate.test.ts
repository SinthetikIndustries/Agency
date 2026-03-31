// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock refs — all pg.Client instances created by runMigrations will use
// these same functions, so we can inspect their calls directly.
const mockQuery = vi.fn()
const mockConnect = vi.fn()
const mockEnd = vi.fn()

vi.mock('pg', () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      query: mockQuery,
      end: mockEnd,
    })),
  },
}))

import { runMigrations } from '../migrate.js'

describe('runMigrations advisory lock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('acquires pg_try_advisory_lock before creating the migrations table', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] }
      return { rows: [] }
    })

    // runMigrations may throw when trying to readdir; that's acceptable here
    await runMigrations('postgresql://fake').catch(() => {})

    const calls: string[] = mockQuery.mock.calls.map((c: unknown[]) => String(c[0]))
    const lockIdx = calls.findIndex(s => s.includes('pg_try_advisory_lock'))
    const createTableIdx = calls.findIndex(s => s.includes('CREATE TABLE IF NOT EXISTS _migrations'))
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(lockIdx).toBeLessThan(createTableIdx)
  })

  it('skips migrations and does not create the table when lock is not acquired', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: false }] }
      return { rows: [] }
    })

    await runMigrations('postgresql://fake')

    const calls: string[] = mockQuery.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calls.some(s => s.includes('CREATE TABLE IF NOT EXISTS _migrations'))).toBe(false)
  })
})
