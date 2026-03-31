// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface Approval {
  id: string
  agent_id: string
  session_id: string
  prompt: string
  tool_name?: string
  status: string
  requested_at: string
}

export default class ApprovalsList extends Command {
  static summary = 'List pending approvals'

  async run(): Promise<void> {
    let approvals: Approval[]
    try {
      const res = await gatewayFetch<{ approvals: Approval[] }>('/approvals')
      approvals = res.approvals
    } catch (err) {
      this.error(String(err))
    }

    if (approvals.length === 0) {
      this.log(`${chalk.gray('No pending approvals.')}`)
      return
    }

    this.log('')
    for (const a of approvals) {
      this.log(`${chalk.yellow('⊙')} ${chalk.bold(a.id)}`)
      this.log(`  Agent:     ${a.agent_id}`)
      if (a.tool_name) this.log(`  Tool:      ${a.tool_name}`)
      this.log(`  Prompt:    ${a.prompt}`)
      this.log(`  Requested: ${new Date(a.requested_at).toLocaleString()}`)
      this.log('')
    }
  }
}
