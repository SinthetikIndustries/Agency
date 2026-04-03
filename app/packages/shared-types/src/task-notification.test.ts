// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { formatTaskNotification, parseTaskNotification } from './index.js'

describe('formatTaskNotification', () => {
  it('produces a task-notification XML envelope', () => {
    const xml = formatTaskNotification({
      taskId: 'task-123',
      status: 'completed',
      summary: 'Done',
    })
    expect(xml).toContain('<task-notification>')
    expect(xml).toContain('<task-id>task-123</task-id>')
    expect(xml).toContain('<status>completed</status>')
    expect(xml).toContain('<summary>Done</summary>')
    expect(xml).toContain('</task-notification>')
  })

  it('omits result tag when result is absent', () => {
    const xml = formatTaskNotification({ taskId: 'x', status: 'failed', summary: 'Oops' })
    expect(xml).not.toContain('<result>')
  })

  it('includes result tag when provided', () => {
    const xml = formatTaskNotification({ taskId: 'x', status: 'completed', summary: 'ok', result: 'the output' })
    expect(xml).toContain('<result>the output</result>')
  })

  it('includes usage when provided', () => {
    const xml = formatTaskNotification({
      taskId: 'x',
      status: 'completed',
      summary: 'ok',
      usage: { totalTokens: 500, toolUses: 3, durationMs: 1200 },
    })
    expect(xml).toContain('<total_tokens>500</total_tokens>')
    expect(xml).toContain('<tool_uses>3</tool_uses>')
    expect(xml).toContain('<duration_ms>1200</duration_ms>')
  })
})

describe('parseTaskNotification', () => {
  it('parses a complete notification', () => {
    const xml = `<task-notification>\n<task-id>abc</task-id>\n<status>completed</status>\n<summary>It worked</summary>\n</task-notification>`
    const result = parseTaskNotification(xml)
    expect(result).not.toBeNull()
    expect(result?.taskId).toBe('abc')
    expect(result?.status).toBe('completed')
    expect(result?.summary).toBe('It worked')
  })

  it('parses result field when present', () => {
    const xml = formatTaskNotification({ taskId: 'r1', status: 'completed', summary: 'done', result: 'commit abc123' })
    const result = parseTaskNotification(xml)
    expect(result?.result).toBe('commit abc123')
  })

  it('returns null for text missing required fields', () => {
    expect(parseTaskNotification('Hello, how can I help?')).toBeNull()
    expect(parseTaskNotification('<task-notification><task-id>x</task-id></task-notification>')).toBeNull()
  })

  it('round-trips through format and parse', () => {
    const original = { taskId: 'rt-1', status: 'failed' as const, summary: 'exploded', result: 'traceback here' }
    const parsed = parseTaskNotification(formatTaskNotification(original))
    expect(parsed?.taskId).toBe(original.taskId)
    expect(parsed?.status).toBe(original.status)
    expect(parsed?.summary).toBe(original.summary)
    expect(parsed?.result).toBe(original.result)
  })
})
