// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { readConfig, writeConfig } from '../../lib/config.js'

export default class VaultInit extends Command {
  static summary = 'Configure the Obsidian vault path'

  static flags = {
    path: Flags.string({
      char: 'p',
      summary: 'Absolute path to your Obsidian vault',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(VaultInit)

    const config = await readConfig()
    if (typeof config['vault'] !== 'object' || config['vault'] === null) {
      config['vault'] = {}
    }
    const vault = config['vault'] as Record<string, unknown>
    vault['enabled'] = true
    vault['path'] = flags.path

    await writeConfig(config)

    this.log('')
    this.log(chalk.green('✓') + ' Vault path set to: ' + chalk.cyan(flags.path))
    this.log(chalk.gray('  Set AGENCY_VAULT_PATH env var or restart the gateway to apply.'))
    this.log('')
  }
}
