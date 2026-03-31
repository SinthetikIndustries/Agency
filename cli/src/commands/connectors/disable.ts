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

export default class ConnectorsDisable extends Command {
  static summary = 'Disable a connector'

  static args = {
    name: Args.string({ description: 'Connector name to disable', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ConnectorsDisable)

    let result: ConnectorResult
    try {
      result = await gatewayFetch<ConnectorResult>(`/connectors/${args.name}/disable`, { method: 'POST' })
    } catch (err) {
      this.error(String(err))
    }

    if (result.ok && !result.enabled) {
      this.log(`${chalk.green('✓')} Connector ${chalk.cyan(result.connector)} disabled.`)
    } else {
      this.error(`Failed to disable connector ${args.name}.`)
    }
  }
}
