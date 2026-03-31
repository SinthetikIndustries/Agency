// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AuthLogout extends Command {
  static summary = 'Clear the gateway session cookie'

  async run(): Promise<void> {
    try {
      await gatewayFetch('/auth/logout', { method: 'POST' })
      this.log(`${chalk.green('✓')} Logged out.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
