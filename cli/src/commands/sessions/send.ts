// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SessionsSend extends Command {
  static summary = 'Send a message to a session and print the response'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
    message: Args.string({ description: 'Message to send', required: true }),
  }

  static flags = {
    model: Flags.string({ summary: 'Override model for this message' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SessionsSend)
    process.stdout.write(chalk.gray('Thinking…\r'))
    try {
      const body: Record<string, string> = { content: args.message }
      if (flags.model) body.model = flags.model
      const res = await gatewayFetch<{ response: string }>(`/sessions/${args.id}/send`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      process.stdout.write('          \r')
      this.log('')
      this.log(res.response)
      this.log('')
    } catch (err) {
      process.stdout.write('          \r')
      this.error(String(err))
    }
  }
}
