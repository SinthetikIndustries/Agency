// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ToolContext } from '@agency/shared-types'

// ─── DiscordService interface ──────────────────────────────────────────────────
// Implemented by ConnectorRegistry in apps/gateway. Injected into the tool
// registry at startup so discord tools work without importing discord.js here.

export interface DiscordService {
  postToChannel(
    agentId: string,
    channel: string,
    content: string
  ): Promise<{ channelId: string; guildId: string }>

  listChannels(agentId: string): Promise<Array<{
    id: string
    name: string
    type: string
    category?: string
    guildId: string
  }>>
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export function createDiscordHandlers(discordService: DiscordService) {
  return {
    async discord_post(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const channel = input['channel'] as string | undefined
      const content = input['content'] as string | undefined
      if (!channel) return { error: 'channel is required' }
      if (!content) return { error: 'content is required' }
      try {
        const result = await discordService.postToChannel(ctx.agentId, channel, content)
        return { posted: true, channelId: result.channelId, guildId: result.guildId }
      } catch (err) {
        return { error: String(err) }
      }
    },

    async discord_list_channels(
      _input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      try {
        const channels = await discordService.listChannels(ctx.agentId)
        return { channels }
      } catch (err) {
        return { error: String(err) }
      }
    },
  }
}
