// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CompletionRequest } from '@agency/shared-types'

// ─── Mock Anthropic SDK ───────────────────────────────────────────────────────

const mockCreate = vi.fn()
const mockStream = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  })),
}))

vi.mock('@agency/config', () => ({ PORTS: { OLLAMA: 11434 } }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeAdapter() {
  const { AnthropicAdapter } = await import('./index.js')
  return new AnthropicAdapter('test-api-key')
}

const baseResponse = {
  id: 'msg_1',
  model: 'claude-sonnet-4-5',
  content: [{ type: 'text', text: 'hello' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
}

// ─── AnthropicAdapter — systemBlocks ─────────────────────────────────────────

describe('AnthropicAdapter.complete()', () => {
  beforeEach(() => { mockCreate.mockReset() })

  it('passes system string to params when no systemBlocks', async () => {
    mockCreate.mockResolvedValue(baseResponse)
    const adapter = await makeAdapter()
    const request: CompletionRequest = {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
      system: 'You are helpful.',
    }
    await adapter.complete(request)
    const [params] = mockCreate.mock.calls[0]!
    expect(params.system).toBe('You are helpful.')
  })

  it('passes systemBlocks array to params when provided', async () => {
    mockCreate.mockResolvedValue(baseResponse)
    const adapter = await makeAdapter()
    const request: CompletionRequest = {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
      systemBlocks: [
        { type: 'text', text: 'Static prompt.', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Dynamic context.' },
      ],
    }
    await adapter.complete(request)
    const [params] = mockCreate.mock.calls[0]!
    expect(Array.isArray(params.system)).toBe(true)
    expect(params.system).toHaveLength(2)
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('prefers systemBlocks over system string when both provided', async () => {
    mockCreate.mockResolvedValue(baseResponse)
    const adapter = await makeAdapter()
    const request: CompletionRequest = {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
      system: 'fallback string',
      systemBlocks: [{ type: 'text', text: 'block wins', cache_control: { type: 'ephemeral' } }],
    }
    await adapter.complete(request)
    const [params] = mockCreate.mock.calls[0]!
    expect(Array.isArray(params.system)).toBe(true)
    expect(params.system[0].text).toBe('block wins')
  })

  it('sends betaHeaders as anthropic-beta header', async () => {
    mockCreate.mockResolvedValue(baseResponse)
    const adapter = await makeAdapter()
    const request: CompletionRequest = {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
      systemBlocks: [{ type: 'text', text: 'prompt', cache_control: { type: 'ephemeral' } }],
      betaHeaders: ['prompt-caching-2024-07-31'],
    }
    await adapter.complete(request)
    const [, options] = mockCreate.mock.calls[0]!
    expect(options?.headers?.['anthropic-beta']).toBe('prompt-caching-2024-07-31')
  })
})
