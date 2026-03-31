// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SessionsPin extends Command {
  static summary = 'Pin a session to the top of the list'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SessionsPin)
    try {
      await gatewayFetch(`/sessions/${args.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: true }),
      })
      this.log(`${chalk.green('✓')} Session ${chalk.cyan(args.id)} pinned.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
