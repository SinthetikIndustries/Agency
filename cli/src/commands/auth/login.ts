// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'
import { readCredentials } from '../../lib/config.js'

export default class AuthLogin extends Command {
  static summary = 'Authenticate with the gateway (sets a session cookie)'

  static flags = {
    'api-key': Flags.string({ char: 'k', summary: 'API key (reads from credentials.json if omitted)' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin)

    let apiKey = flags['api-key']
    if (!apiKey) {
      const creds = await readCredentials()
      apiKey = (creds?.gateway as Record<string, string> | undefined)?.apiKey ?? ''
    }

    if (!apiKey) this.error('No API key found. Pass --api-key or set credentials.gateway.apiKey')

    try {
      await gatewayFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      })
      this.log(`${chalk.green('✓')} Authenticated.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
