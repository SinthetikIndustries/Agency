// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface GraphStatusResponse {
  nodes: number
  edges: number
  unresolvedLinks: number
}

export default class VaultGraphStatus extends Command {
  static summary = 'Show vault knowledge graph stats'

  async run(): Promise<void> {
    await this.parse(VaultGraphStatus)

    let stats: GraphStatusResponse
    try {
      stats = await gatewayFetch<GraphStatusResponse>('/vault/graph-status')
    } catch (err) {
      this.error(String(err))
    }

    this.log('')
    this.log(chalk.bold('  Knowledge Graph'))
    this.log('  ' + '─'.repeat(36))
    this.log(`  Entities (nodes):  ${chalk.cyan(String(stats.nodes))}`)
    this.log(`  Links (edges):     ${chalk.cyan(String(stats.edges))}`)
    this.log(`  Unresolved links:  ${stats.unresolvedLinks > 0 ? chalk.yellow(String(stats.unresolvedLinks)) : chalk.green('0')}`)
    this.log('')
  }
}
