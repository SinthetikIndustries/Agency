// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class HealthService extends Command {
  static summary = 'Check health of a specific service'

  static args = {
    service: Args.string({
      description: 'Service name: orchestrator | modelRouter | postgres | redis | messaging | vaultSync',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(HealthService)
    try {
      const res = await gatewayFetch<{ service: string; status: string; detail?: string }>(
        `/health/${args.service}`
      )
      const ok = res.status === 'ok'
      const icon = ok ? chalk.green('✓') : chalk.red('✗')
      this.log(`${icon} ${chalk.bold(res.service)}: ${ok ? chalk.green(res.status) : chalk.red(res.status)}`)
      if (res.detail) this.log(`  ${chalk.gray(res.detail)}`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
