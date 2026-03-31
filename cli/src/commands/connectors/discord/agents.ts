// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../../lib/gateway.js'

interface DiscordAgent { slug: string; enabled: boolean }

export default class ConnectorsDiscordAgents extends Command {
  static summary = 'List Discord-connected agents and their enabled status'

  async run(): Promise<void> {
    let agents: DiscordAgent[]
    try {
      const res = await gatewayFetch<{ agents: DiscordAgent[] }>('/connectors/discord/agents')
      agents = res.agents
    } catch (err) {
      this.error(String(err))
    }

    if (agents.length === 0) {
      this.log(chalk.gray('No Discord agents configured.'))
      return
    }

    this.log('')
    this.log(chalk.bold('  SLUG'.padEnd(24)) + chalk.bold('STATUS'))
    this.log('  ' + '─'.repeat(36))
    for (const a of agents) {
      this.log(`  ${chalk.cyan(a.slug.padEnd(22))} ${a.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`)
    }
    this.log('')
  }
}
