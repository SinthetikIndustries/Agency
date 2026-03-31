// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SessionsUnpin extends Command {
  static summary = 'Unpin a session'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SessionsUnpin)
    try {
      await gatewayFetch(`/sessions/${args.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: false }),
      })
      this.log(`${chalk.green('✓')} Session ${chalk.cyan(args.id)} unpinned.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
