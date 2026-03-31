// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class ApprovalsApprove extends Command {
  static summary = 'Approve a pending approval request'

  static args = {
    id: Args.string({ description: 'Approval ID', required: true }),
  }

  static flags = {
    note: Flags.string({ description: 'Optional note', char: 'n' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalsApprove)
    try {
      await gatewayFetch(`/approvals/${args.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note: flags.note }),
      })
      this.log(`${chalk.green('✓')} Approval ${chalk.cyan(args.id)} approved.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
