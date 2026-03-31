// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class McpReconnect extends Command {
  static summary = 'Reconnect an MCP server connection'

  static args = {
    name: Args.string({ description: 'Connection name', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(McpReconnect)
    try {
      await gatewayFetch(`/mcp/connections/${args.name}/reconnect`, { method: 'POST' })
      this.log(`${chalk.green('✓')} MCP connection ${chalk.cyan(args.name)} reconnected.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
