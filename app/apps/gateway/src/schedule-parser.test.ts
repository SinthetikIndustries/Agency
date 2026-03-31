// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { parseSchedule, toHumanReadable, computeNextRun } from './schedule-parser.js'

describe('parseSchedule', () => {
  it('accepts a valid cron expression unchanged', () => {
    const r = parseSchedule('0 5 * * 1', 'recurring')
    expect(r.schedule).toBe('0 5 * * 1')
    expect(r.type).toBe('recurring')
  })

  it('parses "every monday at 5am"', () => {
    const r = parseSchedule('every monday at 5am', 'recurring')
    expect(r.schedule).toBe('0 5 * * 1')
  })

  it('parses "every day at 9am"', () => {
    const r = parseSchedule('every day at 9am', 'recurring')
    expect(r.schedule).toBe('0 9 * * *')
  })

  it('parses "first of every month at 8am"', () => {
    const r = parseSchedule('first of every month at 8am', 'recurring')
    expect(r.schedule).toBe('0 8 1 * *')
  })

  it('parses "last day of every month at 11pm"', () => {
    const r = parseSchedule('last day of every month at 11pm', 'recurring')
    // BullMQ may not support 'L' — use '0 23 28-31 * *' as fallback if CronExpressionParser rejects 'L'
    // Try 'L' first; if it throws, the implementation should use the fallback
    expect(r.schedule).toMatch(/L|28-31/)
  })

  it('parses "every 2 hours"', () => {
    const r = parseSchedule('every 2 hours', 'recurring')
    expect(r.schedule).toBe('0 */2 * * *')
  })

  it('parses "every 30 minutes"', () => {
    const r = parseSchedule('every 30 minutes', 'recurring')
    expect(r.schedule).toBe('*/30 * * * *')
  })

  it('accepts an ISO datetime for a one-off task', () => {
    const iso = '2026-05-01T09:00:00.000Z'
    const r = parseSchedule(iso, 'once')
    expect(r.schedule).toBe(iso)
    expect(r.type).toBe('once')
  })

  it('throws on unrecognised input', () => {
    expect(() => parseSchedule('banana', 'recurring')).toThrow()
  })

  it('throws on unrecognised input with type once', () => {
    expect(() => parseSchedule('banana', 'once')).toThrow()
    expect(() => parseSchedule('every monday at 5am', 'once')).toThrow()
  })
})

describe('toHumanReadable', () => {
  it('converts a cron to readable text', () => {
    const label = toHumanReadable('0 5 * * 1', 'recurring')
    expect(label).toContain('Monday')
  })

  it('formats a one-off datetime', () => {
    const label = toHumanReadable('2026-05-01T09:00:00.000Z', 'once')
    expect(label).toContain('2026')
  })
})

describe('computeNextRun', () => {
  it('returns a future date for a valid cron', () => {
    const next = computeNextRun('0 5 * * 1', 'recurring')
    expect(next.getTime()).toBeGreaterThan(Date.now())
  })

  it('returns the ISO date itself for a one-off', () => {
    const iso = '2099-01-01T00:00:00.000Z'
    const next = computeNextRun(iso, 'once')
    expect(next.toISOString()).toBe(iso)
  })
})
