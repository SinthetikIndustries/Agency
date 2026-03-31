// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface LinkedDoc { id: string; relative_path: string; title: string; link_text: string }

export default class VaultRelated extends Command {
  static summary = 'Show documents linked to/from a vault document'

  static args = {
    slug: Args.string({ description: 'Document slug or partial path', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(VaultRelated)
    let res: { outbound: LinkedDoc[]; inbound: LinkedDoc[] }
    try {
      res = await gatewayFetch(`/vault/related/${encodeURIComponent(args.slug)}`)
    } catch (err) {
      this.error(String(err))
    }

    const printSection = (title: string, docs: LinkedDoc[]) => {
      this.log(chalk.bold(title))
      if (docs.length === 0) {
        this.log(chalk.gray('  None'))
      } else {
        for (const d of docs) {
          this.log(`  ${chalk.cyan(d.title)} ${chalk.gray(d.relative_path)}`)
          if (d.link_text) this.log(`    ${chalk.gray('→')} "${d.link_text}"`)
        }
      }
      this.log('')
    }

    this.log('')
    printSection('Links from this document:', res.outbound)
    printSection('Links to this document:', res.inbound)
  }
}
