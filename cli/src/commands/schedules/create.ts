// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class SchedulesCreate extends Command {
  static summary = 'Create a scheduled task'
  static flags = {
    agent:    Flags.string({ summary: 'Agent slug', required: true }),
    label:    Flags.string({ summary: 'Short label for the task', required: true }),
    prompt:   Flags.string({ summary: 'Prompt sent to the agent', required: true }),
    schedule: Flags.string({ summary: 'Cron expression or natural language schedule', required: true }),
    type:     Flags.string({ summary: 'recurring or once', default: 'recurring', options: ['recurring', 'once'] }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SchedulesCreate)
    try {
      const res = await gatewayFetch<{ task: { id: string; humanReadableSchedule: string } }>(
        '/schedules', {
          method: 'POST',
          body: JSON.stringify({ agentSlug: flags.agent, label: flags.label, prompt: flags.prompt, schedule: flags.schedule, type: flags.type }),
        }
      )
      this.log(`${chalk.green('✓')} Created ${chalk.cyan(res.task.id.slice(0, 8))} — ${res.task.humanReadableSchedule}`)
    } catch (err) { this.error(String(err)) }
  }
}
