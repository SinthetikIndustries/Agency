// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { createInterface } from 'node:readline'
import { gatewayFetch, loadGatewayConnection } from '../lib/gateway.js'

export default class Chat extends Command {
  static summary = 'Open a streaming chat session with the main agent via the Gateway'

  static flags = {
    agent: Flags.string({
      char: 'a',
      description: 'Agent slug to chat with',
      default: 'main',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Chat)

    // Check gateway reachability
    try {
      const health = await gatewayFetch<{ status: string }>('/health')
      if (health.status !== 'ok' && health.status !== 'degraded') {
        this.error('Gateway is not healthy. Run `agency start` first.')
      }
    } catch {
      this.error(
        'Cannot connect to the Gateway. Run `agency start` to start it first.'
      )
    }

    // Create session
    const { session } = await gatewayFetch<{ session: { id: string } }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ agentSlug: flags.agent, client: 'cli' }),
    })

    const { url, apiKey } = await loadGatewayConnection()
    const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://')

    this.log(`${chalk.cyan('Agency')} ${chalk.gray('›')} Connected to ${chalk.bold(flags.agent)} agent.`)
    this.log(`${chalk.gray('Type a message and press Enter. Press Ctrl+C to exit.')}\n`)

    // WebSocket connection
    const { WebSocket } = await import('ws')
    const ws = new WebSocket(`${wsUrl}/sessions/${session.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    let wsReady = false
    const messageQueue: string[] = []

    ws.on('open', () => {
      wsReady = true
      for (const msg of messageQueue) {
        ws.send(msg)
      }
      messageQueue.length = 0
    })

    ws.on('message', (raw: Buffer) => {
      let chunk: { type: string; text?: string; toolName?: string; toolInput?: unknown; success?: boolean; error?: string }
      try { chunk = JSON.parse(raw.toString()) as typeof chunk } catch { return }

      if (chunk.type === 'text' && chunk.text) {
        process.stdout.write(chalk.white(chunk.text))
      } else if (chunk.type === 'tool_call') {
        process.stdout.write(`\n${chalk.gray(`[tool: ${chunk.toolName}]`)} `)
      } else if (chunk.type === 'done') {
        process.stdout.write('\n')
        process.stdout.write(`\n${chalk.cyan('You:')} `)
      } else if (chunk.type === 'error') {
        this.log(`\n${chalk.red('Error:')} ${chunk.error}`)
        process.stdout.write(`\n${chalk.cyan('You:')} `)
      }
    })

    ws.on('error', (err: Error) => {
      this.error(`WebSocket error: ${err.message}`)
    })

    ws.on('close', () => {
      this.log('\n\nSession ended.')
      process.exit(0)
    })

    // Readline input loop
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    process.stdout.write(`${chalk.cyan('You:')} `)

    rl.on('line', (line: string) => {
      const content = line.trim()
      if (!content) {
        process.stdout.write(`${chalk.cyan('You:')} `)
        return
      }

      const msg = JSON.stringify({ content })
      if (wsReady) {
        ws.send(msg)
      } else {
        messageQueue.push(msg)
      }
    })

    rl.on('close', () => {
      ws.close()
    })

    // Wait for process exit
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        rl.close()
        ws.close()
        resolve()
      })
    })
  }
}
