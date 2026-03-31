// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface ModelRow {
  name: string
  tier: string
  provider: string
  isDefault: boolean
}

export default class ModelsList extends Command {
  static summary = 'List available model providers'

  async run(): Promise<void> {
    await this.parse(ModelsList)

    let models: ModelRow[]
    try {
      const res = await gatewayFetch<{ models: ModelRow[]; defaultModel: string; tiers: string[] }>('/models')
      models = res.models
    } catch (err) {
      this.error(String(err))
    }

    if (models.length === 0) {
      this.log('No models found.')
      return
    }

    this.log('')
    this.log(
      chalk.bold('  NAME'.padEnd(32)) +
      chalk.bold('TIER'.padEnd(14)) +
      chalk.bold('PROVIDER'.padEnd(20)) +
      chalk.bold('DEFAULT')
    )
    this.log('  ' + '─'.repeat(72))

    for (const m of models) {
      const defaultLabel = m.isDefault ? chalk.green('* (default)') : ''
      this.log(
        `  ${chalk.cyan(m.name.padEnd(30))} ` +
        `${m.tier.padEnd(14)}` +
        `${m.provider.padEnd(20)}` +
        `${defaultLabel}`
      )
    }
    this.log('')
  }
}
