// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../../lib/gateway.js'

interface Profile {
  slug: string
  name: string
  description: string
  modelTier: string
  builtIn: boolean
}

export default class AgentsProfileList extends Command {
  static summary = 'List available agent profiles'

  async run(): Promise<void> {
    let profiles: Profile[]
    try {
      const res = await gatewayFetch<{ profiles: Profile[] }>('/profiles')
      profiles = res.profiles
    } catch (err) {
      this.error(`Cannot reach Gateway: ${String(err)}\nRun \`agency start\` first.`)
    }

    this.log('')
    this.log(
      chalk.bold('  SLUG'.padEnd(28)) +
      chalk.bold('NAME'.padEnd(24)) +
      chalk.bold('TIER'.padEnd(10)) +
      chalk.bold('TYPE')
    )
    this.log('  ' + '─'.repeat(72))

    for (const p of profiles) {
      this.log(
        `  ${chalk.cyan(p.slug.padEnd(26))} ` +
        `${p.name.padEnd(24)}` +
        `${p.modelTier.padEnd(10)}` +
        `${p.builtIn ? chalk.gray('built-in') : chalk.blue('custom')}`
      )
      if (p.description) {
        this.log(`    ${chalk.gray(p.description)}`)
      }
    }
    this.log('')
  }
}
