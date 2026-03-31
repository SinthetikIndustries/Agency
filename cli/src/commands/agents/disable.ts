// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AgentsDisable extends Command {
  static summary = 'Disable an agent'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(AgentsDisable)
    try {
      await gatewayFetch(`/agents/${args.slug}/disable`, { method: 'POST' })
      this.log(`${chalk.yellow('✓')} Agent ${chalk.cyan(args.slug)} disabled.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
