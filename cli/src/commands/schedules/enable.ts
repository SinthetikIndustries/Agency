// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SchedulesEnable extends Command {
  static summary = 'Enable a scheduled task'
  static args = { id: Args.string({ required: true }) }

  async run(): Promise<void> {
    const { args } = await this.parse(SchedulesEnable)
    try {
      await gatewayFetch(`/schedules/${args.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) })
      this.log(`${chalk.green('✓')} Schedule enabled.`)
    } catch (err) { this.error(String(err)) }
  }
}
