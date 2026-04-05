// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { MemoryStore, MemoryWriteInput, MemoryQuery } from '@agency/memory'
import type { ToolContext } from '@agency/shared-types'

export function createMemoryHandlers(memoryStore: MemoryStore) {
  return {
    async memory_write(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const type = input['type'] as 'episodic' | 'semantic' | 'working'
      const content = input['content'] as string
      const expiresAt = input['expiresAt'] as string | undefined
      const scope = input['scope'] as string | undefined
      const groupId = input['groupId'] as string | undefined

      let expiresAtDate: Date | undefined
      if (expiresAt !== undefined) {
        const d = new Date(expiresAt)
        if (isNaN(d.getTime())) throw new Error(`Invalid expiresAt date: ${expiresAt}`)
        expiresAtDate = d
      }

      const writeInput: MemoryWriteInput = {
        agentId: ctx.agentId,
        type,
        content,
        ...(expiresAtDate !== undefined ? { expiresAt: expiresAtDate } : {}),
        ...(scope === 'group' && groupId ? { groupId } : {}),
      }
      const id = await memoryStore.write(writeInput)
      return { id }
    },

    async memory_read(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const query = input['query'] as string
      const types = input['types'] as Array<'episodic' | 'semantic' | 'working'> | undefined
      const limit = input['limit'] as number | undefined

      const readQuery: MemoryQuery = {
        agentId: ctx.agentId,
        query,
        limit: limit ?? 10,
        ...(types !== undefined ? { types } : {}),
      }
      const entries = await memoryStore.read(readQuery)
      return {
        memories: entries.map((e) => ({
          id: e.id,
          type: e.type,
          content: e.content,
          createdAt: e.createdAt.toISOString(),
        })),
      }
    },
  }
}
