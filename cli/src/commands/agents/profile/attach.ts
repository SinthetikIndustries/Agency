// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../../lib/gateway.js'

export default class AgentsProfileAttach extends Command {
  static summary = 'Attach a profile to an agent'

  static args = {
    agent: Args.string({ description: 'Agent slug', required: true }),
    profile: Args.string({ description: 'Profile slug', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(AgentsProfileAttach)

    try {
      await gatewayFetch<{ ok: boolean }>(`/agents/${args.agent}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileSlug: args.profile }),
      })
    } catch (err) {
      this.error(`Failed to attach profile: ${String(err)}`)
    }

    this.log(
      chalk.green('✓') +
      ` Profile ${chalk.cyan(args.profile)} attached to ${chalk.cyan(args.agent)}`
    )
  }
}
