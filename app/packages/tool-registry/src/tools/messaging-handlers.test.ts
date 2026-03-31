// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMessagingHandlers } from './messaging-handlers.js'
import type { InvokeService } from './messaging-handlers.js'

// Real UUID-format IDs for tests
const AGENT_ID_1 = '11111111-1111-1111-1111-111111111111'
const AGENT_ID_2 = '22222222-2222-2222-2222-222222222222'
const AGENT_ID_3 = '33333333-3333-3333-3333-333333333333'
const MSG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const BASE_CTX = {
  agentId: AGENT_ID_1,
  workspacePath: '/tmp',
  shellPermissionLevel: 'none',
  agentManagementPermission: 'approval_required',
} as any

describe('messaging handlers', () => {
  let mockMessaging: any

  beforeEach(() => {
    mockMessaging = {
      send: vi.fn().mockResolvedValue(MSG_ID),
      checkInbox: vi.fn().mockResolvedValue([
        {
          id: MSG_ID,
          fromAgentId: AGENT_ID_2,
          toAgentId: AGENT_ID_1,
          priority: 'normal',
          subject: 'Hello',
          payload: { text: 'hi' },
          ttl: 0,
          status: 'read',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]),
      listAgentsForMessaging: vi.fn().mockResolvedValue([
        { id: AGENT_ID_2, slug: 'research-bot', name: 'Research Bot' },
        { id: AGENT_ID_3, slug: 'writer-bot', name: 'Writer Bot' },
      ]),
    }
  })

  describe('agent_message_send', () => {
    it('sends a message by UUID toAgentId without slug lookup', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_send(
        {
          toAgentId: AGENT_ID_2,
          subject: 'Task request',
          payload: { task: 'do something' },
          priority: 'high',
        },
        BASE_CTX
      )

      expect(mockMessaging.listAgentsForMessaging).not.toHaveBeenCalled()
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAgentId: AGENT_ID_1,
          toAgentId: AGENT_ID_2,
          subject: 'Task request',
          payload: { task: 'do something' },
          priority: 'high',
        })
      )
      expect(result).toMatchObject({ messageId: MSG_ID })
    })

    it('resolves slug to UUID via listAgentsForMessaging', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_send(
        {
          toAgentId: 'research-bot',
          subject: 'Hello',
          payload: { text: 'hi' },
        },
        BASE_CTX
      )

      expect(mockMessaging.listAgentsForMessaging).toHaveBeenCalledWith(AGENT_ID_1)
      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAgentId: AGENT_ID_1,
          toAgentId: AGENT_ID_2,
        })
      )
      expect(result).toMatchObject({ messageId: MSG_ID })
    })

    it('returns error when slug is not found', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_send(
        {
          toAgentId: 'nonexistent-bot',
          subject: 'Hello',
          payload: {},
        },
        BASE_CTX
      )

      expect(result).toMatchObject({ error: expect.stringContaining('nonexistent-bot') })
      expect(mockMessaging.send).not.toHaveBeenCalled()
    })

    it('never uses fromAgentId from input — always uses ctx.agentId', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      await handlers.agent_message_send(
        {
          toAgentId: AGENT_ID_2,
          subject: 'Spoofed',
          payload: {},
          // If someone tried to pass fromAgentId it should be ignored
        },
        { ...BASE_CTX, agentId: AGENT_ID_3 }
      )

      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({ fromAgentId: AGENT_ID_3 })
      )
    })

    it('passes correlationId when provided', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      await handlers.agent_message_send(
        {
          toAgentId: AGENT_ID_2,
          subject: 'Correlated',
          payload: {},
          correlationId: 'corr-123',
        },
        BASE_CTX
      )

      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-123' })
      )
    })
  })

  describe('agent_message_check', () => {
    it('calls checkInbox with agentId from ctx', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_check({}, BASE_CTX)

      expect(mockMessaging.checkInbox).toHaveBeenCalledWith(AGENT_ID_1, undefined)
      expect((result as any).messages).toBeDefined()
      expect(Array.isArray((result as any).messages)).toBe(true)
    })

    it('passes maxMessages when provided', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      await handlers.agent_message_check({ maxMessages: 5 }, BASE_CTX)

      expect(mockMessaging.checkInbox).toHaveBeenCalledWith(AGENT_ID_1, 5)
    })

    it('returns messages array from checkInbox', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_check({}, BASE_CTX)

      expect((result as any).messages).toHaveLength(1)
      expect((result as any).messages[0]).toMatchObject({ id: MSG_ID })
    })

    it('maps createdAt to ISO string format', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_check({}, BASE_CTX)

      expect((result as any).messages[0]).toHaveProperty('createdAt')
      expect(typeof (result as any).messages[0].createdAt).toBe('string')
      expect((result as any).messages[0].createdAt).toBe('2026-01-01T00:00:00.000Z')
    })
  })

  describe('agent_message_list', () => {
    it('calls listAgentsForMessaging with ctx.agentId as excludeAgentId', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_list({}, BASE_CTX)

      expect(mockMessaging.listAgentsForMessaging).toHaveBeenCalledWith(AGENT_ID_1)
      expect((result as any).agents).toBeDefined()
      expect(Array.isArray((result as any).agents)).toBe(true)
    })

    it('returns agents list from listAgentsForMessaging', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_message_list({}, BASE_CTX)

      expect((result as any).agents).toHaveLength(2)
      expect((result as any).agents[0]).toMatchObject({ id: AGENT_ID_2, slug: 'research-bot' })
    })
  })

  describe('agent_invoke', () => {
    let mockInvoke: InvokeService

    beforeEach(() => {
      mockInvoke = {
        invoke: vi.fn().mockResolvedValue({ response: 'Mia says hello', agentName: 'Mia' }),
      }
    })

    it('invokes agent and returns response', async () => {
      const handlers = createMessagingHandlers(mockMessaging, mockInvoke)
      const result = await handlers.agent_invoke(
        { agentSlug: 'mia', prompt: 'What are Q1 priorities?' },
        { ...BASE_CTX, invokeDepth: 0 }
      )
      expect(mockInvoke.invoke).toHaveBeenCalledWith('mia', 'What are Q1 priorities?', 0)
      expect(result).toEqual({ response: 'Mia says hello', agentName: 'Mia' })
    })

    it('returns error when agentSlug is missing', async () => {
      const handlers = createMessagingHandlers(mockMessaging, mockInvoke)
      const result = await handlers.agent_invoke({ prompt: 'hi' }, { ...BASE_CTX, invokeDepth: 0 })
      expect(result).toMatchObject({ error: expect.stringContaining('agentSlug') })
    })

    it('returns error at max depth', async () => {
      const handlers = createMessagingHandlers(mockMessaging, mockInvoke)
      const result = await handlers.agent_invoke(
        { agentSlug: 'mia', prompt: 'hi' },
        { ...BASE_CTX, invokeDepth: 5 }
      )
      expect(result).toMatchObject({ error: expect.stringContaining('depth') })
      expect(mockInvoke.invoke).not.toHaveBeenCalled()
    })

    it('returns error when invoke throws', async () => {
      ;(mockInvoke.invoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Agent offline'))
      const handlers = createMessagingHandlers(mockMessaging, mockInvoke)
      const result = await handlers.agent_invoke(
        { agentSlug: 'mia', prompt: 'hi' },
        { ...BASE_CTX, invokeDepth: 0 }
      )
      expect(result).toMatchObject({ error: expect.stringContaining('Agent offline') })
    })

    it('works without InvokeService (returns error)', async () => {
      const handlers = createMessagingHandlers(mockMessaging)
      const result = await handlers.agent_invoke({ agentSlug: 'mia', prompt: 'hi' }, { ...BASE_CTX, invokeDepth: 0 })
      expect(result).toMatchObject({ error: expect.stringContaining('not configured') })
    })
  })
})
