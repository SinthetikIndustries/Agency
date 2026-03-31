// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SchedulesDisable extends Command {
  static summary = 'Pause a scheduled task'
  static args = { id: Args.string({ required: true }) }

  async run(): Promise<void> {
    const { args } = await this.parse(SchedulesDisable)
    try {
      await gatewayFetch(`/schedules/${args.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: false }) })
      this.log(`${chalk.green('✓')} Schedule paused.`)
    } catch (err) { this.error(String(err)) }
  }
}
