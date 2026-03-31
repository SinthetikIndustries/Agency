// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../../lib/gateway.js'
import { readFile } from 'node:fs/promises'

export default class AgentsWorkspaceSet extends Command {
  static summary = 'Write a context file in an agent workspace (identity.md, soul.md, user.md)'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
    path: Args.string({ description: 'File path: identity.md | soul.md | user.md', required: true }),
  }

  static flags = {
    file: Flags.string({ char: 'f', summary: 'Read content from a local file path' }),
    content: Flags.string({ char: 'c', summary: 'Content string to write' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentsWorkspaceSet)

    let content: string
    if (flags.file) {
      content = await readFile(flags.file, 'utf8')
    } else if (flags.content) {
      content = flags.content
    } else {
      this.error('Provide --file or --content')
    }

    try {
      await gatewayFetch(`/agents/${args.slug}/workspace/file?path=${encodeURIComponent(args.path)}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      })
      this.log(`${chalk.green('✓')} Wrote ${chalk.cyan(args.path)} for agent ${chalk.cyan(args.slug)}.`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
