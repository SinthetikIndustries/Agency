// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { randomUUID } from 'node:crypto'
import { mkdir, chmod, readFile, writeFile, access } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { writeConfig, writeCredentials, agencyDir } from '../lib/config.js'
import { findRepoRoot } from '../lib/repo.js'
import { startGateway, stopGateway, GatewayNotRunningError } from '../lib/process.js'
import { gatewayFetch } from '../lib/gateway.js'
import { PORTS } from '../lib/ports.js'

// ─── Exported helpers (tested independently) ─────────────────────────────────

export interface DefaultConfigOptions {
  profile: string
  repoDir: string
  userName: string
}

export function buildDefaultConfig(opts: DefaultConfigOptions): Record<string, unknown> {
  const { profile, repoDir, userName } = opts
  return {
    name: userName,
    profile,
    repoDir,
    gatewayDir: join(repoDir, 'app', 'apps', 'gateway'),
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
        ollama: { enabled: true, endpoint: `http://localhost:${PORTS.OLLAMA}` },
      },
      fallback: { cheap: null, strong: 'claude-sonnet-4-6' },
      embedding: { provider: 'openai', model: 'text-embedding-3-small' },
    },
    daemons: {
      orchestrator: { enabled: true },
      modelRouter: { enabled: true },
      vaultSync: {
        enabled: true,
        vaultPath: join(homedir(), '.agency', 'vault'),
      },
    },
    orchestrator: {
      defaultAgent: 'main',
      maxWorkflowSteps: 20,
      approvalTimeoutSeconds: 300,
    },
    redis: { url: `redis://localhost:${PORTS.REDIS}` },
  }
}

export async function setupObsidianVault(
  vaultPath: string,
  obsidianConfigPath: string,
): Promise<void> {
  // Create vault directory structure
  for (const sub of ['canon', 'proposals', 'notes', 'templates']) {
    await mkdir(join(vaultPath, sub), { recursive: true })
  }

  // Read existing Obsidian config or start fresh
  let obsidianConfig: { vaults: Record<string, { path: string; ts: number; open: boolean }> }
  try {
    const raw = await readFile(obsidianConfigPath, 'utf8')
    obsidianConfig = JSON.parse(raw)
  } catch {
    obsidianConfig = { vaults: {} }
  }

  // Defensive: ensure vaults key exists even if config was written without it
  obsidianConfig.vaults ??= {}

  // Only register if not already present
  const alreadyRegistered = Object.values(obsidianConfig.vaults).some(v => v.path === vaultPath)
  if (!alreadyRegistered) {
    const uuid = randomUUID().replace(/-/g, '')
    obsidianConfig.vaults[uuid] = { path: vaultPath, ts: Date.now(), open: true }
  }

  // Ensure parent dir exists (Obsidian may not be installed yet)
  const parentDir = join(obsidianConfigPath, '..')
  await mkdir(parentDir, { recursive: true })
  await writeFile(obsidianConfigPath, JSON.stringify(obsidianConfig, null, 2), 'utf8')
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

// ─── Agent seeding ────────────────────────────────────────────────────────────

const PRESET_AGENTS = ['Researcher', 'Coder', 'Writer']

async function seedAgents(mainAgentName: string): Promise<void> {
  // Rename main agent to user's chosen name
  await gatewayFetch('/agents/main', {
    method: 'PATCH',
    body: JSON.stringify({ name: mainAgentName }),
  })

  // Create preset agents (workspace created automatically by orchestrator)
  for (const name of PRESET_AGENTS) {
    await gatewayFetch('/agents', {
      method: 'POST',
      body: JSON.stringify({ name, lifecycleType: 'dormant', shellPermissionLevel: 'none' }),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('409') && !msg.toLowerCase().includes('conflict') && !msg.toLowerCase().includes('already exists')) {
        throw err
      }
    })
  }
}

// ─── Command ─────────────────────────────────────────────────────────────────

export default class Install extends Command {
  static summary = 'Bootstrap and install Agency'

  async run(): Promise<void> {
    await this.parse(Install)

    this.log(chalk.cyan('Agency') + chalk.gray(' › ') + 'Starting installation...')
    this.log('')

    // Create ~/.agency/
    process.stdout.write(chalk.gray('  Creating ~/.agency/ directory... '))
    await mkdir(agencyDir, { recursive: true })
    await chmod(agencyDir, 0o700)
    this.log(chalk.green('done'))

    const rl = createInterface({ input: process.stdin, output: process.stdout })

    try {
      // Onboarding: user name
      const userName = (await prompt(rl, chalk.cyan('Your name') + chalk.gray(': '))) || 'User'

      // Onboarding: main agent name
      const agentName = (await prompt(
        rl,
        chalk.cyan('Name your main agent') + chalk.gray(' (e.g. Aria, Max): '),
      )) || 'Agent'

      // AI provider
      this.log('')
      this.log('AI provider:')
      this.log('  1) Anthropic (Claude) — recommended')
      this.log('  2) OpenAI (GPT)')
      const providerChoice = await prompt(rl, chalk.cyan('Provider') + chalk.gray(' [1-2, default: 1]: '))
      const useOpenAI = providerChoice === '2'
      const aiApiKey = await prompt(
        rl,
        useOpenAI
          ? chalk.cyan('OpenAI API key') + chalk.gray(' (sk-...): ')
          : chalk.cyan('Anthropic API key') + chalk.gray(' (sk-ant-...): '),
      )

      if (!aiApiKey) {
        this.error('API key is required.')
      }

      // Repo path
      const detected = await findRepoRoot(process.cwd())
      const repoDirInput = await prompt(
        rl,
        chalk.cyan('Repo path') + chalk.gray(` [${detected ?? 'enter path'}]: `),
      )
      const repoDir = repoDirInput || detected
      if (!repoDir) {
        this.error('Repo path required. Run from inside the cloned Agency repo.')
      }

      this.log('')

      // Start Docker infra
      process.stdout.write(chalk.gray('  Starting Docker (Postgres + Redis)... '))
      const composeFile = join(repoDir, 'installation', 'docker-compose.yml')
      const dockerResult = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
        stdio: 'pipe',
      })
      if (dockerResult.status !== 0) {
        const stderr = dockerResult.stderr?.toString() ?? ''
        this.error(`Docker Compose failed: ${stderr || 'check that Docker is running'}`)
      }
      this.log(chalk.green('done'))

      // Wait for Ollama daemon to be ready (up to 30s)
      process.stdout.write(chalk.gray('  Waiting for Ollama to be ready...'))
      let ollamaReady = false
      for (let attempt = 0; attempt < 30; attempt++) {
        const check = spawnSync('docker', ['exec', 'agency-ollama', 'ollama', 'list'], { stdio: 'pipe' })
        if (check.status === 0) { ollamaReady = true; break }
        spawnSync('sleep', ['1'])
      }
      if (!ollamaReady) {
        this.warn('Ollama daemon did not start in time — run `docker exec agency-ollama ollama pull qwen3:8b` manually after install.')
      } else {
        this.log(chalk.green(' ready'))
        // Pull model
        this.log(chalk.gray('  Pulling Ollama model qwen3:8b (this may take a few minutes)...'))
        const ollamaPullResult = spawnSync(
          'docker', ['exec', 'agency-ollama', 'ollama', 'pull', 'qwen3:8b'],
          { stdio: 'inherit' }
        )
        if (ollamaPullResult.status !== 0) {
          this.warn('Ollama model pull failed — run `docker exec agency-ollama ollama pull qwen3:8b` manually after install.')
        } else {
          this.log(chalk.green('  Ollama model ready.'))
        }
      }

      // pnpm install
      const appDir = join(repoDir, 'app')
      process.stdout.write(chalk.gray('  Installing dependencies... '))
      const installResult = spawnSync('pnpm', ['install'], { cwd: appDir, stdio: 'pipe' })
      if (installResult.status !== 0) {
        this.error('pnpm install failed: ' + (installResult.stderr?.toString() ?? ''))
      }
      this.log(chalk.green('done'))

      // pnpm build
      process.stdout.write(chalk.gray('  Building app... '))
      const buildResult = spawnSync('pnpm', ['build'], { cwd: appDir, stdio: 'pipe' })
      if (buildResult.status !== 0) {
        this.error('pnpm build failed: ' + (buildResult.stderr?.toString() ?? ''))
      }
      this.log(chalk.green('done'))

      // Write config + credentials (must happen before starting gateway)
      const apiKey = 'agency-key-' + randomUUID()
      const config = buildDefaultConfig({ profile: 'basic', repoDir, userName })
      await writeConfig(config)
      await writeCredentials({
        gateway: { apiKey },
        ...(useOpenAI
          ? { openai: { apiKey: aiApiKey } }
          : { anthropic: { apiKey: aiApiKey } }),
        postgres: { url: `postgresql://agency:agency@localhost:${PORTS.POSTGRES}/agency` },
        redis: { url: `redis://localhost:${PORTS.REDIS}` },
      })

      // Start gateway (runs DB migrations on startup, creates main agent)
      process.stdout.write(chalk.gray('  Starting gateway for setup... '))
      const gatewayDir = join(repoDir, 'app', 'apps', 'gateway')
      await startGateway(gatewayDir)
      this.log(chalk.green('done'))

      // Seed agents via API
      process.stdout.write(chalk.gray('  Creating default agents... '))
      await seedAgents(agentName)
      this.log(chalk.green('done'))

      // Stop setup gateway
      process.stdout.write(chalk.gray('  Stopping setup gateway... '))
      try {
        await stopGateway()
      } catch (err) {
        if (!(err instanceof GatewayNotRunningError)) throw err
      }
      this.log(chalk.green('done'))

      // Obsidian vault
      const vaultPath = join(homedir(), '.agency', 'vault')
      const obsidianConfigPath = join(homedir(), '.config', 'obsidian', 'obsidian.json')
      process.stdout.write(chalk.gray('  Setting up Obsidian vault... '))
      await setupObsidianVault(vaultPath, obsidianConfigPath)
      this.log(chalk.green('done'))

      // Print success
      this.log('')
      this.log(chalk.green('✓') + ' Agency installed successfully!')
      this.log('')
      this.log(chalk.bold('Next steps:'))
      this.log('  ' + chalk.cyan('agency start') + chalk.gray('   — start the gateway'))
      this.log('  ' + chalk.cyan('agency status') + chalk.gray('  — check service health'))
      this.log('')
      this.log(chalk.gray('Gateway:     ') + chalk.cyan(`http://localhost:${PORTS.GATEWAY}`))
      this.log(chalk.gray('Dashboard:   ') + chalk.cyan(`http://localhost:${PORTS.DASHBOARD}`))
      this.log(chalk.gray('API key:     ') + chalk.yellow(apiKey))
      this.log(chalk.gray('Vault:       ') + vaultPath)
    } finally {
      rl.close()
    }
  }
}
