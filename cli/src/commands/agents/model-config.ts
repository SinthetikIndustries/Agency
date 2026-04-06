// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

const PROVIDERS = ['anthropic', 'openai', 'ollama', 'openrouter', 'ollamaCloud'] as const

export default class AgentsModelConfig extends Command {
  static summary = 'Set model routing config for an agent'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
  }

  static flags = {
    mode: Flags.string({
      char: 'm',
      summary: 'Routing mode: inherit | specific | auto_router',
      required: true,
      options: ['inherit', 'specific', 'auto_router'],
    }),
    model: Flags.string({ summary: 'Model ID (required when mode=specific)' }),
    provider: Flags.string({ summary: 'Provider (required when mode=specific): anthropic | openai | ollama' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentsModelConfig)

    const body: Record<string, unknown> = { mode: flags.mode }
    if (flags.mode === 'specific') {
      if (!flags.model || !flags.provider) {
        this.error('--model and --provider are required when mode=specific')
      }
      body.specific = { model: flags.model, provider: flags.provider }
    }

    try {
      const res = await gatewayFetch<{ ok: boolean; modelConfig: unknown }>(`/agents/${args.slug}/model-config`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      this.log(`${chalk.green('✓')} Model config updated for ${chalk.cyan(args.slug)}: ${JSON.stringify(res.modelConfig)}`)
    } catch (err) {
      this.error(String(err))
    }
  }
}
