// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class McpConnections extends Command {
  static summary = 'List MCP server connections'

  async run(): Promise<void> {
    let connections: unknown[]
    try {
      const res = await gatewayFetch<{ connections: unknown[] }>('/mcp/connections')
      connections = res.connections
    } catch (err) {
      this.error(String(err))
    }

    if (connections.length === 0) {
      this.log(chalk.gray('No MCP connections configured.'))
      return
    }

    this.log(JSON.stringify(connections, null, 2))
  }
}
