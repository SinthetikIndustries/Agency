// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SkillsRemove extends Command {
  static summary = 'Remove an installed skill (takes effect on next gateway restart)'

  static args = {
    name: Args.string({ description: 'Skill name to remove', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SkillsRemove)

    try {
      await gatewayFetch(`/skills/${encodeURIComponent(args.name)}`, { method: 'DELETE' })
    } catch (err) {
      this.error(String(err))
    }

    this.log(chalk.green('✓') + ` Skill ${chalk.bold(args.name)} marked for removal`)
    this.log(chalk.gray('  Run `agency restart` to complete uninstall.'))
  }
}
