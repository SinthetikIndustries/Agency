// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AgentsCreate extends Command {
  static summary = 'Create a new agent'

  static flags = {
    name: Flags.string({ char: 'n', summary: 'Agent name', required: true }),
    profile: Flags.string({ char: 'p', summary: 'Profile slug to assign', default: 'balanced' }),
    lifecycle: Flags.string({ char: 'l', summary: 'Lifecycle type: always_on | dormant', default: 'dormant' }),
    shell: Flags.string({ summary: 'Shell permission level: none | read | restricted | full', default: 'none' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentsCreate)
    try {
      const res = await gatewayFetch<{ agent: { identity: { slug: string; name: string } } }>('/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: flags.name,
          profileSlug: flags.profile,
          lifecycleType: flags.lifecycle,
          shellPermissionLevel: flags.shell,
        }),
      })
      this.log(`${chalk.green('✓')} Agent created: ${chalk.cyan(res.agent.identity.slug)} (${res.agent.identity.name})`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
