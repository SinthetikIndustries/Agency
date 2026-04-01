// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { rm, readFile, writeFile, access } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { agencyDir, readConfig } from '../lib/config.js'
import { stopGateway, stopDashboard, GatewayNotRunningError } from '../lib/process.js'

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

async function removeObsidianVaultEntry(vaultPath: string): Promise<void> {
  const obsidianConfigPath = join(homedir(), '.config', 'obsidian', 'obsidian.json')
  try {
    await access(obsidianConfigPath)
    const raw = await readFile(obsidianConfigPath, 'utf8')
    const config = JSON.parse(raw) as {
      vaults: Record<string, { path: string; ts: number; open: boolean }>
    }
    const filtered: typeof config.vaults = {}
    for (const [uuid, vault] of Object.entries(config.vaults)) {
      if (vault.path !== vaultPath) filtered[uuid] = vault
    }
    config.vaults = filtered
    await writeFile(obsidianConfigPath, JSON.stringify(config, null, 2), 'utf8')
  } catch {
    // Obsidian not installed or config unreadable — skip
  }
}

export default class Uninstall extends Command {
  static summary = 'Remove Agency and all its data'

  async run(): Promise<void> {
    await this.parse(Uninstall)

    this.log('')
    this.log(chalk.red('Warning:') + ' This permanently removes:')
    this.log('  • The database and all sessions, agents, and vault documents')
    this.log('  • Docker volumes: agency_postgres_data, agency_redis_data')
    this.log('  • The ~/.agency/ directory (config, credentials, workspaces)')
    this.log('  ' + chalk.gray('Ollama models (agency_ollama_data) are kept.'))
    this.log('')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let repoDir: string | undefined

    try {
      const answer = await prompt(rl, chalk.yellow('Type "uninstall" to confirm: '))
      if (answer !== 'uninstall') {
        this.log('Cancelled.')
        return
      }
      // Read repoDir before deleting ~/.agency/
      const config = await readConfig()
      repoDir = config.repoDir as string | undefined
    } finally {
      rl.close()
    }

    // Stop services (best-effort — continue even if stop fails)
    this.log(chalk.gray('Stopping services...'))
    await stopDashboard().catch(() => { /* ignore */ })
    try {
      await stopGateway()
    } catch (err) {
      if (!(err instanceof GatewayNotRunningError)) {
        const msg = err instanceof Error ? err.message : String(err)
        this.warn(`Could not stop gateway (${msg}) — continuing cleanup`)
      }
    }

    // Stop containers, remove postgres + redis volumes, keep ollama models
    if (repoDir) {
      const composeDir = join(repoDir, 'installation')
      const composeFile = join(composeDir, 'docker-compose.yml')
      // Docker Compose prefixes volume names with the project name (compose directory basename)
      const projectName = basename(composeDir).toLowerCase()
      this.log(chalk.gray('Stopping Docker containers...'))
      spawnSync('docker', ['compose', '-f', composeFile, 'down'], { stdio: 'inherit' })

      this.log(chalk.gray('Removing database volumes...'))
      for (const vol of [`${projectName}_agency_postgres_data`, `${projectName}_agency_redis_data`]) {
        const result = spawnSync('docker', ['volume', 'rm', vol], { stdio: 'pipe' })
        if (result.status !== 0) {
          this.warn(`Could not remove volume ${vol} — may not exist or already removed.`)
        }
      }
      this.log(chalk.gray(`  Ollama model data kept (${projectName}_agency_ollama_data).`))
    } else {
      this.warn('repoDir not in config — skipping Docker cleanup. Run manually if needed.')
    }

    // Remove Obsidian vault entry
    this.log(chalk.gray('Removing Obsidian vault registration...'))
    await removeObsidianVaultEntry(join(homedir(), '.agency', 'vault'))

    // Remove ~/.agency/
    this.log(chalk.gray('Removing ~/.agency/...'))
    await rm(agencyDir, { recursive: true, force: true })

    this.log('')
    this.log(chalk.green('✓') + ' Agency uninstalled.')
    this.log('')
    this.log('To remove the CLI: ' + chalk.cyan('npm uninstall -g agencycli'))
  }
}
