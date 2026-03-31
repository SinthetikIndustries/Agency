// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { stopGateway, GatewayNotRunningError } from '../lib/process.js'

export default class Stop extends Command {
  static summary = 'Stop the Agency Gateway'

  async run(): Promise<void> {
    await this.parse(Stop)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Stopping Gateway...')

    try {
      await stopGateway()
      this.log(chalk.green('✓') + ' Gateway stopped successfully')
    } catch (err) {
      if (err instanceof GatewayNotRunningError) {
        this.log(chalk.yellow('⚠') + ' Gateway is not running')
      } else {
        throw err
      }
    }
  }
}
