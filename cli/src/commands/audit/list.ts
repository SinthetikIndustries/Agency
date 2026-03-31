// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

const AUDIT_ACTIONS = [
  'agent.create', 'agent.delete', 'agent.enable', 'agent.disable',
  'agent.profile_switch', 'agent.context_edit', 'profile.create',
  'approval.create', 'approval.approve', 'approval.reject',
  'skill.install', 'skill.remove', 'skill.update',
  'session.create', 'session.end',
  'connector.enable', 'connector.disable',
  'vault.sync', 'auth.login', 'auth.logout',
] as const

interface AuditEntry {
  id: string
  action: string
  actor: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  created_at: string
}

const ACTION_COLORS: Record<string, (s: string) => string> = {
  'agent.enable': chalk.green,
  'agent.disable': chalk.yellow,
  'agent.delete': chalk.red,
  'approval.approve': chalk.green,
  'approval.reject': chalk.red,
  'skill.remove': chalk.red,
  'auth.login': chalk.cyan,
  'auth.logout': chalk.gray,
}

export default class AuditList extends Command {
  static summary = 'List audit log entries'

  static flags = {
    action: Flags.string({
      char: 'a',
      summary: `Filter by action (e.g. agent.enable)`,
      options: AUDIT_ACTIONS as unknown as string[],
    }),
    limit: Flags.integer({
      char: 'n',
      summary: 'Max number of entries to show',
      default: 50,
    }),
    details: Flags.boolean({
      char: 'd',
      summary: 'Show details JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditList)

    const qs = new URLSearchParams()
    if (flags.action) qs.set('action', flags.action)
    qs.set('limit', String(flags.limit))

    let entries: AuditEntry[]
    try {
      const res = await gatewayFetch<{ entries: AuditEntry[] }>(`/audit?${qs}`)
      entries = res.entries
    } catch (err) {
      this.error(String(err))
    }

    if (entries.length === 0) {
      this.log(chalk.gray('No audit entries found.'))
      return
    }

    this.log('')
    for (const e of entries) {
      const colorFn = ACTION_COLORS[e.action] ?? chalk.white
      const time = chalk.gray(new Date(e.created_at).toLocaleString())
      const target = e.target_id ? chalk.gray(` → ${e.target_type}:${e.target_id.slice(0, 8)}`) : ''
      this.log(`${time}  ${colorFn(e.action.padEnd(28))} actor=${chalk.cyan(e.actor)}${target}`)
      if (flags.details && Object.keys(e.details).length > 0) {
        this.log(`  ${chalk.gray(JSON.stringify(e.details))}`)
      }
    }
    this.log('')
  }
}
