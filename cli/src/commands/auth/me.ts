// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AuthMe extends Command {
  static summary = 'Show current authenticated session info'

  async run(): Promise<void> {
    try {
      const res = await gatewayFetch<{ sub: string; exp: number }>('/auth/me')
      const exp = new Date(res.exp * 1000)
      this.log('')
      this.log(`  ${chalk.bold('Subject:')} ${res.sub}`)
      this.log(`  ${chalk.bold('Expires:')} ${exp.toLocaleString()}`)
      this.log('')
    } catch (err) {
      if (String(err).includes('401')) {
        this.log(chalk.yellow('Not authenticated. Run `agency auth login`.'))
      } else {
        this.error(String(err))
      }
    }
  }
}
