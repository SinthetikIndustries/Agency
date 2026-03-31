// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../../lib/gateway.js'

interface FileEntry {
  name: string
  type: 'file' | 'dir'
  size: number | null
  modifiedAt: string | null
}

export default class AgentsWorkspace extends Command {
  static summary = 'Browse an agent workspace directory'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
  }

  static flags = {
    path: Flags.string({ char: 'p', summary: 'Sub-path within workspace', default: '' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentsWorkspace)
    const qs = flags.path ? `?path=${encodeURIComponent(flags.path)}` : ''
    let result: { workspacePath: string; files: FileEntry[] }
    try {
      result = await gatewayFetch(`/agents/${args.slug}/workspace${qs}`)
    } catch (err) {
      this.error(String(err))
    }

    this.log('')
    this.log(`${chalk.bold('Workspace:')} ${chalk.gray(result.workspacePath)}`)
    this.log('')
    this.log(chalk.bold('  NAME'.padEnd(36)) + chalk.bold('TYPE'.padEnd(8)) + chalk.bold('SIZE'.padEnd(10)) + chalk.bold('MODIFIED'))
    this.log('  ' + '─'.repeat(70))

    for (const f of result.files) {
      const icon = f.type === 'dir' ? chalk.blue('d') : chalk.gray('f')
      const size = f.size != null ? String(f.size).padEnd(10) : '—'.padEnd(10)
      const modified = f.modifiedAt ? new Date(f.modifiedAt).toLocaleString() : '—'
      this.log(`  ${icon} ${f.name.padEnd(34)} ${f.type.padEnd(6)} ${size} ${chalk.gray(modified)}`)
    }
    this.log('')
  }
}
