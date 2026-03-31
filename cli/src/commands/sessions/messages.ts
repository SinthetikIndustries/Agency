// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
}

export default class SessionsMessages extends Command {
  static summary = 'Show message history for a session'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
  }

  static flags = {
    limit: Flags.integer({ char: 'n', summary: 'Max messages to show', default: 20 }),
    raw: Flags.boolean({ summary: 'Print raw content without truncation' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SessionsMessages)
    let messages: Message[]
    try {
      const res = await gatewayFetch<{ messages: Message[] }>(`/sessions/${args.id}/messages`)
      messages = res.messages.slice(-flags.limit)
    } catch (err) {
      this.error(String(err))
    }

    if (messages.length === 0) {
      this.log(chalk.gray('No messages in this session.'))
      return
    }

    this.log('')
    for (const m of messages) {
      const label = m.role === 'user' ? chalk.cyan('You') : chalk.green('Agent')
      const ts = chalk.gray(new Date(m.createdAt).toLocaleTimeString())
      const content = flags.raw ? m.content : (m.content.length > 300 ? m.content.slice(0, 300) + chalk.gray('…') : m.content)
      this.log(`${label} ${ts}`)
      this.log(`  ${content.replace(/\n/g, '\n  ')}`)
      this.log('')
    }
  }
}
