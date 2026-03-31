// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { readConfig } from '../../lib/config.js'

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

export default class DevReset extends Command {
  static summary = 'Wipe and re-seed the development environment'

  async run(): Promise<void> {
    await this.parse(DevReset)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'dev reset')
    this.log('')

    const rl = createInterface({ input: process.stdin, output: process.stdout })

    try {
      const answer = await prompt(
        rl,
        chalk.yellow('This will wipe all data. Continue?') + chalk.gray(' (y/N): '),
      )

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        this.log(chalk.gray('  Aborted.'))
        return
      }
    } finally {
      rl.close()
    }

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

    // Down with volumes
    this.log(chalk.gray('  Stopping containers and removing volumes...'))
    const downResult = spawnSync(
      'docker',
      ['compose', '-f', composeFile, 'down', '-v'],
      { stdio: 'inherit' },
    )
    if (downResult.status !== 0) {
      this.error('Failed to bring down Docker Compose stack.')
    }

    // Bring back up
    this.log('')
    this.log(chalk.gray('  Starting fresh environment...'))
    const upResult = spawnSync(
      'docker',
      ['compose', '-f', composeFile, 'up', '-d'],
      { stdio: 'inherit' },
    )
    if (upResult.status !== 0) {
      this.error('Failed to start Docker Compose stack.')
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
    this.log(chalk.green('✓') + ' Environment reset.')
  }
}
