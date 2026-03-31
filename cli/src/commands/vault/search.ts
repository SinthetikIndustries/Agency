// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface VaultResult {
  id: string
  relative_path: string
  title: string
  type: string
  snippet: string
}

export default class VaultSearch extends Command {
  static summary = 'Full-text search across vault documents'

  static args = {
    query: Args.string({ description: 'Search query', required: true }),
  }

  static flags = {
    limit: Flags.integer({ char: 'n', summary: 'Max results', default: 10 }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(VaultSearch)
    let results: VaultResult[]
    try {
      const qs = new URLSearchParams({ q: args.query, limit: String(flags.limit) })
      const res = await gatewayFetch<{ results: VaultResult[]; count: number }>(`/vault/search?${qs}`)
      results = res.results
    } catch (err) {
      this.error(String(err))
    }

    if (results.length === 0) {
      this.log(chalk.gray(`No results for "${args.query}".`))
      return
    }

    this.log('')
    for (const r of results) {
      this.log(`${chalk.cyan(r.title)} ${chalk.gray(`[${r.type}]`)}`)
      this.log(`  ${chalk.gray(r.relative_path)}`)
      this.log(`  ${r.snippet.replace(/\n/g, ' ').slice(0, 200)}`)
      this.log('')
    }
  }
}
