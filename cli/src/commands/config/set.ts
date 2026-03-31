// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { readConfig, writeConfig, setNestedValue, getNestedValue, parseConfigValue } from '../../lib/config.js'

export default class ConfigSet extends Command {
  static summary = 'Set a config value by key'

  static args = {
    key: Args.string({ description: 'Config key to set', required: true }),
    value: Args.string({ description: 'Value to assign', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet)
    const config = await readConfig()

    const existing = getNestedValue(config, args.key)
    if (existing === undefined) {
      this.log(chalk.yellow(`Warning: '${args.key}' is a new key being added to config.`))
    }

    const parsed = parseConfigValue(args.value)
    setNestedValue(config, args.key, parsed)
    await writeConfig(config)

    this.log(`Set ${args.key} = ${typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed)}`)
  }
}
