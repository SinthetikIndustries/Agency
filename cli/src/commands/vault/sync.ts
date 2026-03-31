// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class VaultSync extends Command {
  static summary = 'Trigger a full vault sync to the Postgres mirror'

  async run(): Promise<void> {
    await this.parse(VaultSync)

    this.log(`${chalk.cyan('›')} Triggering vault sync...`)
    try {
      const res = await gatewayFetch<{ message: string }>('/vault/sync', { method: 'POST' })
      this.log(chalk.green('✓') + ' ' + res.message)
    } catch (err) {
      this.error(String(err))
    }
  }
}
