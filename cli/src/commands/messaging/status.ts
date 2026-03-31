// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface InboxDepth {
  agentId: string
  agentSlug: string
  agentName: string
  high: number
  normal: number
  total: number
}

interface RecentMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  priority: string
  subject: string
  status: string
  createdAt: string
}

export default class MessagingStatus extends Command {
  static summary = 'Show inter-agent messaging queue depths and recent messages'

  async run(): Promise<void> {
    let inboxDepths: InboxDepth[]
    let recentMessages: RecentMessage[]

    try {
      const res = await gatewayFetch<{ inboxDepths: InboxDepth[]; recentMessages: RecentMessage[] }>(
        '/messaging/status'
      )
      inboxDepths = res.inboxDepths
      recentMessages = res.recentMessages
    } catch (err) {
      this.error(String(err))
    }

    // Inbox depths
    this.log('')
    this.log(chalk.bold('Inbox Queue Depths'))
    this.log('─'.repeat(56))

    if (inboxDepths.length === 0) {
      this.log(chalk.gray('  No agents found.'))
    } else {
      this.log(
        chalk.bold('  AGENT'.padEnd(24)) +
        chalk.bold('HIGH'.padEnd(8)) +
        chalk.bold('NORMAL'.padEnd(10)) +
        chalk.bold('TOTAL')
      )
      for (const d of inboxDepths.sort((a, b) => b.total - a.total)) {
        const totalColor = d.total > 0 ? chalk.yellow : chalk.gray
        this.log(
          `  ${chalk.cyan(d.agentSlug.padEnd(22))} ` +
          `${(d.high > 0 ? chalk.yellow : chalk.gray)(String(d.high).padEnd(6))} ` +
          `${chalk.gray(String(d.normal).padEnd(8))} ` +
          `${totalColor(String(d.total))}`
        )
      }
    }

    // Recent messages
    this.log('')
    this.log(chalk.bold('Recent Messages') + chalk.gray(` (${recentMessages.length})`))
    this.log('─'.repeat(80))

    if (recentMessages.length === 0) {
      this.log(chalk.gray('  No messages.'))
    } else {
      this.log(
        chalk.bold('  FROM'.padEnd(12)) +
        chalk.bold('TO'.padEnd(12)) +
        chalk.bold('PRI'.padEnd(8)) +
        chalk.bold('STATUS'.padEnd(12)) +
        chalk.bold('SUBJECT')
      )
      for (const m of recentMessages.slice(0, 20)) {
        const statusColor =
          m.status === 'read' ? chalk.green :
          m.status === 'queued' ? chalk.yellow :
          m.status === 'dead' ? chalk.red :
          chalk.gray
        const priColor = m.priority === 'high' ? chalk.yellow : chalk.gray
        this.log(
          `  ${chalk.cyan(m.fromAgentId.slice(0, 8))}   ` +
          `${chalk.cyan(m.toAgentId.slice(0, 8))}   ` +
          `${priColor(m.priority.padEnd(6))} ` +
          `${statusColor(m.status.padEnd(10))} ` +
          `${m.subject}`
        )
      }
    }

    this.log('')
  }
}
