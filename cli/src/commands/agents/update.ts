// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AgentsUpdate extends Command {
  static summary = 'Update agent settings'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
  }

  static flags = {
    name: Flags.string({ summary: 'New display name' }),
    lifecycle: Flags.string({ summary: 'Lifecycle type: always_on | dormant' }),
    shell: Flags.string({ summary: 'Shell permission level: none | read | restricted | full' }),
    'wake-mode': Flags.string({ summary: 'Wake mode: on_message | scheduled | manual' }),
    'agent-mgmt': Flags.string({ summary: 'Agent management permission: none | read | full' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentsUpdate)

    const body: Record<string, string> = {}
    if (flags.name) body.name = flags.name
    if (flags.lifecycle) body.lifecycleType = flags.lifecycle
    if (flags.shell) body.shellPermissionLevel = flags.shell
    if (flags['wake-mode']) body.wakeMode = flags['wake-mode']
    if (flags['agent-mgmt']) body.agentManagementPermission = flags['agent-mgmt']

    if (Object.keys(body).length === 0) {
      this.error('Specify at least one field to update (--name, --lifecycle, --shell, --wake-mode, --agent-mgmt)')
    }

    try {
      await gatewayFetch(`/agents/${args.slug}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      this.log(`${chalk.green('✓')} Agent ${chalk.cyan(args.slug)} updated.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
