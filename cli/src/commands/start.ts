// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { startGateway, getGatewayPid } from '../lib/process.js'

export default class Start extends Command {
  static summary = 'Start the Agency Gateway'

  async run(): Promise<void> {
    await this.parse(Start)

    // Check if already running
    const existingPid = await getGatewayPid()
    if (existingPid !== null) {
      this.warn(
        chalk.cyan('Agency') +
          chalk.gray(' › ') +
          `Gateway is already running (PID ${existingPid}). Use \`agency restart\` to restart it.`,
      )
      return
    }

    const config = await readConfig()
    const gatewayDir = config.gatewayDir as string | undefined

    if (!gatewayDir) {
      this.error('Gateway directory is not configured. Run `agency install` first.')
    }

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Starting Gateway...')
    process.stdout.write(chalk.gray('  Waiting for Gateway to become healthy'))

    const tickInterval = setInterval(() => {
      process.stdout.write(chalk.gray('.'))
    }, 500)

    try {
      await startGateway(gatewayDir)
    } finally {
      clearInterval(tickInterval)
      process.stdout.write('\n')
    }

    const config2 = await readConfig()
    const gateway = (config2.gateway ?? {}) as Record<string, unknown>
    const host = (gateway.host as string | undefined) ?? '127.0.0.1'
    const port = (gateway.port as number | undefined) ?? 3000

    this.log(chalk.green('✓') + ' Gateway started successfully')
    this.log(chalk.gray('  URL: ') + chalk.cyan(`http://${host}:${port}`))
  }
}
