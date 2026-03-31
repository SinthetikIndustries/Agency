// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface Task {
  id: string; agentSlug: string; label: string; schedule: string
  humanReadableSchedule: string; type: string; enabled: boolean
  lastRunAt?: string; nextRunAt?: string
}

export default class SchedulesList extends Command {
  static summary = 'List scheduled tasks'
  static flags = {
    agent: Flags.string({ char: 'a', summary: 'Filter by agent slug' }),
    limit: Flags.integer({ char: 'n', default: 50 }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SchedulesList)
    const qs = new URLSearchParams()
    if (flags.agent) qs.set('agentSlug', flags.agent)
    qs.set('limit', String(flags.limit))

    let tasks: Task[]
    try {
      const res = await gatewayFetch<{ tasks: Task[] }>(`/schedules?${qs}`)
      tasks = res.tasks
    } catch (err) { this.error(String(err)) }

    if (tasks.length === 0) { this.log(chalk.gray('No scheduled tasks.')); return }

    const byAgent = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!byAgent.has(t.agentSlug)) byAgent.set(t.agentSlug, [])
      byAgent.get(t.agentSlug)!.push(t)
    }

    this.log('')
    for (const [slug, agentTasks] of byAgent) {
      this.log(chalk.bold(slug))
      for (const t of agentTasks) {
        const status = t.enabled ? chalk.green('●') : chalk.gray('○')
        this.log(`  ${status} ${chalk.cyan(t.label.padEnd(24))} ${chalk.gray(t.humanReadableSchedule)}`)
        this.log(`    ${chalk.gray('ID:')} ${t.id.slice(0, 8)}…  ${chalk.gray('Type:')} ${t.type}`)
        if (t.nextRunAt) this.log(`    ${chalk.gray('Next:')} ${new Date(t.nextRunAt).toLocaleString()}`)
      }
      this.log('')
    }
  }
}
