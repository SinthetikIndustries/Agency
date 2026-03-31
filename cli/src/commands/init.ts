// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { access } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { configPath, readConfig, writeConfig } from '../lib/config.js'
import { randomUUID } from 'node:crypto'
import { PORTS } from '../lib/ports.js'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

function buildDefaultConfig(profile: string, gatewayDir: string): Record<string, unknown> {
  return {
    profile,
    gateway: {
      port: PORTS.GATEWAY,
      host: '127.0.0.1',
      logLevel: 'info',
      auth: {
        jwtSecret: randomUUID() + randomUUID(),
        jwtExpiryHours: 24,
      },
      rateLimit: { max: 100, timeWindow: '1 minute' },
    },
    modelRouter: {
      defaultModel: 'claude-sonnet-4-6',
      tiers: { cheap: 'claude-haiku-4-5', strong: 'claude-sonnet-4-6' },
      providers: {
        anthropic: { enabled: true },
        openai: { enabled: false },
        ollama: { enabled: false, endpoint: `http://localhost:${PORTS.OLLAMA}` },
      },
      fallback: { cheap: null, strong: 'claude-sonnet-4-6' },
      embedding: { provider: 'openai', model: 'text-embedding-3-small' },
    },
    daemons: {
      orchestrator: { enabled: true },
      modelRouter: { enabled: true },
      vaultSync: { enabled: false },
    },
    orchestrator: {
      defaultAgent: 'main',
      maxWorkflowSteps: 20,
      approvalTimeoutSeconds: 300,
    },
    redis: { url: `redis://localhost:${PORTS.REDIS}` },
    gatewayDir,
  }
}

export default class Init extends Command {
  static summary = 'Re-initialize AgencyCLI config'

  async run(): Promise<void> {
    await this.parse(Init)

    const exists = await fileExists(configPath)
    if (!exists) {
      this.log(chalk.yellow('No config found. Run `agency install` instead.'))
      return
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      const answer = await prompt(
        rl,
        chalk.yellow('This will reset your config to defaults. Continue? (y/N): '),
      )

      if (answer.toLowerCase() !== 'y') {
        this.log('Cancelled.')
        return
      }
    } finally {
      rl.close()
    }

    // Read existing config to preserve gatewayDir and profile
    const existing = await readConfig()
    const gatewayDir = (existing.gatewayDir as string | undefined) ?? ''
    const profile = (existing.profile as string | undefined) ?? 'basic'

    const newConfig = buildDefaultConfig(profile, gatewayDir)
    await writeConfig(newConfig)

    this.log(chalk.green('Config reset. Run `agency start` to restart the gateway.'))
  }
}
