// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface Worker { name: string; status: string; pid: number | null; startedAt: string | null; restartCount: number }

export default class QueueWorkers extends Command {
  static summary = 'List active queue workers'

  async run(): Promise<void> {
    let workers: Worker[]
    try {
      const res = await gatewayFetch<{ workers: Worker[] }>('/queue/workers')
      workers = res.workers
    } catch (err) {
      this.error(String(err))
    }

    if (workers.length === 0) {
      this.log(chalk.gray('No workers running (Redis may not be configured).'))
      return
    }

    this.log('')
    this.log(chalk.bold('  WORKER'.padEnd(28)) + chalk.bold('STATUS'.padEnd(12)) + chalk.bold('PID'.padEnd(10)) + chalk.bold('RESTARTS'))
    this.log('  ' + '─'.repeat(58))
    for (const w of workers) {
      const pid = w.pid != null ? String(w.pid) : '—'
      this.log(
        `  ${chalk.cyan(w.name.padEnd(26))} ` +
        `${chalk.green(w.status).padEnd(12)}` +
        `${pid.padEnd(10)}` +
        `${w.restartCount > 0 ? chalk.yellow(String(w.restartCount)) : chalk.gray('0')}`
      )
    }
    this.log('')
  }
}
