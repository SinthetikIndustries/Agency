// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock model router ────────────────────────────────────────────────────────

const mockComplete = vi.fn()
const mockModelRouter = {
  resolveModel: vi.fn(() => 'gpt-4.1-mini'),
  complete: mockComplete,
} as any

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generatePromptSuggestions', () => {
  beforeEach(() => mockComplete.mockReset())

  it('returns empty array for empty message list', async () => {
    const { generatePromptSuggestions } = await import('./prompt-suggestions.js')
    const result = await generatePromptSuggestions([], mockModelRouter)
    expect(result).toEqual([])
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('returns parsed suggestions from model response', async () => {
    mockComplete.mockResolvedValue({ content: '["Run the tests", "Show me the diff"]' })
    const { generatePromptSuggestions } = await import('./prompt-suggestions.js')
    const messages = [
      { role: 'user', content: 'Fix the login bug' },
      { role: 'assistant', content: 'I found the issue in auth.ts.' },
    ]
    const result = await generatePromptSuggestions(messages, mockModelRouter)
    expect(result).toEqual(['Run the tests', 'Show me the diff'])
  })

  it('caps results at 3 suggestions', async () => {
    mockComplete.mockResolvedValue({ content: '["One", "Two", "Three", "Four", "Five"]' })
    const { generatePromptSuggestions } = await import('./prompt-suggestions.js')
    const messages = [{ role: 'user', content: 'hello' }]
    const result = await generatePromptSuggestions(messages, mockModelRouter)
    expect(result).toHaveLength(3)
  })

  it('returns empty array when model returns unparseable response', async () => {
    mockComplete.mockResolvedValue({ content: 'Here are some follow-up ideas: ...' })
    const { generatePromptSuggestions } = await import('./prompt-suggestions.js')
    const messages = [{ role: 'user', content: 'hello' }]
    const result = await generatePromptSuggestions(messages, mockModelRouter)
    expect(result).toEqual([])
  })

  it('filters out non-string items from model response', async () => {
    mockComplete.mockResolvedValue({ content: '["Valid suggestion", null, 42, "Another valid"]' })
    const { generatePromptSuggestions } = await import('./prompt-suggestions.js')
    const messages = [{ role: 'user', content: 'hello' }]
    const result = await generatePromptSuggestions(messages, mockModelRouter)
    expect(result).toEqual(['Valid suggestion', 'Another valid'])
  })
})
