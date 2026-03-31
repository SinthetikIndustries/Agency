// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class ApprovalsReject extends Command {
  static summary = 'Reject a pending approval request'

  static args = {
    id: Args.string({ description: 'Approval ID', required: true }),
  }

  static flags = {
    note: Flags.string({ description: 'Optional note', char: 'n' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalsReject)
    try {
      await gatewayFetch(`/approvals/${args.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note: flags.note }),
      })
      this.log(`${chalk.red('✗')} Approval ${chalk.cyan(args.id)} rejected.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
