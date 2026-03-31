// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDiscordHandlers } from './discord-handlers.js'
import type { DiscordService } from './discord-handlers.js'

const BASE_CTX = {
  agentId: 'agent-123',
  sessionId: 'session-1',
  workspacePath: '/tmp',
  shellPermissionLevel: 'none',
  sessionGrantActive: false,
  agentManagementPermission: 'approval_required',
} as any

describe('discord handlers', () => {
  let mockDiscord: DiscordService

  beforeEach(() => {
    mockDiscord = {
      postToChannel: vi.fn().mockResolvedValue({ channelId: 'ch-1', guildId: 'g-1' }),
      listChannels: vi.fn().mockResolvedValue([
        { id: 'ch-1', name: 'general', type: 'text', guildId: 'g-1' },
        { id: 'ch-2', name: 'board-room', type: 'text', category: 'Management', guildId: 'g-1' },
      ]),
    }
  })

  describe('discord_post', () => {
    it('posts to channel and returns result', async () => {
      const handlers = createDiscordHandlers(mockDiscord)
      const result = await handlers.discord_post({ channel: 'board-room', content: 'Hello' }, BASE_CTX)
      expect(mockDiscord.postToChannel).toHaveBeenCalledWith('agent-123', 'board-room', 'Hello')
      expect(result).toEqual({ posted: true, channelId: 'ch-1', guildId: 'g-1' })
    })

    it('returns error when channel is missing', async () => {
      const handlers = createDiscordHandlers(mockDiscord)
      const result = await handlers.discord_post({ content: 'Hello' }, BASE_CTX)
      expect(result).toMatchObject({ error: expect.stringContaining('channel') })
    })

    it('returns error when postToChannel throws', async () => {
      ;(mockDiscord.postToChannel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'))
      const handlers = createDiscordHandlers(mockDiscord)
      const result = await handlers.discord_post({ channel: 'board-room', content: 'Hi' }, BASE_CTX)
      expect(result).toMatchObject({ error: expect.stringContaining('Not found') })
    })
  })

  describe('discord_list_channels', () => {
    it('returns channel list', async () => {
      const handlers = createDiscordHandlers(mockDiscord)
      const result = await handlers.discord_list_channels({}, BASE_CTX) as any
      expect(mockDiscord.listChannels).toHaveBeenCalledWith('agent-123')
      expect(result.channels).toHaveLength(2)
      expect(result.channels[1].name).toBe('board-room')
    })

    it('returns error when listChannels throws', async () => {
      ;(mockDiscord.listChannels as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Discord disconnected'))
      const handlers = createDiscordHandlers(mockDiscord)
      const result = await handlers.discord_list_channels({}, BASE_CTX)
      expect(result).toMatchObject({ error: expect.stringContaining('Discord disconnected') })
    })
  })
})
