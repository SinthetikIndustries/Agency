// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface MemberRow {
  agentId: string
  agentSlug?: string
  agentName?: string
  role: string
  joinedAt: string
}

export default class GroupsMembers extends Command {
  static summary = 'List members of a workspace group'

  static args = {
    id: Args.string({ description: 'Group ID or slug', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(GroupsMembers)

    let members: MemberRow[]
    try {
      const res = await gatewayFetch<{ members: MemberRow[] }>(`/groups/${args.id}/members`)
      members = res.members
    } catch (err) {
      this.error(`Cannot reach Gateway: ${String(err)}\nRun \`agency start\` first.`)
    }

    if (members.length === 0) {
      this.log(`No members in group ${args.id}.`)
      return
    }

    this.log('')
    this.log(
      chalk.bold('  SLUG'.padEnd(22)) +
      chalk.bold('NAME'.padEnd(24)) +
      chalk.bold('ROLE'.padEnd(14)) +
      chalk.bold('JOINED')
    )
    this.log('  ' + '─'.repeat(80))

    for (const m of members) {
      const joined = new Date(m.joinedAt).toLocaleDateString()
      this.log(
        `  ${chalk.cyan((m.agentSlug ?? m.agentId).padEnd(20))} ` +
        `${(m.agentName ?? '—').padEnd(24)}` +
        `${m.role.padEnd(14)}` +
        `${chalk.dim(joined)}`
      )
    }
    this.log('')
  }
}
