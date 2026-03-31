// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'

export default class DevSeed extends Command {
  static summary = 'Seed the development environment with sample data'

  async run(): Promise<void> {
    await this.parse(DevSeed)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'dev seed')
    this.log('')
    this.log('Seed data:')
    this.log('  - Main agent: already created on first boot by the Orchestrator')
    this.log('  - No additional seed data needed for Phase 1.')
    this.log('')
    this.log('Run ' + chalk.cyan('`agency chat`') + ' to start a conversation.')
  }
}
