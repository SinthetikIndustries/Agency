// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface Session {
  id: string
  agentId: string
  client: string
  status: string
  name?: string
  pinned?: boolean
  createdAt: string
  updatedAt: string
}

export default class SessionsInfo extends Command {
  static summary = 'Show metadata for a session'

  static args = {
    id: Args.string({ description: 'Session ID', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SessionsInfo)
    let session: Session
    try {
      const res = await gatewayFetch<{ session: Session }>(`/sessions/${args.id}/info`)
      session = res.session
    } catch (err) {
      this.error(String(err))
    }

    this.log('')
    this.log(`  ${chalk.bold('ID:')}        ${chalk.cyan(session.id)}`)
    this.log(`  ${chalk.bold('Agent:')}     ${session.agentId}`)
    this.log(`  ${chalk.bold('Client:')}    ${session.client}`)
    this.log(`  ${chalk.bold('Status:')}    ${session.status === 'active' ? chalk.green(session.status) : chalk.gray(session.status)}`)
    if (session.name) this.log(`  ${chalk.bold('Name:')}      ${session.name}`)
    if (session.pinned) this.log(`  ${chalk.bold('Pinned:')}    ${chalk.yellow('yes')}`)
    this.log(`  ${chalk.bold('Created:')}   ${new Date(session.createdAt).toLocaleString()}`)
    this.log(`  ${chalk.bold('Updated:')}   ${new Date(session.updatedAt).toLocaleString()}`)
    this.log('')
  }
}
