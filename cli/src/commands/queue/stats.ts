// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface QueueStat {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
}

export default class QueueStats extends Command {
  static summary = 'Show queue statistics'

  async run(): Promise<void> {
    let queues: QueueStat[]
    try {
      const res = await gatewayFetch<{ queues: QueueStat[] }>('/queue/stats')
      queues = res.queues
    } catch (err) {
      this.error(String(err))
    }

    if (queues.length === 0) {
      this.log(chalk.gray('No queue data (Redis may not be configured).'))
      return
    }

    this.log('')
    this.log(
      chalk.bold('  QUEUE'.padEnd(26)) +
      chalk.bold('WAITING'.padEnd(10)) +
      chalk.bold('ACTIVE'.padEnd(10)) +
      chalk.bold('DONE'.padEnd(10)) +
      chalk.bold('FAILED')
    )
    this.log('  ' + '─'.repeat(62))
    for (const q of queues) {
      this.log(
        `  ${chalk.cyan(q.name.padEnd(24))} ` +
        `${String(q.waiting).padEnd(10)}` +
        `${String(q.active).padEnd(10)}` +
        `${chalk.green(String(q.completed)).padEnd(10)}` +
        `${q.failed > 0 ? chalk.red(String(q.failed)) : chalk.gray('0')}`
      )
    }
    this.log('')
  }
}
