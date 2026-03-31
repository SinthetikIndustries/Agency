// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { join } from 'node:path'
import { readConfig } from '../lib/config.js'
import { startGateway, getGatewayPid, startDashboard, getDashboardPid } from '../lib/process.js'

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
    const repoDir = config.repoDir as string | undefined

    if (!gatewayDir) {
      this.error('Gateway directory is not configured. Run `agency install` first.')
    }

    // Start gateway
    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Starting services...')
    process.stdout.write(chalk.gray('  Gateway'))

    const gatewayTick = setInterval(() => process.stdout.write(chalk.gray('.')), 500)
    try {
      await startGateway(gatewayDir)
    } finally {
      clearInterval(gatewayTick)
      process.stdout.write(' ' + chalk.green('ready') + '\n')
    }

    // Start dashboard
    if (repoDir) {
      const appDir = join(repoDir, 'app')
      const dashPid = await getDashboardPid()
      if (dashPid !== null) {
        this.log(chalk.gray('  Dashboard already running'))
      } else {
        process.stdout.write(chalk.gray('  Dashboard'))
        const dashTick = setInterval(() => process.stdout.write(chalk.gray('.')), 500)
        try {
          await startDashboard(appDir)
        } finally {
          clearInterval(dashTick)
          process.stdout.write(' ' + chalk.green('ready') + '\n')
        }
      }
    }

    const config2 = await readConfig()
    const gateway = (config2.gateway ?? {}) as Record<string, unknown>
    const host = (gateway.host as string | undefined) ?? '127.0.0.1'
    const port = (gateway.port as number | undefined) ?? 3000

    this.log(chalk.green('✓') + ' Agency started')
    this.log(chalk.gray('  Gateway:   ') + chalk.cyan(`http://${host}:${port}`))
    this.log(chalk.gray('  Dashboard: ') + chalk.cyan('http://localhost:2001'))
  }
}
