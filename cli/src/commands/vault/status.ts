// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface VaultStatusResponse {
  documentCount: number
}

export default class VaultStatus extends Command {
  static summary = 'Show vault document count'

  async run(): Promise<void> {
    await this.parse(VaultStatus)

    let status: VaultStatusResponse
    try {
      status = await gatewayFetch<VaultStatusResponse>('/vault/status')
    } catch (err) {
      this.error(String(err))
    }

    this.log('')
    this.log(chalk.bold('  Vault Status'))
    this.log('  ' + '─'.repeat(36))
    this.log(`  Documents:     ${chalk.cyan(String(status.documentCount))}`)
    this.log('')
  }
}
