// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface ConnectorResult {
  ok: boolean
  connector: string
  enabled: boolean
}

export default class ConnectorsEnable extends Command {
  static summary = 'Enable a connector'

  static args = {
    name: Args.string({ description: 'Connector name to enable', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ConnectorsEnable)

    let result: ConnectorResult
    try {
      result = await gatewayFetch<ConnectorResult>(`/connectors/${args.name}/enable`, { method: 'POST' })
    } catch (err) {
      this.error(String(err))
    }

    if (result.ok && result.enabled) {
      this.log(`${chalk.green('✓')} Connector ${chalk.cyan(result.connector)} enabled.`)
    } else {
      this.error(`Failed to enable connector ${args.name}.`)
    }
  }
}
