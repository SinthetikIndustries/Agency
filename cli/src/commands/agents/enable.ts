// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AgentsEnable extends Command {
  static summary = 'Enable a disabled agent'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(AgentsEnable)
    try {
      await gatewayFetch(`/agents/${args.slug}/enable`, { method: 'POST' })
      this.log(`${chalk.green('✓')} Agent ${chalk.cyan(args.slug)} enabled.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
