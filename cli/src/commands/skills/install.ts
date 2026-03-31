// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface InstallResponse {
  ok: boolean
  skill: {
    name: string
    version: string
    status: string
  }
}

export default class SkillsInstall extends Command {
  static summary = 'Install a skill from the registry or a local path'

  static args = {
    name: Args.string({ description: 'Skill name to install', required: true }),
  }

  static flags = {
    local: Flags.string({
      summary: 'Install from a local directory path (dev mode)',
      helpValue: '<path>',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SkillsInstall)

    this.log(`${chalk.cyan('›')} Installing skill ${chalk.bold(args.name)}...`)

    let result: InstallResponse
    try {
      const body: Record<string, string> = { name: args.name }
      if (flags.local) body['localPath'] = flags.local
      result = await gatewayFetch<InstallResponse>('/skills/install', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    } catch (err) {
      this.error(String(err))
    }

    this.log(chalk.green('✓') + ` Skill ${chalk.bold(result.skill.name)}@${chalk.cyan(result.skill.version)} installed`)
  }
}
