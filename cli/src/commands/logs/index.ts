// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import WebSocket from 'ws'
import { gatewayFetch, gatewayWsUrl } from '../../lib/gateway.js'

interface LogLine {
  ts: string
  service: string
  level: string
  msg: string
}

function colorLine(line: LogLine): string {
  const ts = chalk.gray(line.ts)
  const level = line.level === 'error'
    ? chalk.red(line.level)
    : line.level === 'warn'
    ? chalk.yellow(line.level)
    : line.level === 'debug'
    ? chalk.gray(line.level)
    : chalk.white(line.level)
  return `${ts} ${level} ${line.msg}`
}

export default class Logs extends Command {
  static summary = 'View logs from the Agency program or a specific service'

  static flags = {
    follow: Flags.boolean({ char: 'f', description: 'Stream live logs', default: false }),
    lines: Flags.integer({ char: 'n', description: 'Number of lines to show', default: 50 }),
  }

  static args = {
    service: Args.string({ description: 'Service to view logs for (default: gateway)', required: false }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Logs)
    const service = args.service ?? 'gateway'

    if (flags.follow) {
      let wsBase: string
      try {
        wsBase = await gatewayWsUrl()
      } catch {
        this.error('Cannot connect to Gateway. Run `agency start` first.')
      }

      const wsUrl = `${wsBase}/logs/${service}/stream`
      this.log(`${chalk.cyan('Streaming')} logs for ${chalk.bold(service)} — press Ctrl+C to stop\n`)

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl)

        ws.on('message', (data: WebSocket.RawData) => {
          try {
            const line = JSON.parse(data.toString()) as LogLine
            this.log(colorLine(line))
          } catch {
            this.log(data.toString())
          }
        })

        ws.on('error', (err: Error) => {
          if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
            this.error('Cannot connect to Gateway. Run `agency start` first.')
          } else {
            this.error(`WebSocket error: ${err.message}`)
          }
        })

        ws.on('close', () => {
          resolve()
        })

        process.on('SIGINT', () => {
          ws.close()
          resolve()
        })
      })
    } else {
      let lines: LogLine[]
      try {
        const res = await gatewayFetch<{ lines: LogLine[] }>(`/logs/${service}`)
        lines = res.lines
      } catch (err) {
        this.error(String(err))
      }

      if (lines.length === 0) {
        this.log(`No logs found for service ${chalk.bold(service)}.`)
        return
      }

      const tail = lines.slice(-flags.lines)
      this.log('')
      for (const line of tail) {
        this.log(colorLine(line))
      }
      this.log('')
    }
  }
}
