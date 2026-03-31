// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SessionsDelete extends Command {
  static summary = 'Delete a session and its messages'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
  }

  static flags = {
    confirm: Flags.boolean({ char: 'y', summary: 'Skip confirmation prompt' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SessionsDelete)

    if (!flags.confirm) {
      const { default: readline } = await import('node:readline')
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const answer = await new Promise<string>(resolve => {
        rl.question(`Delete session ${chalk.cyan(args.id)}? [y/N] `, resolve)
      })
      rl.close()
      if (answer.toLowerCase() !== 'y') {
        this.log(chalk.gray('Aborted.'))
        return
      }
    }

    try {
      await gatewayFetch(`/sessions/${args.id}`, { method: 'DELETE' })
      this.log(`${chalk.red('✓')} Session ${chalk.cyan(args.id)} deleted.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
