// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface SessionRow {
  id: string
  agentId: string
  agentSlug: string | null
  agentName: string | null
  client: string
  status: string
  createdAt: string
  updatedAt: string
}

export default class SessionsList extends Command {
  static summary = 'List sessions'

  static flags = {
    agent: Flags.string({
      char: 'a',
      summary: 'Filter by agent slug',
    }),
    limit: Flags.integer({
      char: 'n',
      summary: 'Max number of sessions to show',
      default: 20,
    }),
    client: Flags.string({
      char: 'c',
      summary: 'Filter by client type (cli, dashboard, discord, scheduled)',
      default: 'cli',
      options: ['cli', 'dashboard', 'discord', 'scheduled', 'all'],
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionsList)

    const qs = new URLSearchParams()
    if (flags.agent) qs.set('agent', flags.agent)
    if (flags.client && flags.client !== 'all') qs.set('client', flags.client)
    qs.set('limit', String(flags.limit))

    let sessions: SessionRow[]
    try {
      const res = await gatewayFetch<{ sessions: SessionRow[] }>(`/sessions?${qs}`)
      sessions = res.sessions
    } catch (err) {
      this.error(String(err))
    }

    if (sessions.length === 0) {
      this.log(chalk.gray('No sessions found.'))
      return
    }

    const statusColor = (s: string) =>
      s === 'active' ? chalk.green(s) : s === 'ended' ? chalk.gray(s) : chalk.yellow(s)

    this.log('')
    this.log(
      chalk.bold('  ID'.padEnd(38)) +
      chalk.bold('AGENT'.padEnd(16)) +
      chalk.bold('CLIENT'.padEnd(12)) +
      chalk.bold('STATUS'.padEnd(10)) +
      chalk.bold('CREATED')
    )
    this.log('  ' + '─'.repeat(86))

    for (const s of sessions) {
      const agent = (s.agentSlug ?? s.agentId.slice(0, 8)).padEnd(14)
      const client = s.client.padEnd(10)
      const created = new Date(s.createdAt).toLocaleString()
      this.log(
        `  ${chalk.cyan(s.id.slice(0, 8))}…${s.id.slice(-4)} ` +
        `${agent} ` +
        `${chalk.gray(client)} ` +
        `${statusColor(s.status.padEnd(10))} ` +
        `${chalk.gray(created)}`
      )
    }
    this.log('')
  }
}
