// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command, Flags } from '@oclif/core'
import { readConfig, getNestedValue } from '../../lib/config.js'

export default class ConfigGet extends Command {
  static summary = 'Get a config value by key'

  static args = {
    key: Args.string({ description: 'Config key to retrieve', required: true }),
  }

  static flags = {
    json: Flags.boolean({ description: 'Output as JSON', default: false }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigGet)
    const config = await readConfig()
    const value = getNestedValue(config, args.key)

    if (value === undefined) {
      this.log(`Key not found: ${args.key}`)
      return
    }

    if (flags.json) {
      this.log(JSON.stringify({ key: args.key, value }))
      return
    }

    if (typeof value === 'object' && value !== null) {
      this.log(JSON.stringify(value))
    } else {
      this.log(String(value))
    }
  }
}
