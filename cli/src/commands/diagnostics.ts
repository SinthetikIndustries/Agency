// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../lib/gateway.js'

interface DiagnosticsReport {
  timestamp: string
  system: { nodeVersion: string; platform: string; processUptime: number; memoryMb: { heapUsed: number; heapTotal: number; rss: number } }
  services: Record<string, { status: string }>
  agents: Array<{ slug: string; name: string; status: string }>
  pendingApprovals: number
  config: { profile: string; defaultModel: string; enabledProviders: string[] }
}

export default class Diagnostics extends Command {
  static summary = 'Show full system diagnostics report'

  async run(): Promise<void> {
    let d: DiagnosticsReport
    try {
      d = await gatewayFetch<DiagnosticsReport>('/diagnostics')
    } catch (err) {
      this.error(String(err))
    }

    this.log('')
    this.log(chalk.bold('System'))
    this.log(`  Node:     ${d.system.nodeVersion}`)
    this.log(`  Platform: ${d.system.platform}`)
    this.log(`  Uptime:   ${Math.floor(d.system.processUptime)}s`)
    this.log(`  Memory:   ${Math.round(d.system.memoryMb.heapUsed)}MB heap / ${Math.round(d.system.memoryMb.rss)}MB rss`)

    this.log('')
    this.log(chalk.bold('Services'))
    for (const [name, svc] of Object.entries(d.services)) {
      const ok = svc.status === 'ok'
      this.log(`  ${(ok ? chalk.green('✓') : chalk.red('✗'))} ${name}: ${ok ? chalk.green(svc.status) : chalk.red(svc.status)}`)
    }

    this.log('')
    this.log(chalk.bold('Config'))
    this.log(`  Profile:       ${d.config.profile}`)
    this.log(`  Default model: ${d.config.defaultModel}`)

    this.log('')
    this.log(chalk.bold('Agents'))
    if (d.agents.length === 0) {
      this.log(chalk.gray('  None'))
    } else {
      for (const a of d.agents) {
        const ok = a.status === 'active'
        this.log(`  ${ok ? chalk.green('●') : chalk.gray('○')} ${chalk.cyan(a.slug)} (${a.name})`)
      }
    }

    this.log('')
    this.log(`${chalk.bold('Pending approvals:')} ${d.pendingApprovals > 0 ? chalk.yellow(d.pendingApprovals) : chalk.gray(d.pendingApprovals)}`)
    this.log(`${chalk.bold('Timestamp:')} ${new Date(d.timestamp).toLocaleString()}`)
    this.log('')
  }
}
