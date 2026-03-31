// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface InstalledSkill {
  id: string
  name: string
  version: string
  status: string
  manifest: { description?: string }
}

interface AvailableSkill {
  name: string
  description: string
  latest: string
  installed: boolean
}

interface InstalledResponse {
  skills: InstalledSkill[]
  total: number
}

interface AvailableResponse {
  skills: AvailableSkill[]
  total: number
}

export default class SkillsList extends Command {
  static summary = 'List skills (installed by default, --available for registry)'

  static flags = {
    available: Flags.boolean({
      char: 'a',
      summary: 'List skills available in the remote registry',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillsList)

    if (flags.available) {
      await this.listAvailable()
    } else {
      await this.listInstalled()
    }
  }

  private async listInstalled(): Promise<void> {
    let result: InstalledResponse
    try {
      result = await gatewayFetch<InstalledResponse>('/skills')
    } catch (err) {
      this.error(String(err))
    }

    if (result.skills.length === 0) {
      this.log(chalk.gray('No skills installed. Run `agency skills list --available` to browse the registry.'))
      return
    }

    this.log('')
    this.log(chalk.bold('  NAME'.padEnd(32)) + chalk.bold('VERSION'.padEnd(12)) + chalk.bold('STATUS'.padEnd(18)) + chalk.bold('DESCRIPTION'))
    this.log('  ' + '─'.repeat(72))

    for (const skill of result.skills) {
      const name = chalk.cyan(skill.name.padEnd(30))
      const version = chalk.gray((skill.version).padEnd(10))
      const statusColor =
        skill.status === 'installed' ? chalk.green :
        skill.status === 'pending_restart' ? chalk.yellow :
        skill.status === 'error' ? chalk.red :
        chalk.gray
      const status = statusColor(skill.status.padEnd(16))
      const desc = skill.manifest?.description ?? ''
      this.log(`  ${name} ${version} ${status} ${desc}`)
    }
    this.log('')
  }

  private async listAvailable(): Promise<void> {
    this.log(`${chalk.cyan('›')} Fetching registry...`)

    let result: AvailableResponse
    try {
      result = await gatewayFetch<AvailableResponse>('/skills/available')
    } catch (err) {
      this.error(String(err))
    }

    if (result.skills.length === 0) {
      this.log(chalk.gray('No skills found in registry.'))
      return
    }

    this.log('')
    this.log(chalk.bold('  NAME'.padEnd(32)) + chalk.bold('LATEST'.padEnd(12)) + chalk.bold('INSTALLED'.padEnd(12)) + chalk.bold('DESCRIPTION'))
    this.log('  ' + '─'.repeat(72))

    for (const skill of result.skills) {
      const name = chalk.cyan(skill.name.padEnd(30))
      const version = chalk.gray((skill.latest).padEnd(10))
      const installed = skill.installed ? chalk.green('yes'.padEnd(10)) : chalk.gray('no'.padEnd(10))
      this.log(`  ${name} ${version} ${installed}   ${skill.description}`)
    }
    this.log('')
  }
}
