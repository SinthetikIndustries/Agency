// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { readConfig } from '../lib/config.js'
import { stopGateway, startGateway, GatewayNotRunningError } from '../lib/process.js'

export default class Update extends Command {
  static summary = 'Pull the latest Agency release and rebuild'

  async run(): Promise<void> {
    await this.parse(Update)

    const config = await readConfig()
    const repoDir = config.repoDir as string | undefined

    if (!repoDir) {
      this.error('repoDir not configured. Run `agency install` first.')
    }

    const appDir = join(repoDir, 'app')
    const gatewayDir = join(repoDir, 'app', 'apps', 'gateway')

    // Stop gateway
    this.log(chalk.gray('Stopping gateway...'))
    try {
      await stopGateway()
    } catch (err) {
      if (!(err instanceof GatewayNotRunningError)) throw err
    }

    // git pull
    this.log(chalk.gray('Pulling latest changes...'))
    const pullResult = spawnSync('git', ['pull'], { cwd: repoDir, stdio: 'inherit' })
    if (pullResult.error) {
      this.error(`Failed to run git: ${pullResult.error.message}`)
    }
    if (pullResult.status !== 0) {
      this.error('git pull failed. Resolve any conflicts, then run `agency update` again.')
    }

    // pnpm install
    this.log(chalk.gray('Installing dependencies...'))
    const installResult = spawnSync('pnpm', ['install'], { cwd: appDir, stdio: 'inherit' })
    if (installResult.error) {
      this.error(`Failed to run pnpm: ${installResult.error.message}`)
    }
    if (installResult.status !== 0) {
      this.error('pnpm install failed.')
    }

    // pnpm build
    this.log(chalk.gray('Building...'))
    const buildResult = spawnSync('pnpm', ['build'], { cwd: appDir, stdio: 'inherit' })
    if (buildResult.error) {
      this.error(`Failed to run pnpm: ${buildResult.error.message}`)
    }
    if (buildResult.status !== 0) {
      this.error('Build failed. Check the output above.')
    }

    // Start gateway (auto-runs any new migrations on startup)
    this.log(chalk.gray('Starting gateway...'))
    await startGateway(gatewayDir)

    this.log(chalk.green('✓') + ' Agency updated successfully.')
  }
}
