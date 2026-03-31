// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import { spawnSync } from 'node:child_process'
import { configPath } from '../../lib/config.js'

export default class ConfigEdit extends Command {
  static summary = 'Open the config file in your default editor'

  async run(): Promise<void> {
    await this.parse(ConfigEdit)
    const editor = process.env['EDITOR'] ?? 'nano'
    spawnSync(editor, [configPath], { stdio: 'inherit' })
    this.log('Config saved.')
  }
}
