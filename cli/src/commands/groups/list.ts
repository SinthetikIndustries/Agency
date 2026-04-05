// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface GroupRow {
  id: string
  slug: string
  name: string
  description?: string
  memberCount?: number
  workspacePath: string
}

export default class GroupsList extends Command {
  static summary = 'List workspace groups'

  async run(): Promise<void> {
    let groups: GroupRow[]
    try {
      const res = await gatewayFetch<{ groups: GroupRow[] }>('/groups')
      groups = res.groups
    } catch (err) {
      this.error(`Cannot reach Gateway: ${String(err)}\nRun \`agency start\` first.`)
    }

    if (groups.length === 0) {
      this.log('No groups found. Create one with: agency groups create')
      return
    }

    this.log('')
    this.log(
      chalk.bold('  SLUG'.padEnd(22)) +
      chalk.bold('NAME'.padEnd(24)) +
      chalk.bold('MEMBERS'.padEnd(10)) +
      chalk.bold('WORKSPACE')
    )
    this.log('  ' + '─'.repeat(80))

    for (const g of groups) {
      const members = g.memberCount !== undefined ? String(g.memberCount) : '—'
      this.log(
        `  ${chalk.cyan(g.slug.padEnd(20))} ` +
        `${(g.name ?? '').padEnd(24)}` +
        `${members.padEnd(10)}` +
        `${chalk.dim(g.workspacePath)}`
      )
    }
    this.log('')
  }
}
