// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { createConnection } from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readConfig, readCredentials, agencyDir, configPath, credentialsPath } from '../lib/config.js'
import { getGatewayStatus } from '../lib/process.js'
import { PORTS } from '../lib/ports.js'

interface CheckResult {
  label: string
  passed: boolean
  detail?: string
  warning?: boolean  // yellow advisory — not a hard failure
}

function pass(label: string, detail?: string): CheckResult {
  return { label, passed: true, detail }
}

function fail(label: string, detail?: string): CheckResult {
  return { label, passed: false, detail }
}

function warn(label: string, detail?: string): CheckResult {
  return { label, passed: false, detail, warning: true }
}

function pingTcp(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, timeoutMs)
    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

function parseHostPort(url: string, defaultPort: number): { host: string; port: number } | null {
  try {
    const u = new URL(url)
    return { host: u.hostname || 'localhost', port: parseInt(u.port || String(defaultPort), 10) }
  } catch {
    return null
  }
}

export default class Doctor extends Command {
  static summary = 'Diagnose environment and service health'

  async run(): Promise<void> {
    await this.parse(Doctor)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Running diagnostics...')
    this.log('')

    const checks: CheckResult[] = []

    // ── 1. Node.js version ────────────────────────────────────────────────────
    const nodeMajor = parseInt(process.versions.node.split('.')[0]!, 10)
    checks.push(
      nodeMajor >= 22
        ? pass(`Node.js ${process.versions.node} (>= 22 required)`)
        : fail('Node.js version >= 22', `Currently ${process.versions.node} — please upgrade`)
    )

    // ── 2. Config and credentials files ───────────────────────────────────────
    checks.push(existsSync(configPath) ? pass('config.json exists') : fail('config.json exists', `Not found at ${configPath} — run \`agency install\``))
    checks.push(existsSync(credentialsPath) ? pass('credentials.json exists') : fail('credentials.json exists', `Not found at ${credentialsPath} — run \`agency install\``))

    // Load config and credentials for remaining checks
    const config = await readConfig()
    const credentials = await readCredentials()

    // ── 3. At least one LLM provider configured ───────────────────────────────
    const providers = (config.modelRouter as Record<string, unknown> | undefined)?.providers as Record<string, { enabled?: boolean }> | undefined
    const anthropicKey = ((credentials.anthropic ?? {}) as Record<string, unknown>).apiKey as string | undefined
    const openaiKey = ((credentials.openai ?? {}) as Record<string, unknown>).apiKey as string | undefined
    const openrouterKey = ((credentials.openrouter ?? {}) as Record<string, unknown>).apiKey as string | undefined
    const ollamaEnabled = providers?.ollama?.enabled === true
    const openrouterEnabled = providers?.openrouter?.enabled === true

    const hasProvider = !!(anthropicKey || openaiKey || (openrouterKey && openrouterEnabled) || ollamaEnabled)
    if (hasProvider) {
      const active: string[] = []
      if (anthropicKey) active.push('Anthropic')
      if (openaiKey) active.push('OpenAI')
      if (openrouterKey && openrouterEnabled) active.push('OpenRouter')
      if (ollamaEnabled) active.push('Ollama')
      checks.push(pass(`LLM provider configured (${active.join(', ')})`))
    } else {
      checks.push(fail('At least one LLM provider configured', 'Add an API key in ~/.agency/credentials.json or enable Ollama in config'))
    }

    // ── 4. Ollama reachability (if enabled) ───────────────────────────────────
    if (ollamaEnabled) {
      const endpoint = (providers?.ollama as Record<string, unknown> | undefined)?.endpoint as string | undefined ?? `http://localhost:${PORTS.OLLAMA}`
      const parsed = parseHostPort(endpoint, PORTS.OLLAMA)
      if (parsed) {
        const reachable = await pingTcp(parsed.host, parsed.port)
        checks.push(reachable
          ? pass(`Ollama reachable at ${endpoint}`)
          : fail('Ollama reachable', `Cannot connect to ${endpoint} — is Ollama running?`)
        )
      }
    }

    // ── 5. Postgres configured and reachable ──────────────────────────────────
    const postgresUrl = ((credentials.postgres ?? {}) as Record<string, unknown>).url as string | undefined
    if (postgresUrl) {
      checks.push(pass('Postgres URL configured'))
      const parsed = parseHostPort(postgresUrl, PORTS.POSTGRES)
      if (parsed) {
        const reachable = await pingTcp(parsed.host, parsed.port)
        checks.push(reachable
          ? pass(`Postgres reachable at ${parsed.host}:${parsed.port}`)
          : fail('Postgres reachable', `Cannot connect to ${parsed.host}:${parsed.port} — is Postgres running?`)
        )
      }
    } else {
      checks.push(fail('Postgres URL configured', 'Set credentials.postgres.url in ~/.agency/credentials.json'))
    }

    // ── 6. Redis configured and reachable ─────────────────────────────────────
    const redisConfig = (config.redis as Record<string, unknown> | undefined)?.url as string | undefined
    const redisUrl = ((credentials.redis ?? {}) as Record<string, unknown>).url as string | undefined ?? redisConfig
    if (redisUrl) {
      checks.push(pass('Redis URL configured'))
      const parsed = parseHostPort(redisUrl, PORTS.REDIS)
      if (parsed) {
        const reachable = await pingTcp(parsed.host, parsed.port)
        checks.push(reachable
          ? pass(`Redis reachable at ${parsed.host}:${parsed.port}`)
          : fail('Redis reachable', `Cannot connect to ${parsed.host}:${parsed.port} — is Redis running?`)
        )
      }
    } else {
      checks.push(warn('Redis not configured', 'Required for messaging and queues — set redis.url in config.json'))
    }

    // ── 8. Gateway binary ─────────────────────────────────────────────────────
    const gatewayDir = config.gatewayDir as string | undefined
    if (gatewayDir) {
      checks.push(pass('Gateway directory configured', gatewayDir))
      const distEntry = join(gatewayDir, 'dist', 'index.js')
      checks.push(existsSync(distEntry)
        ? pass('Gateway dist/index.js built')
        : fail('Gateway dist/index.js built', `Not found at ${distEntry} — run \`pnpm run build\` in ${gatewayDir}`)
      )
    } else {
      checks.push(fail('Gateway directory configured', 'Run `agency install` to set gatewayDir'))
      checks.push(fail('Gateway dist/index.js built', 'Gateway directory not configured'))
    }

    // ── 9. Gateway running and healthy ────────────────────────────────────────
    const status = await getGatewayStatus()
    if (status.running && status.health) {
      const svcStatus = status.health.status
      checks.push(svcStatus === 'ok'
        ? pass(`Gateway running and healthy (PID ${status.pid}, v${status.health.version}, up ${formatUptime(status.health.uptime)})`)
        : fail('Gateway healthy', `Running (PID ${status.pid}) but status is '${svcStatus}'`)
      )

      // Per-service breakdown
      const svc = status.health.services
      for (const [name, s] of Object.entries(svc)) {
        const label = `  Service: ${name}`
        if (s === 'ok') checks.push(pass(label))
        else if (s === 'disabled') checks.push(warn(label, 'disabled'))
        else checks.push(fail(label, `status: ${s}`))
      }
    } else if (status.running) {
      checks.push(fail('Gateway running and healthy', `Running (PID ${status.pid}) but health endpoint unreachable`))
    } else {
      checks.push(fail('Gateway running', 'Not running — use `agency start`'))
    }

    // ── Print results ─────────────────────────────────────────────────────────
    this.log('')
    let failCount = 0
    let warnCount = 0
    for (const check of checks) {
      if (check.passed) {
        this.log('  ' + chalk.green('✓') + ' ' + chalk.white(check.label))
        if (check.detail) this.log('    ' + chalk.gray(check.detail))
      } else if (check.warning) {
        warnCount++
        this.log('  ' + chalk.yellow('⚠') + ' ' + chalk.white(check.label))
        if (check.detail) this.log('    ' + chalk.gray(check.detail))
      } else {
        failCount++
        this.log('  ' + chalk.red('✗') + ' ' + chalk.white(check.label))
        if (check.detail) this.log('    ' + chalk.gray(check.detail))
      }
    }

    this.log('')

    if (failCount === 0 && warnCount === 0) {
      this.log(chalk.green('✓ All checks passed'))
    } else {
      if (failCount > 0) this.log(chalk.red(`✗ ${failCount} check${failCount === 1 ? '' : 's'} failed`))
      if (warnCount > 0) this.log(chalk.yellow(`⚠ ${warnCount} warning${warnCount === 1 ? '' : 's'}`))
      if (failCount > 0) this.log(chalk.gray('  Run `agency repair` to attempt fixes, or `agency install` to reconfigure.'))
    }
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}
