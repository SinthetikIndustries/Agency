// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// MessagingService — inter-agent messaging using Redis queues + Postgres for metadata
//
// Architecture:
//   Redis lists: messages:high:<agent-id> and messages:normal:<agent-id>
//   Messages use RPUSH to enqueue, LPOP to dequeue (FIFO)
//   Full message payload stored in Postgres agent_messages table
//   Redis holds only message IDs as queue pointers
//
// Rate limits (Redis counters):
//   rl:msg:<from-agent>:<to-agent>:<window> — per sender-recipient, 60/min
//   rl:msg:out:<from-agent>:<window> — per agent outbound, 200/min
//
// Rate limit window = current minute: Math.floor(Date.now() / 60000)

import { Redis } from 'ioredis'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Pool: PgPool } = pg

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  priority: 'high' | 'normal'
  subject: string
  payload: unknown
  correlationId?: string
  replyToId?: string
  ttl: number
  status: 'queued' | 'delivered' | 'read' | 'expired' | 'dead'
  createdAt: Date
  readAt?: Date
}

export interface SendMessageInput {
  fromAgentId: string
  toAgentId: string
  priority?: 'high' | 'normal'
  subject: string
  payload: unknown
  correlationId?: string
  replyToId?: string
  ttl?: number
}

export interface MessagingConfig {
  redisUrl: string
  postgresConnectionString: string
  rateLimits?: {
    perSenderPerRecipient?: number  // default 60/min
    perAgentOutbound?: number       // default 200/min
    maxQueueDepth?: number          // default 1000
  }
}

export class MessagingService {
  private redis: Redis
  private pool: pg.Pool
  private rateLimits: Required<Required<MessagingConfig>['rateLimits']>

  constructor(config: MessagingConfig) {
    this.redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
    this.pool = new PgPool({ connectionString: config.postgresConnectionString, max: 5 })
    this.rateLimits = {
      perSenderPerRecipient: config.rateLimits?.perSenderPerRecipient ?? 60,
      perAgentOutbound: config.rateLimits?.perAgentOutbound ?? 200,
      maxQueueDepth: config.rateLimits?.maxQueueDepth ?? 1000,
    }
  }

  async send(input: SendMessageInput): Promise<string> {
    // 1. Check rate limits
    const window = Math.floor(Date.now() / 60000)
    const pairKey = `rl:msg:${input.fromAgentId}:${input.toAgentId}:${window}`
    const outKey = `rl:msg:out:${input.fromAgentId}:${window}`

    const [pairCount, outCount] = await Promise.all([
      this.redis.incr(pairKey),
      this.redis.incr(outKey),
    ])

    if (pairCount === 1) await this.redis.expire(pairKey, 120)
    if (outCount === 1) await this.redis.expire(outKey, 120)

    if (pairCount > this.rateLimits.perSenderPerRecipient) {
      throw new Error(`Rate limit exceeded: ${input.fromAgentId} → ${input.toAgentId}`)
    }
    if (outCount > this.rateLimits.perAgentOutbound) {
      throw new Error(`Outbound rate limit exceeded for agent: ${input.fromAgentId}`)
    }

    // 2. Check queue depth
    const priority = input.priority ?? 'normal'
    const highDepth = await this.redis.llen(`messages:high:${input.toAgentId}`)
    const normalDepth = await this.redis.llen(`messages:normal:${input.toAgentId}`)
    if (highDepth + normalDepth >= this.rateLimits.maxQueueDepth) {
      throw new Error(`Queue full for agent: ${input.toAgentId}`)
    }

    // 3. Insert into Postgres
    const id = randomUUID()
    await this.pool.query(
      `INSERT INTO agent_messages
         (id, from_agent_id, to_agent_id, priority, subject, payload, correlation_id, reply_to_id, ttl, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued')`,
      [
        id,
        input.fromAgentId,
        input.toAgentId,
        priority,
        input.subject,
        JSON.stringify(input.payload),
        input.correlationId ?? null,
        input.replyToId ?? null,
        input.ttl ?? 0,
      ]
    )

    // 4. Push ID to Redis queue
    await this.redis.rpush(`messages:${priority}:${input.toAgentId}`, id)

    return id
  }

  async checkInbox(agentId: string, maxMessages = 10): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = []

    // Drain high priority first
    for (let i = 0; i < maxMessages; i++) {
      const id = await this.redis.lpop(`messages:high:${agentId}`)
      if (!id) break
      const msg = await this.fetchMessage(id)
      if (msg) messages.push(msg)
      if (messages.length >= maxMessages) break
    }

    // Then normal priority
    if (messages.length < maxMessages) {
      const remaining = maxMessages - messages.length
      for (let i = 0; i < remaining; i++) {
        const id = await this.redis.lpop(`messages:normal:${agentId}`)
        if (!id) break
        const msg = await this.fetchMessage(id)
        if (msg) messages.push(msg)
      }
    }

    // Mark all as read
    if (messages.length > 0) {
      const ids = messages.map(m => m.id)
      await this.pool.query(
        `UPDATE agent_messages SET status = 'read', read_at = NOW() WHERE id = ANY($1::uuid[])`,
        [ids]
      )
      messages.forEach(m => { m.status = 'read' })
    }

    return messages
  }

  async listAgentsForMessaging(excludeAgentId?: string): Promise<{ id: string; slug: string; name: string }[]> {
    const result = await this.pool.query<{ id: string; slug: string; name: string }>(
      `SELECT id, slug, name FROM agent_identities WHERE status = 'active'${excludeAgentId ? ' AND id != $1' : ''}`,
      excludeAgentId ? [excludeAgentId] : []
    )
    return result.rows
  }

  private async fetchMessage(id: string): Promise<AgentMessage | null> {
    const result = await this.pool.query(
      'SELECT * FROM agent_messages WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) return null
    const row = result.rows[0]
    return {
      id: row.id,
      fromAgentId: row.from_agent_id,
      toAgentId: row.to_agent_id,
      priority: row.priority,
      subject: row.subject,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      ...(row.correlation_id != null ? { correlationId: row.correlation_id as string } : {}),
      ...(row.reply_to_id != null ? { replyToId: row.reply_to_id as string } : {}),
      ttl: row.ttl,
      status: row.status,
      createdAt: new Date(row.created_at),
      ...(row.read_at ? { readAt: new Date(row.read_at) } : {}),
    }
  }

  async getInboxDepths(agentIds: string[]): Promise<Array<{
    agentId: string; high: number; normal: number; total: number
  }>> {
    const results = await Promise.all(
      agentIds.map(async id => {
        const [high, normal] = await Promise.all([
          this.redis.llen(`messages:high:${id}`),
          this.redis.llen(`messages:normal:${id}`),
        ])
        return { agentId: id, high, normal, total: high + normal }
      })
    )
    return results
  }

  async getRecentMessages(limit = 50): Promise<Array<{
    id: string; fromAgentId: string; toAgentId: string; priority: string
    subject: string; status: string; createdAt: string
  }>> {
    const result = await this.pool.query(
      `SELECT id, from_agent_id, to_agent_id, priority, subject, status, created_at
       FROM agent_messages ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )
    return result.rows.map(r => ({
      id: r.id as string,
      fromAgentId: r.from_agent_id as string,
      toAgentId: r.to_agent_id as string,
      priority: r.priority as string,
      subject: r.subject as string,
      status: r.status as string,
      createdAt: (r.created_at as Date).toISOString(),
    }))
  }

  async close(): Promise<void> {
    this.redis.disconnect()
    await this.pool.end()
  }
}
