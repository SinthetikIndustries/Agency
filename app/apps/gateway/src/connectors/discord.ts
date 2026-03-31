// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * Discord Connector
 *
 * Runs inside the Gateway process. Listens for @mentions, creates Gateway sessions,
 * streams agent responses back to Discord.
 */
import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  TextChannel,
  Partials,
} from 'discord.js'
import type { AuditLogger } from '../audit.js'
import { splitMessage } from './message-utils.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BroadcastCoordinator {
  /** Returns true if this caller is the first to claim the message (others should skip). */
  claim(messageId: string): boolean
  /** Ordered list of all active Discord agent slugs. */
  slugs(): string[]
}

export interface DiscordConfig {
  token: string
  defaultAgent?: string
  prefix?: string              // overrides !<defaultAgent> with !<prefix>
  allowedChannels?: string[]   // empty = all channels
  allowedRoles?: string[]      // empty = all roles
  coordinator?: BroadcastCoordinator
}

interface SessionRecord {
  sessionId: string
  agentId: string
  createdAt: Date
  lastActiveAt: Date
}

// ─── Discord Connector ────────────────────────────────────────────────────────

export class DiscordConnector {
  private client: Client
  private sessions = new Map<string, SessionRecord | undefined>()   // channelId → session
  private gatewayUrl: string
  private apiKey: string

  constructor(
    private readonly config: DiscordConfig,
    gatewayUrl: string,
    apiKey: string,
    private readonly auditLogger: AuditLogger,
    private readonly log: (level: string, msg: string) => void,
    private readonly fireHook: (event: string, context: Record<string, unknown>) => void = () => { /* no-op */ }
  ) {
    this.gatewayUrl = gatewayUrl
    this.apiKey = apiKey

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    })

    this.client.on(Events.MessageCreate, (msg) => {
      void this.handleMessage(msg)
    })

    this.client.on(Events.ClientReady, (c) => {
      this.log('info', `[Discord] Logged in as ${c.user.tag}`)
      this.fireHook('connector.connected', { connector: 'discord', tag: c.user.tag })
    })

    this.client.on(Events.Error, (err) => {
      this.log('error', `[Discord] Client error: ${err.message}`)
      this.fireHook('connector.error', { connector: 'discord', error: err.message })
    })

    // discord.js fires ShardReconnecting before attempting a reconnect
    this.client.on(Events.ShardReconnecting, () => {
      this.fireHook('connector.reconnecting', { connector: 'discord' })
    })
  }

  async enable(): Promise<void> {
    await this.client.login(this.config.token)
  }

  async disable(): Promise<void> {
    this.client.destroy()
    this.sessions.clear()
    this.fireHook('connector.disconnected', { connector: 'discord' })
    this.log('info', '[Discord] Connector disabled')
  }

  isHealthy(): boolean {
    return this.client.isReady()
  }

  async postToChannel(channel: string, content: string): Promise<{ channelId: string; guildId: string }> {
    if (!this.client.isReady()) throw new Error('Discord client is not ready')
    for (const guild of this.client.guilds.cache.values()) {
      const ch = guild.channels.cache.find(
        c => (c.id === channel || c.name.toLowerCase() === channel.toLowerCase()) &&
             (c.type === 0 /* GuildText */ || c.type === 5 /* GuildAnnouncement */)
      )
      if (ch && 'send' in ch) {
        await (ch as TextChannel).send({ content, allowedMentions: { parse: [] } })
        return { channelId: ch.id, guildId: guild.id }
      }
    }
    throw new Error(`Channel not found: "${channel}" — ensure the bot is a member of a guild with this channel`)
  }

  listChannels(): Array<{ id: string; name: string; type: string; category?: string; guildId: string }> {
    if (!this.client.isReady()) return []
    const result: Array<{ id: string; name: string; type: string; category?: string; guildId: string }> = []
    for (const guild of this.client.guilds.cache.values()) {
      for (const ch of guild.channels.cache.values()) {
        if (ch.type !== 0 && ch.type !== 5) continue  // text + announcement only
        result.push({
          id: ch.id,
          name: ch.name,
          type: ch.type === 5 ? 'announcement' : 'text',
          category: (ch as any).parent?.name ?? undefined,
          guildId: guild.id,
        })
      }
    }
    return result.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name))
  }

  // ─── Message handling ────────────────────────────────────────────────────────

  private async handleMessage(msg: Message): Promise<void> {
    // Ignore bot messages
    if (msg.author.bot) return

    const slug = this.config.defaultAgent ?? 'main'
    const prefix = `!${this.config.prefix ?? slug}`
    const content = msg.content
    const lower = content.toLowerCase()

    const mentioned = msg.mentions.has(this.client.user!)
    const hasPrefix = lower.startsWith(prefix.toLowerCase()) &&
      (content.length === prefix.length || content[prefix.length] === ' ')
    const isBroadcast = (lower.startsWith('!all') && (content.length === 4 || content[4] === ' ')) ||
                        (lower.startsWith('!everyone') && (content.length === 9 || content[9] === ' '))

    // Handle !all / !everyone broadcast (only one bot claims and processes it)
    if (isBroadcast) {
      if (!this.config.coordinator) return
      if (!this.config.coordinator.claim(msg.id)) return  // another connector claimed it

      if (this.config.allowedChannels?.length && !this.config.allowedChannels.includes(msg.channelId)) return

      const cmdLen = lower.startsWith('!all') ? 4 : 9
      const text = content.slice(cmdLen).trim()
      if (!text) {
        await msg.reply('Usage: `!all <message>` — queues a message to all agents one at a time.')
        return
      }
      await this.handleBroadcast(msg, text)
      return
    }

    // Respond to !slug prefix or @mention; ignore everything else
    if (!hasPrefix && !mentioned) return

    // Channel allowlist check
    if (this.config.allowedChannels?.length && !this.config.allowedChannels.includes(msg.channelId)) return

    // Role allowlist check
    if (this.config.allowedRoles?.length && msg.member) {
      const hasRole = msg.member.roles.cache.some(r => this.config.allowedRoles!.includes(r.id))
      if (!hasRole) return
    }

    // Strip prefix or @mention(s) from message text
    let text: string
    if (hasPrefix) {
      text = content.slice(prefix.length).trim()
    } else {
      text = content.replace(/<@!?\d+>/g, '').trim()
    }

    if (!text) {
      await msg.reply(`Hi! Use \`${prefix} <message>\` to chat with me.`)
      return
    }

    // Get or create session for this channel
    let session = this.sessions.get(msg.channelId)
    if (!session) {
      session = await this.createSession(msg.channelId)
      if (!session) {
        await msg.reply('Sorry, I could not connect to the agent right now.')
        return
      }
    }

    // Send to gateway and stream response
    await this.streamResponse(msg, session, text)
  }

  // ─── Broadcast (!all) ────────────────────────────────────────────────────────

  private async handleBroadcast(msg: Message, text: string): Promise<void> {
    const slugs = this.config.coordinator!.slugs()
    await msg.reply(`📡 Queuing message to **${slugs.length} agents** — responses incoming sequentially...`)

    for (const agentSlug of slugs) {
      const channel = msg.channel as TextChannel
      if ('sendTyping' in channel) void channel.sendTyping()

      try {
        // Create a fresh one-off session for this agent
        const sessionRes = await fetch(`${this.gatewayUrl}/sessions`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ agentSlug, client: 'discord' }),
        })
        if (!sessionRes.ok) throw new Error(`Session create failed: ${sessionRes.status}`)
        const { session } = await sessionRes.json() as { session: { id: string } }

        const sendRes = await fetch(`${this.gatewayUrl}/sessions/${session.id}/send`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ content: text }),
        })
        if (!sendRes.ok) throw new Error(`Send failed: ${sendRes.status}`)

        const { response } = await sendRes.json() as { response: string }
        const fullReply = `**[${agentSlug}]** ${response}`
        const chunks = splitMessage(fullReply, 2000)
        for (const chunk of chunks) {
          await (channel as TextChannel).send({ content: chunk, allowedMentions: { parse: [] } })
        }
      } catch (err) {
        await (channel as TextChannel).send({
          content: `**[${agentSlug}]** *(error: ${String(err)})*`,
          allowedMentions: { parse: [] },
        })
      }
    }
  }

  private async createSession(channelId: string): Promise<SessionRecord | undefined> {
    try {
      const res = await fetch(`${this.gatewayUrl}/sessions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          agentSlug: this.config.defaultAgent ?? 'main',
          client: 'discord',
        }),
      })
      if (!res.ok) throw new Error(`Gateway returned ${res.status}`)

      const data = await res.json() as { session: { id: string; agentId: string } }
      const record: SessionRecord = {
        sessionId: data.session.id,
        agentId: data.session.agentId,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      }
      this.sessions.set(channelId, record)
      this.log('info', `[Discord] Created session ${record.sessionId} for channel ${channelId}`)
      return record
    } catch (err) {
      this.log('error', `[Discord] Failed to create session: ${String(err)}`)
      return undefined
    }
  }

  private async streamResponse(msg: Message, session: SessionRecord, text: string): Promise<void> {
    const { sessionId } = session
    session.lastActiveAt = new Date()

    // Use typing indicator while processing
    const channel = msg.channel as TextChannel
    if ('sendTyping' in channel) await channel.sendTyping()

    // POST /sessions/:id/send — returns full response synchronously
    try {
      const sendRes = await fetch(`${this.gatewayUrl}/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ content: text }),
      })

      if (sendRes.status === 404) {
        // Session no longer exists (e.g. gateway restarted) — clear and retry once
        this.sessions.delete(msg.channelId)
        const newSession = await this.createSession(msg.channelId)
        if (!newSession) throw new Error('Could not recreate session after 404')
        const retryRes = await fetch(`${this.gatewayUrl}/sessions/${newSession.sessionId}/send`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ content: text }),
        })
        if (!retryRes.ok) {
          const errText = await retryRes.text()
          throw new Error(`Gateway ${retryRes.status}: ${errText}`)
        }
        const retryData = await retryRes.json() as { response: string }
        const retryChunks = splitMessage(retryData.response ?? '(no response)', 2000)
        for (const chunk of retryChunks) {
          await msg.reply({ content: chunk, allowedMentions: { repliedUser: false } })
        }
        return
      }

      if (!sendRes.ok) {
        const errText = await sendRes.text()
        throw new Error(`Gateway ${sendRes.status}: ${errText}`)
      }

      const data = await sendRes.json() as { response: string }
      const response = data.response ?? '(no response)'

      // Discord has a 2000 char limit per message — split if needed
      const chunks = splitMessage(response, 2000)
      for (const chunk of chunks) {
        await msg.reply({ content: chunk, allowedMentions: { repliedUser: false } })
      }

      this.fireHook('connector.message.sent', {
        connector: 'discord',
        sessionId,
        channelId: msg.channelId,
        guildId: msg.guildId ?? 'dm',
      })
      void this.auditLogger.log({
        action: 'connector.message',
        actor: `discord:${msg.author.id}`,
        targetType: 'session',
        targetId: sessionId,
        details: { channelId: msg.channelId, guildId: msg.guildId ?? 'dm' },
      })
    } catch (err) {
      this.log('error', `[Discord] Error sending message: ${String(err)}`)
      this.fireHook('connector.error', { connector: 'discord', error: String(err), sessionId })
      await msg.reply('Sorry, something went wrong processing your request.')
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }
}

