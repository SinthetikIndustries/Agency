// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readConfig } from '../../lib/config.js'

export default class DevScaffold extends Command {
  static summary = 'Set up the development environment via Docker Compose'

  async run(): Promise<void> {
    await this.parse(DevScaffold)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'dev scaffold')
    this.log('')

    // Check Docker is available
    process.stdout.write(chalk.gray('  Checking Docker... '))
    const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe' })
    if (dockerCheck.status !== 0) {
      this.error('Docker is not available. Please install and start Docker first.')
    }
    this.log(chalk.green('ok'))

    // Resolve compose file
    const config = await readConfig()
    let composeFile = (config.composeFile as string | undefined) ?? ''

    if (!composeFile || !existsSync(composeFile)) {
      this.error(
        'No compose file configured.\n' +
        'Set "composeFile" in your Agency config or pass --compose-file.\n' +
        'Example: agency config set composeFile ./infra/compose/docker-compose.dev.yml'
      )
    }

    this.log(chalk.gray('  Starting Docker Compose stack (--build)...'))
    this.log('')

    const result = spawnSync(
      'docker',
      ['compose', '-f', composeFile, 'up', '-d', '--build'],
      { stdio: 'inherit' },
    )

    if (result.status !== 0) {
      this.error('Docker Compose failed to start the development environment.')
    }

    // Wait for gateway health
    this.log('')
    process.stdout.write(chalk.gray('  Waiting for gateway health... '))

    const host = '127.0.0.1'
    const port = (((config.gateway ?? {}) as Record<string, unknown>).port as number | undefined) ?? 3000
    const healthUrl = `http://${host}:${port}/health`
    const deadline = Date.now() + 30_000
    let healthy = false

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000))
      try {
        const res = await fetch(healthUrl)
        if (res.ok) {
          healthy = true
          break
        }
      } catch {
        // not ready yet
      }
    }

    if (!healthy) {
      this.warn('Gateway did not respond within 30 seconds. It may still be starting up.')
    } else {
      this.log(chalk.green('ok'))
    }

    this.log('')
    this.log(chalk.green('✓') + ' Development environment ready.')
    this.log('')
    this.log('  ' + chalk.cyan('agency chat') + chalk.gray('    — start a conversation'))
    this.log('  ' + chalk.cyan('agency status') + chalk.gray('  — check service health'))
  }
}
