// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionSearchCandidate } from './session-search.js'

// ─── Mock model router ────────────────────────────────────────────────────────

const mockComplete = vi.fn()
const mockModelRouter = {
  resolveModel: vi.fn(() => 'gpt-4.1-mini'),
  complete: mockComplete,
} as any

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('rankSessionsByRelevance', () => {
  beforeEach(() => mockComplete.mockReset())

  it('returns empty array immediately for empty session list', async () => {
    const { rankSessionsByRelevance } = await import('./session-search.js')
    const result = await rankSessionsByRelevance('vault', [], mockModelRouter)
    expect(result).toEqual([])
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('returns session IDs mapped from model index response', async () => {
    mockComplete.mockResolvedValue({ content: '[1, 0]' })
    const { rankSessionsByRelevance } = await import('./session-search.js')
    const sessions: SessionSearchCandidate[] = [
      { id: 'sess-a', name: 'Auth bug fix', agentId: 'main', createdAt: '', firstMessage: 'fix login', excerpt: null },
      { id: 'sess-b', name: 'Vault sync debug', agentId: 'main', createdAt: '', firstMessage: 'vault not syncing', excerpt: null },
    ]
    const result = await rankSessionsByRelevance('vault', sessions, mockModelRouter)
    expect(result).toEqual(['sess-b', 'sess-a'])
  })

  it('filters out out-of-bounds indices from model response', async () => {
    mockComplete.mockResolvedValue({ content: '[0, 99, -1]' })
    const { rankSessionsByRelevance } = await import('./session-search.js')
    const sessions: SessionSearchCandidate[] = [
      { id: 'sess-a', name: 'Session A', agentId: 'main', createdAt: '', firstMessage: null, excerpt: null },
    ]
    const result = await rankSessionsByRelevance('query', sessions, mockModelRouter)
    expect(result).toEqual(['sess-a'])
  })

  it('returns empty array when model returns no matching indices', async () => {
    mockComplete.mockResolvedValue({ content: '[]' })
    const { rankSessionsByRelevance } = await import('./session-search.js')
    const sessions: SessionSearchCandidate[] = [
      { id: 'sess-a', name: 'Unrelated', agentId: 'main', createdAt: '', firstMessage: null, excerpt: null },
    ]
    const result = await rankSessionsByRelevance('xyz', sessions, mockModelRouter)
    expect(result).toEqual([])
  })

  it('returns empty array when model returns unparseable response', async () => {
    mockComplete.mockResolvedValue({ content: 'I cannot find any relevant sessions.' })
    const { rankSessionsByRelevance } = await import('./session-search.js')
    const sessions: SessionSearchCandidate[] = [
      { id: 'sess-a', name: 'A session', agentId: 'main', createdAt: '', firstMessage: null, excerpt: null },
    ]
    const result = await rankSessionsByRelevance('query', sessions, mockModelRouter)
    expect(result).toEqual([])
  })
})
