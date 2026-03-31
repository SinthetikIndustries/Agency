// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemoryHandlers } from './memory-handlers.js'

describe('memory handlers', () => {
  let mockStore: any

  beforeEach(() => {
    mockStore = {
      write: vi.fn().mockResolvedValue('mem-uuid-123'),
      read: vi.fn().mockResolvedValue([
        { id: 'mem-uuid-123', agentId: 'agent-1', type: 'semantic', content: 'test fact', createdAt: new Date() }
      ]),
    }
  })

  it('memory_write calls store.write and returns id', async () => {
    const handlers = createMemoryHandlers(mockStore)
    const result = await handlers.memory_write(
      { type: 'semantic', content: 'User prefers dark mode' },
      { agentId: 'agent-1', workspacePath: '/tmp', shellPermissionLevel: 'none', agentManagementPermission: 'approval_required' } as any
    )
    expect(mockStore.write).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', type: 'semantic', content: 'User prefers dark mode' })
    )
    expect(result).toMatchObject({ id: 'mem-uuid-123' })
  })

  it('memory_read calls store.read with query and returns entries', async () => {
    const handlers = createMemoryHandlers(mockStore)
    const result = await handlers.memory_read(
      { query: 'dark mode preference', limit: 5 },
      { agentId: 'agent-1', workspacePath: '/tmp', shellPermissionLevel: 'none', agentManagementPermission: 'approval_required' } as any
    )
    expect(mockStore.read).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', query: 'dark mode preference', limit: 5 })
    )
    expect((result as any).memories).toBeDefined()
    expect(Array.isArray((result as any).memories)).toBe(true)
  })
})
