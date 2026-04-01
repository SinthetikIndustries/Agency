// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { readCredentials } from '../lib/config.js'

export default class Key extends Command {
  static summary = 'Show the dashboard API key'

  async run(): Promise<void> {
    await this.parse(Key)

    const creds = await readCredentials()
    const apiKey = (creds.gateway as Record<string, unknown> | undefined)?.apiKey as string | undefined

    if (!apiKey) {
      this.error('No API key found. Run `agency install` first.')
    }

    this.log('')
    this.log(chalk.gray('Dashboard API key:'))
    this.log(chalk.yellow(apiKey))
    this.log('')
    this.log(chalk.gray(`Login at: `) + chalk.cyan(`http://localhost:2001`))
    this.log('')
  }
}
