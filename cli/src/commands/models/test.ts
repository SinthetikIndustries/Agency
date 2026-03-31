// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Args, Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface TestResult {
  ok: boolean
  latencyMs: number
  model: string
  response: string
}

export default class ModelsTest extends Command {
  static summary = 'Test connectivity to a model provider'

  static args = {
    model: Args.string({ description: 'Model name to test (default: configured default)', required: false }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ModelsTest)

    const label = args.model ? chalk.cyan(args.model) : chalk.gray('default model')
    this.log(`Testing ${label}...`)

    let result: TestResult
    try {
      result = await gatewayFetch<TestResult>('/models/test', {
        method: 'POST',
        body: JSON.stringify(args.model ? { model: args.model } : {}),
      })
    } catch (err) {
      this.error(String(err))
    }

    if (result.ok) {
      this.log(`${chalk.green('✓')} Model ${chalk.cyan(result.model)} responded in ${chalk.bold(String(result.latencyMs) + 'ms')}`)
      if (result.response) {
        this.log(`  ${chalk.gray('Response:')} ${result.response}`)
      }
    } else {
      this.error(`Model ${result.model} test failed.`)
    }
  }
}
