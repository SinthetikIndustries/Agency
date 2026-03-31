// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface ConnectorRow {
  name: string
  enabled: boolean
}

export default class ConnectorsList extends Command {
  static summary = 'List available connectors'

  async run(): Promise<void> {
    await this.parse(ConnectorsList)

    let connectors: ConnectorRow[]
    try {
      const res = await gatewayFetch<{ connectors: ConnectorRow[] }>('/connectors')
      connectors = res.connectors
    } catch (err) {
      this.error(String(err))
    }

    if (connectors.length === 0) {
      this.log('No connectors found.')
      return
    }

    this.log('')
    this.log(
      chalk.bold('  NAME'.padEnd(32)) +
      chalk.bold('STATUS')
    )
    this.log('  ' + '─'.repeat(44))

    for (const c of connectors) {
      const status = c.enabled ? chalk.green('enabled') : chalk.gray('disabled')
      this.log(`  ${chalk.cyan(c.name.padEnd(30))} ${status}`)
    }
    this.log('')
  }
}
