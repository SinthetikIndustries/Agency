// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SchedulesDelete extends Command {
  static summary = 'Delete a scheduled task'
  static args = { id: Args.string({ required: true }) }
  static flags = { confirm: Flags.boolean({ char: 'y', summary: 'Skip confirmation' }) }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SchedulesDelete)
    if (!flags.confirm) {
      const readline = await import('node:readline')
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const answer = await new Promise<string>(resolve => rl.question(`Delete schedule ${args.id}? (y/N) `, resolve))
      rl.close()
      if (answer.toLowerCase() !== 'y') { this.log('Aborted.'); return }
    }
    try {
      await gatewayFetch(`/schedules/${args.id}`, { method: 'DELETE' })
      this.log(`${chalk.green('✓')} Deleted.`)
    } catch (err) { this.error(String(err)) }
  }
}
