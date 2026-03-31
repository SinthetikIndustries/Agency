// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { MessagingService } from '@agency/messaging'
import type { ToolContext } from '@agency/shared-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface InvokeService {
  invoke(agentSlug: string, prompt: string, depth: number): Promise<{ response: string; agentName: string }>
}

export function createMessagingHandlers(
  messagingService: MessagingService,
  invokeService?: InvokeService
) {
  return {
    async agent_message_send(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const toAgentIdRaw = input['toAgentId'] as string
      const subject = input['subject'] as string
      const payload = input['payload'] as unknown
      const priority = input['priority'] as 'high' | 'normal' | undefined
      const correlationId = input['correlationId'] as string | undefined

      // Resolve toAgentId: if not UUID format, look up by slug
      let toAgentId = toAgentIdRaw
      if (!UUID_PATTERN.test(toAgentIdRaw)) {
        const agents = await messagingService.listAgentsForMessaging(ctx.agentId)
        const match = agents.find(a => a.slug === toAgentIdRaw)
        if (!match) {
          return { error: `Agent not found: ${toAgentIdRaw}` }
        }
        toAgentId = match.id
      }

      const messageId = await messagingService.send({
        fromAgentId: ctx.agentId,
        toAgentId,
        subject,
        payload,
        ...(priority !== undefined ? { priority } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
      })

      return { messageId }
    },

    async agent_message_check(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const maxMessages = input['maxMessages'] as number | undefined
      const messages = await messagingService.checkInbox(ctx.agentId, maxMessages)
      return {
        messages: messages.map(m => ({
          id: m.id,
          fromAgentId: m.fromAgentId,
          toAgentId: m.toAgentId,
          priority: m.priority,
          subject: m.subject,
          payload: m.payload,
          ...(m.correlationId ? { correlationId: m.correlationId } : {}),
          ...(m.replyToId ? { replyToId: m.replyToId } : {}),
          ttl: m.ttl,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
          ...(m.readAt ? { readAt: m.readAt.toISOString() } : {}),
        }))
      }
    },

    async agent_message_list(
      _input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      const agents = await messagingService.listAgentsForMessaging(ctx.agentId)
      return { agents }
    },

    async agent_invoke(
      input: Record<string, unknown>,
      ctx: ToolContext
    ): Promise<unknown> {
      if (!invokeService) return { error: 'agent_invoke not configured' }
      const agentSlug = input['agentSlug'] as string | undefined
      const prompt = input['prompt'] as string | undefined
      if (!agentSlug) return { error: 'agentSlug is required' }
      if (!prompt) return { error: 'prompt is required' }
      const depth = ctx.invokeDepth ?? 0
      if (depth >= 5) return { error: `Max agent invocation depth (5) reached` }
      try {
        return await invokeService.invoke(agentSlug, prompt, depth)
      } catch (err) {
        return { error: String(err) }
      }
    },
  }
}
