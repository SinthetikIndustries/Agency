// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface VaultStatusResponse {
  enabled: boolean
  documentCount: number
  errorCount: number
  lastSyncAt: string | null
}

export default class VaultStatus extends Command {
  static summary = 'Show vault sync status'

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
    this.log(`  Enabled:       ${status.enabled ? chalk.green('yes') : chalk.gray('no')}`)
    this.log(`  Documents:     ${chalk.cyan(String(status.documentCount))}`)
    this.log(`  Errors:        ${status.errorCount > 0 ? chalk.red(String(status.errorCount)) : chalk.green('0')}`)
    this.log(`  Last sync:     ${status.lastSyncAt ? chalk.cyan(new Date(status.lastSyncAt).toLocaleString()) : chalk.gray('never')}`)
    this.log('')
  }
}
