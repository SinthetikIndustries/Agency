// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface AgentRow {
  slug: string
  name: string
  status: string
  lifecycleType: string
  profile: { slug: string; name: string }
  shellPermissionLevel: string
}

export default class AgentsList extends Command {
  static summary = 'List all agents and their status'

  async run(): Promise<void> {
    let agents: AgentRow[]
    try {
      const res = await gatewayFetch<{ agents: AgentRow[] }>('/agents')
      agents = res.agents
    } catch (err) {
      this.error(`Cannot reach Gateway: ${String(err)}\nRun \`agency start\` first.`)
    }

    if (agents.length === 0) {
      this.log('No agents found.')
      return
    }

    const statusColor = (s: string) =>
      s === 'active' ? chalk.green(s) : s === 'disabled' ? chalk.yellow(s) : chalk.red(s)

    this.log('')
    this.log(
      chalk.bold('  SLUG'.padEnd(20)) +
      chalk.bold('NAME'.padEnd(20)) +
      chalk.bold('PROFILE'.padEnd(24)) +
      chalk.bold('LIFECYCLE'.padEnd(14)) +
      chalk.bold('STATUS')
    )
    this.log('  ' + '─'.repeat(80))

    for (const a of agents) {
      this.log(
        `  ${chalk.cyan(a.slug.padEnd(18))} ` +
        `${a.name.padEnd(20)}` +
        `${a.profile.name.padEnd(24)}` +
        `${a.lifecycleType.padEnd(14)}` +
        `${statusColor(a.status)}`
      )
    }
    this.log('')
  }
}
