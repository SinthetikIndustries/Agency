// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { getGatewayStatus } from '../lib/process.js'

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function colorizeServiceStatus(status: string): string {
  switch (status.toLowerCase()) {
    case 'ok':
    case 'healthy':
    case 'running':
      return chalk.green(status)
    case 'degraded':
    case 'warning':
      return chalk.yellow(status)
    case 'error':
    case 'failed':
    case 'unhealthy':
      return chalk.red(status)
    case 'disabled':
    case 'off':
      return chalk.gray(status)
    default:
      return chalk.white(status)
  }
}

export default class Status extends Command {
  static summary = 'Show status of the Agency Gateway and its services'

  static flags = {
    json: Flags.boolean({ description: 'Output status as JSON', default: false }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Status)

    const status = await getGatewayStatus()

    if (flags.json) {
      this.log(JSON.stringify(status, null, 2))
      return
    }

    const prefix = chalk.cyan('Agency') + chalk.gray(' › ')

    if (!status.running) {
      this.log(prefix + chalk.red('Gateway: stopped'))
      this.log(chalk.gray('  Run `agency start` to start the Gateway'))
      return
    }

    this.log(prefix + chalk.green('Gateway: running') + chalk.gray(` (PID ${status.pid})`))

    if (status.health) {
      const h = status.health
      this.log(chalk.gray('  Version: ') + chalk.white(h.version ?? 'unknown'))
      this.log(chalk.gray('  Uptime:  ') + chalk.white(formatUptime(h.uptime ?? 0)))
      this.log(chalk.gray('  Status:  ') + colorizeServiceStatus(h.status ?? 'unknown'))
      this.log('')

      if (h.services && Object.keys(h.services).length > 0) {
        this.log(chalk.bold('  Services:'))
        const maxLen = Math.max(...Object.keys(h.services).map((k) => k.length))
        for (const [name, svcStatus] of Object.entries(h.services)) {
          const padding = ' '.repeat(maxLen - name.length)
          this.log(`    ${chalk.white(name)}${padding}  ${colorizeServiceStatus(svcStatus)}`)
        }
      }
    } else {
      this.log(chalk.yellow('  ⚠ Gateway process is running but health endpoint is unreachable'))
    }
  }
}
