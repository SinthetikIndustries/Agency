// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'
import { readConfig, writeConfig, setNestedValue } from '../../lib/config.js'

interface SetDefaultResult {
  ok: boolean
  defaultModel: string
}

export default class ModelsSetDefault extends Command {
  static summary = 'Set the default model'

  static args = {
    model: Args.string({ description: 'Model name to set as default', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ModelsSetDefault)

    let result: SetDefaultResult
    try {
      result = await gatewayFetch<SetDefaultResult>('/models/default', {
        method: 'PUT',
        body: JSON.stringify({ model: args.model }),
      })
    } catch (err) {
      this.error(String(err))
    }

    if (!result.ok) {
      this.error(`Failed to set default model to ${args.model}.`)
    }

    // Persist to local config
    try {
      const config = await readConfig()
      setNestedValue(config, 'modelRouter.defaultModel', result.defaultModel)
      await writeConfig(config)
    } catch {
      // Non-fatal — gateway already updated
    }

    this.log(`${chalk.green('✓')} Default model set to ${chalk.cyan(result.defaultModel)}.`)
  }
}
