// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { DiscordConnector, type DiscordConfig, type BroadcastCoordinator } from './discord.js'
import type { AuditLogger } from '../audit.js'
import type { DiscordService } from '@agency/tool-registry'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Connector {
  enable(): Promise<void>
  disable(): Promise<void>
  isHealthy(): boolean
}

export interface ConnectorStatus {
  name: string
  enabled: boolean
  healthy: boolean
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class ConnectorRegistry implements DiscordService {
  private connectors = new Map<string, Connector>()
  private enabled = new Set<string>()
  private broadcastClaimed = new Set<string>()

  /** BroadcastCoordinator shared across all Discord connectors in this registry. */
  private readonly coordinator: BroadcastCoordinator = {
    claim: (messageId: string): boolean => {
      if (this.broadcastClaimed.has(messageId)) return false
      this.broadcastClaimed.add(messageId)
      // Clean up after 5 minutes to avoid unbounded growth
      setTimeout(() => this.broadcastClaimed.delete(messageId), 5 * 60 * 1000)
      return true
    },
    slugs: (): string[] =>
      [...this.enabled]
        .filter(k => k.startsWith('discord:'))
        .map(k => k.slice('discord:'.length))
        .sort(),
  }

  constructor(
    private readonly gatewayUrl: string,
    private readonly apiKey: string,
    private readonly auditLogger: AuditLogger,
    private readonly log: (level: string, msg: string) => void,
    private readonly fireHook: (event: string, context: Record<string, unknown>) => void = () => { /* no-op */ }
  ) {}

  /**
   * Initialize connectors that are pre-configured and enabled in config.
   * credentials.discord.agents maps agent slug → bot token (one bot per agent).
   */
  async initFromConfig(
    config: Record<string, unknown>,
    credentials: Record<string, unknown> = {},
    agentNames: Record<string, string> = {}
  ): Promise<void> {
    const connectors = (config['connectors'] ?? {}) as Record<string, unknown>
    const credDiscord = (credentials['discord'] ?? {}) as Record<string, unknown>
    const credTokens = (credDiscord['agents'] ?? {}) as Record<string, string>

    // Discord — one connector per agent using their individual bot token
    const discord = connectors['discord'] as Record<string, unknown> | undefined
    if (discord?.['enabled']) {
      const cfgAgents = (discord['agents'] ?? {}) as Record<string, { enabled?: boolean; prefix?: string }>
      const allowedChannels = discord['allowedChannels'] as string[] | undefined
      const allowedRoles = discord['allowedRoles'] as string[] | undefined

      for (const [slug, agentCfg] of Object.entries(cfgAgents)) {
        if (!agentCfg.enabled) continue
        const token = credTokens[slug]
        if (!token) {
          this.log('warn', `[ConnectorRegistry] No Discord token for agent "${slug}", skipping`)
          continue
        }
        const cfg: DiscordConfig = { token, defaultAgent: slug }
        const namePrefix = agentNames[slug]?.toLowerCase()
        cfg.prefix = agentCfg.prefix ?? namePrefix ?? slug
        if (allowedChannels) cfg.allowedChannels = allowedChannels
        if (allowedRoles) cfg.allowedRoles = allowedRoles
        try {
          await this.enableDiscord(cfg, slug)
        } catch (err) {
          this.log('error', `[ConnectorRegistry] Failed to enable Discord for "${slug}": ${String(err)}`)
        }
      }
    }

  }

  async enableDiscord(cfg: DiscordConfig, slug = 'default'): Promise<void> {
    const key = `discord:${slug}`
    if (this.enabled.has(key)) {
      throw new Error(`Discord connector for "${slug}" is already enabled`)
    }
    const connector = new DiscordConnector(
      { ...cfg, coordinator: this.coordinator },
      this.gatewayUrl, this.apiKey, this.auditLogger, this.log, this.fireHook
    )
    await connector.enable()
    this.connectors.set(key, connector)
    this.enabled.add(key)
    this.log('info', `[ConnectorRegistry] Discord connector enabled for agent "${slug}"`)
  }

  async disableConnector(name: string): Promise<void> {
    const connector = this.connectors.get(name)
    if (!connector) throw new Error(`Connector "${name}" not found or not enabled`)
    await connector.disable()
    this.enabled.delete(name)
    this.connectors.delete(name)
  }

  list(): ConnectorStatus[] {
    const keys = new Set([...this.connectors.keys(), ...this.enabled])
    return [...keys].map(name => ({
      name,
      enabled: this.enabled.has(name),
      healthy: this.connectors.get(name)?.isHealthy() ?? false,
    }))
  }

  async postToChannel(agentId: string, channel: string, content: string): Promise<{ channelId: string; guildId: string }> {
    const key = `discord:${agentId}`
    const connector = this.connectors.get(key) as import('./discord.js').DiscordConnector | undefined
    if (!connector) throw new Error(`Discord not connected for agent "${agentId}"`)
    return connector.postToChannel(channel, content)
  }

  async listChannels(agentId: string): Promise<Array<{ id: string; name: string; type: string; category?: string; guildId: string }>> {
    const key = `discord:${agentId}`
    const connector = this.connectors.get(key) as import('./discord.js').DiscordConnector | undefined
    if (!connector) throw new Error(`Discord not connected for agent "${agentId}"`)
    return connector.listChannels()
  }

  async stopAll(): Promise<void> {
    for (const [name, connector] of this.connectors) {
      try {
        await connector.disable()
      } catch (err) {
        this.log('error', `[ConnectorRegistry] Error stopping connector ${name}: ${String(err)}`)
      }
    }
    this.connectors.clear()
    this.enabled.clear()
  }
}
