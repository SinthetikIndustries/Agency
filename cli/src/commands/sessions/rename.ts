// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SessionsRename extends Command {
  static summary = 'Rename a session'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
    name: Args.string({ description: 'New name (everything after the agent prefix, e.g. "Website Brainstorm")', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SessionsRename)
    try {
      await gatewayFetch(`/sessions/${args.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: args.name }),
      })
      this.log(`${chalk.green('✓')} Session renamed to ${chalk.cyan(args.name)}.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
