// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { createInterface } from 'node:readline'
import { gatewayFetch } from '../../../lib/gateway.js'

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

interface Profile {
  id: string
  slug: string
  name: string
}

export default class AgentsProfileCreate extends Command {
  static summary = 'Create a custom agent profile'

  static flags = {
    name: Flags.string({ description: 'Profile display name' }),
    slug: Flags.string({ description: 'Profile slug (kebab-case, unique)' }),
    description: Flags.string({ description: 'Short description' }),
    'system-prompt': Flags.string({ description: 'System prompt text' }),
    'model-tier': Flags.string({
      description: 'Model tier: strong or cheap',
      options: ['strong', 'cheap'],
      default: 'strong',
    }),
    tools: Flags.string({
      description: 'Comma-separated list of allowed tools',
      default: 'file_read,file_write,file_list,http_get',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AgentsProfileCreate)

    const rl = createInterface({ input: process.stdin, output: process.stdout })

    let name = flags.name ?? ''
    let slug = flags.slug ?? ''
    let description = flags.description ?? ''
    let systemPrompt = flags['system-prompt'] ?? ''
    const modelTier = flags['model-tier'] ?? 'strong'
    const allowedTools = (flags.tools ?? '').split(',').map(t => t.trim()).filter(Boolean)

    try {
      if (!name) name = await prompt(rl, 'Profile name: ')
      if (!slug) slug = await prompt(rl, 'Slug (kebab-case): ')
      if (!description) description = await prompt(rl, 'Description: ')
      if (!systemPrompt) {
        this.log('System prompt (end with a line containing only "."): ')
        const lines: string[] = []
        while (true) {
          const line = await prompt(rl, '')
          if (line === '.') break
          lines.push(line)
        }
        systemPrompt = lines.join('\n')
      }
    } finally {
      rl.close()
    }

    if (!name || !slug || !systemPrompt) {
      this.error('name, slug, and system-prompt are required')
    }

    let profile: Profile
    try {
      const res = await gatewayFetch<{ ok: boolean; profile: Profile }>('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, description, systemPrompt, modelTier, allowedTools }),
      })
      profile = res.profile
    } catch (err) {
      this.error(`Failed to create profile: ${String(err)}`)
    }

    this.log('')
    this.log(chalk.green('✓') + ` Profile created: ${chalk.cyan(profile.slug)} (${profile.id.slice(0, 8)})`)
    this.log(`  ${chalk.gray('Attach it to an agent with:')} agency agents profile attach <agent> ${profile.slug}`)
  }
}
