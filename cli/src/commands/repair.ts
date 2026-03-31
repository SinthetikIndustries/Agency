// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { agencyDir, configPath, credentialsPath, readConfig, readCredentials } from '../lib/config.js'
import { startGateway, getGatewayStatus } from '../lib/process.js'
import { PORTS } from '../lib/ports.js'

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
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
  } catch { return null }
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())))
}

export default class Repair extends Command {
  static summary = 'Diagnose and repair the Agency installation'

  static flags = {
    check: Flags.boolean({
      description: 'Report issues without fixing them',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Repair)
    const checkOnly = flags.check

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + (checkOnly ? 'Checking for issues...' : 'Repairing...'))
    this.log('')

    const issues: string[] = []
    const fixed: string[] = []
    const warnings: string[] = []

    const ok = (msg: string) => this.log(chalk.green('  ✓') + ' ' + msg)
    const bad = (msg: string) => this.log(chalk.red('  ✗') + ' ' + msg)
    const advisory = (msg: string) => this.log(chalk.yellow('  ⚠') + ' ' + msg)

    // ── 1. ~/.agency/ directory ───────────────────────────────────────────────
    if (!(await fileExists(agencyDir))) {
      issues.push('~/.agency/ directory is missing')
      if (!checkOnly) {
        await mkdir(agencyDir, { recursive: true })
        fixed.push('Created ~/.agency/ directory')
        ok('Created ~/.agency/ directory')
      } else {
        bad('~/.agency/ directory is missing')
      }
    } else {
      ok('~/.agency/ directory exists')
    }

    // ── 2. config.json ────────────────────────────────────────────────────────
    if (!(await fileExists(configPath))) {
      issues.push('config.json is missing')
      bad('config.json missing — run `agency install` to recreate')
    } else {
      ok('config.json found')
    }

    // ── 3. credentials.json ───────────────────────────────────────────────────
    if (!(await fileExists(credentialsPath))) {
      issues.push('credentials.json is missing')
      bad('credentials.json missing — run `agency install` to recreate')
    } else {
      ok('credentials.json found')
    }

    // Load config/credentials for remaining checks
    const config = await readConfig()
    const credentials = await readCredentials()

    // ── 4. LLM provider check ─────────────────────────────────────────────────
    const providers = (config.modelRouter as Record<string, unknown> | undefined)?.providers as Record<string, { enabled?: boolean }> | undefined
    const hasApiKey = !!(
      ((credentials.anthropic ?? {}) as Record<string, unknown>).apiKey ||
      ((credentials.openai ?? {}) as Record<string, unknown>).apiKey ||
      ((credentials.openrouter ?? {}) as Record<string, unknown>).apiKey
    )
    const ollamaEnabled = providers?.ollama?.enabled === true
    if (!hasApiKey && !ollamaEnabled) {
      warnings.push('No LLM provider configured')
      advisory('No LLM provider configured — add an API key in ~/.agency/credentials.json or enable Ollama in config.json')
    } else {
      const active: string[] = []
      if (((credentials.anthropic ?? {}) as Record<string, unknown>).apiKey) active.push('Anthropic')
      if (((credentials.openai ?? {}) as Record<string, unknown>).apiKey) active.push('OpenAI')
      if (((credentials.openrouter ?? {}) as Record<string, unknown>).apiKey && providers?.openrouter?.enabled) active.push('OpenRouter')
      if (ollamaEnabled) active.push('Ollama')
      ok(`LLM provider(s): ${active.join(', ')}`)
    }

    // ── 5. Vault path ─────────────────────────────────────────────────────────
    const daemons = config.daemons as Record<string, unknown> | undefined
    const vaultSyncConfig = (daemons?.vaultSync ?? {}) as Record<string, unknown>
    const vaultEnabled = vaultSyncConfig.enabled !== false
    if (vaultEnabled) {
      const rawVaultPath = (vaultSyncConfig.vaultPath as string | undefined) ?? join(agencyDir, 'vault')
      const vaultPath = rawVaultPath.replace(/^~/, homedir())
      if (!(await fileExists(vaultPath))) {
        issues.push(`Vault path missing: ${vaultPath}`)
        if (!checkOnly) {
          await mkdir(vaultPath, { recursive: true })
          // Create the standard sub-directories
          for (const sub of ['canon', 'proposals', 'notes', 'templates']) {
            await mkdir(join(vaultPath, sub), { recursive: true })
          }
          fixed.push(`Created vault directory at ${vaultPath}`)
          ok(`Created vault directory at ${vaultPath}`)
        } else {
          bad(`Vault path missing: ${vaultPath} — run \`agency repair\` to create it`)
        }
      } else {
        ok(`Vault path exists (${vaultPath})`)
        // Ensure sub-dirs exist
        for (const sub of ['canon', 'proposals', 'notes', 'templates']) {
          const subPath = join(vaultPath, sub)
          if (!(await fileExists(subPath))) {
            if (!checkOnly) {
              await mkdir(subPath, { recursive: true })
              fixed.push(`Created vault/${sub}/`)
            } else {
              advisory(`Vault sub-directory missing: ${subPath}`)
            }
          }
        }
      }
    } else {
      ok('Vault sync disabled (skipped)')
    }

    // ── 6. Redis ──────────────────────────────────────────────────────────────
    const redisConfig = (config.redis as Record<string, unknown> | undefined)?.url as string | undefined
    const redisUrl = ((credentials.redis ?? {}) as Record<string, unknown>).url as string | undefined ?? redisConfig
    if (redisUrl) {
      const parsed = parseHostPort(redisUrl, PORTS.REDIS)
      if (parsed) {
        const reachable = await pingTcp(parsed.host, parsed.port)
        if (reachable) {
          ok(`Redis reachable at ${parsed.host}:${parsed.port}`)
        } else {
          issues.push('Redis not reachable')
          bad(`Redis not reachable at ${parsed.host}:${parsed.port} — is Redis running?`)
        }
      }
    } else {
      warnings.push('Redis not configured')
      advisory('Redis not configured — messaging and queues will be unavailable')
    }

    // ── 7. Gateway binary ─────────────────────────────────────────────────────
    const gatewayDir = config.gatewayDir as string | undefined
    let gatewayDirValid = false
    if (!gatewayDir) {
      issues.push('gatewayDir not set in config')
      bad('gatewayDir not configured — run `agency install` to set it')
    } else {
      const entryPoint = join(gatewayDir, 'dist', 'index.js')
      if (!(await fileExists(entryPoint))) {
        issues.push(`Gateway entry point not found: ${entryPoint}`)
        bad(`dist/index.js not found at ${gatewayDir}`)
        if (!checkOnly) {
          advisory('Run `pnpm run build` inside the gateway directory to rebuild')
        }
      } else {
        gatewayDirValid = true
        ok(`Gateway dist found at ${gatewayDir}`)
      }
    }

    // ── 8. Gateway running ────────────────────────────────────────────────────
    const status = await getGatewayStatus()
    if (!status.running) {
      issues.push('Gateway is not running')
      bad('Gateway is not running')

      if (!checkOnly && gatewayDirValid && gatewayDir) {
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        try {
          const answer = await prompt(rl, chalk.cyan('  Start the gateway now? (y/N): '))
          if (answer.toLowerCase() === 'y') {
            this.log(chalk.gray('  Starting gateway...'))
            try {
              await startGateway(gatewayDir)
              fixed.push('Started gateway')
              ok('Gateway started')
            } catch (err) {
              bad(`Failed to start gateway: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        } finally {
          rl.close()
        }
      }
    } else if (status.health) {
      const svcStatus = status.health.status
      if (svcStatus === 'ok') {
        ok(`Gateway running (PID ${status.pid}, status: ok, v${status.health.version})`)
      } else {
        advisory(`Gateway running (PID ${status.pid}) but status is '${svcStatus}'`)
      }

      // Per-service health
      for (const [name, s] of Object.entries(status.health.services)) {
        if (s === 'ok') ok(`  Service ${name}: ok`)
        else if (s === 'disabled') advisory(`  Service ${name}: disabled`)
        else { issues.push(`Service ${name} degraded`); bad(`  Service ${name}: ${s}`) }
      }
    } else {
      advisory(`Gateway running (PID ${status.pid}) but health check failed — may still be starting`)
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    this.log('')
    if (issues.length === 0 && warnings.length === 0) {
      this.log(chalk.green('No issues found.'))
      return
    }

    if (checkOnly) {
      if (issues.length > 0) {
        this.log(chalk.red(`Found ${issues.length} issue(s):`))
        for (const issue of issues) this.log(chalk.gray(`  - ${issue}`))
      }
      if (warnings.length > 0) {
        this.log(chalk.yellow(`${warnings.length} warning(s):`))
        for (const w of warnings) this.log(chalk.gray(`  - ${w}`))
      }
      this.log('')
      this.log(chalk.gray('Run `agency repair` (without --check) to attempt fixes.'))
    } else {
      if (fixed.length > 0) {
        this.log(chalk.green(`Fixed ${fixed.length} issue(s):`))
        for (const f of fixed) this.log(chalk.gray(`  - ${f}`))
      }
      const remaining = issues.length - fixed.length
      if (remaining > 0) {
        this.log(chalk.yellow(`${remaining} issue(s) require manual action — run \`agency install\` to reconfigure.`))
      }
      if (warnings.length > 0) {
        this.log(chalk.yellow(`${warnings.length} advisory item(s) — review above warnings.`))
      }
      if (remaining === 0 && fixed.length > 0) {
        this.log(chalk.green('All fixable issues resolved.'))
      }
    }
  }
}
