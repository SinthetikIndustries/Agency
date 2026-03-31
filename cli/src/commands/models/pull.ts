// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { loadGatewayConnection } from '../../lib/gateway.js'

export default class ModelsPull extends Command {
  static summary = 'Pull an Ollama model (streams progress)'

  static args = {
    model: Args.string({ description: 'Model name, e.g. qwen3:8b', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ModelsPull)
    const { url, apiKey } = await loadGatewayConnection()

    this.log(`Pulling ${chalk.cyan(args.model)}…`)

    let res: Response
    try {
      res = await fetch(`${url}/models/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: args.model }),
      })
    } catch (err) {
      this.error(`Cannot connect to Gateway: ${String(err)}`)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      this.error(`Gateway ${res.status}: ${body}`)
    }

    const reader = res.body?.getReader()
    if (!reader) { this.log('No response stream.'); return }

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
          if (obj.error) { this.error(obj.error) }
          const pct = obj.total ? ` (${Math.round((obj.completed ?? 0) / obj.total * 100)}%)` : ''
          process.stdout.write(`\r  ${obj.status ?? ''}${pct}    `)
        } catch { /* partial line */ }
      }
    }
    process.stdout.write('\n')
    this.log(`${chalk.green('✓')} ${args.model} pulled successfully.`)
  }
}
