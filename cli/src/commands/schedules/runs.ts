// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface Run {
  id: string; status: string; error?: string
  startedAt: string; finishedAt?: string; sessionId: string | null
}

export default class SchedulesRuns extends Command {
  static summary = 'Show run history for a scheduled task'
  static args = { id: Args.string({ required: true }) }
  static flags = { limit: Flags.integer({ char: 'n', default: 20 }) }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SchedulesRuns)
    let runs: Run[]
    try {
      const res = await gatewayFetch<{ runs: Run[] }>(`/schedules/${args.id}/runs?limit=${flags.limit}`)
      runs = res.runs
    } catch (err) { this.error(String(err)) }

    if (runs.length === 0) { this.log(chalk.gray('No runs yet.')); return }

    this.log('')
    for (const r of runs) {
      const color = r.status === 'completed' ? chalk.green : r.status === 'failed' ? chalk.red : chalk.yellow
      const dur = r.finishedAt
        ? `${Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`
        : 'running'
      this.log(`  ${color('●')} ${color(r.status.padEnd(10))} ${chalk.gray(new Date(r.startedAt).toLocaleString())}  ${chalk.gray(dur)}`)
      if (r.error) this.log(`    ${chalk.red(r.error)}`)
      if (r.sessionId) this.log(`    session: ${chalk.cyan(r.sessionId.slice(0, 8))}`)
    }
    this.log('')
  }
}
