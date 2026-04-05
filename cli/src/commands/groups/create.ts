// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class GroupsCreate extends Command {
  static summary = 'Create a new workspace group'

  static flags = {
    name: Flags.string({ char: 'n', summary: 'Group name', required: true }),
    description: Flags.string({ char: 'd', summary: 'Group description' }),
    goals: Flags.string({ char: 'g', summary: 'Comma-separated list of group goals' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(GroupsCreate)

    const goals = flags.goals
      ? flags.goals.split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    try {
      const res = await gatewayFetch<{ group: { id: string; slug: string; name: string; workspacePath: string } }>('/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: flags.name,
          description: flags.description,
          goals,
        }),
      })
      const g = res.group
      this.log(`${chalk.green('✓')} Group created: ${chalk.cyan(g.slug)} (${g.name})`)
      this.log(`  Workspace: ${chalk.dim(g.workspacePath)}`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
