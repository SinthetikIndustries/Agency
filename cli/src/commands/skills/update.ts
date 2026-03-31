// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface UpdateResponse {
  ok: boolean
  updated: Array<{ name: string; version: string; status: string }>
  skill?: { name: string; version: string; status: string }
}

export default class SkillsUpdate extends Command {
  static summary = 'Update all installed skills (or a specific one)'

  static args = {
    name: Args.string({ description: 'Skill name to update (omit to update all)', required: false }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(SkillsUpdate)

    if (args.name) {
      this.log(`${chalk.cyan('›')} Updating skill ${chalk.bold(args.name)}...`)
      try {
        const res = await gatewayFetch<UpdateResponse>(`/skills/${encodeURIComponent(args.name)}/update`, {
          method: 'POST',
        })
        const skill = res.skill!
        this.log(chalk.green('✓') + ` ${chalk.bold(skill.name)}@${chalk.cyan(skill.version)} — ${skill.status}`)
        if (skill.status === 'pending_restart') {
          this.log(chalk.gray('  Run `agency restart` to apply the update.'))
        }
      } catch (err) {
        this.error(String(err))
      }
    } else {
      this.log(`${chalk.cyan('›')} Updating all installed skills...`)
      try {
        const res = await gatewayFetch<UpdateResponse>('/skills/update', { method: 'POST' })
        if (res.updated.length === 0) {
          this.log(chalk.gray('All skills are already up to date.'))
          return
        }
        for (const skill of res.updated) {
          this.log(`  ${chalk.green('✓')} ${chalk.bold(skill.name)}@${chalk.cyan(skill.version)} — ${skill.status}`)
        }
        this.log(chalk.gray('\n  Run `agency restart` to apply pending updates.'))
      } catch (err) {
        this.error(String(err))
      }
    }
  }
}
