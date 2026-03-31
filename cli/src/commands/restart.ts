// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { stopGateway, startGateway, GatewayNotRunningError } from '../lib/process.js'
import { readConfig } from '../lib/config.js'

export default class Restart extends Command {
  static summary = 'Restart the Agency Gateway'

  async run(): Promise<void> {
    await this.parse(Restart)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Restarting Gateway...')

    // Stop (ignore if not running)
    process.stdout.write(chalk.gray('  Stopping... '))
    try {
      await stopGateway()
      this.log(chalk.green('done'))
    } catch (err) {
      if (err instanceof GatewayNotRunningError) {
        this.log(chalk.gray('not running'))
      } else {
        throw err
      }
    }

    // Read config and start
    const config = await readConfig()
    const gatewayDir = config.gatewayDir as string | undefined

    if (!gatewayDir) {
      this.error('Gateway directory is not configured. Run `agency install` first.')
    }

    process.stdout.write(chalk.gray('  Starting'))

    const tickInterval = setInterval(() => {
      process.stdout.write(chalk.gray('.'))
    }, 500)

    try {
      await startGateway(gatewayDir)
    } finally {
      clearInterval(tickInterval)
      process.stdout.write('\n')
    }

    this.log(chalk.green('✓') + ' Gateway restarted successfully')
  }
}
