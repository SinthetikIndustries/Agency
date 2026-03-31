// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

interface ValidateResult {
  total: number
  valid: number
  invalid: number
  errors: Array<{ path: string; message: string }>
}

export default class VaultValidate extends Command {
  static summary = 'Validate vault document frontmatter without syncing'

  async run(): Promise<void> {
    await this.parse(VaultValidate)

    this.log(`${chalk.cyan('›')} Validating vault documents...`)

    let result: ValidateResult
    try {
      result = await gatewayFetch<ValidateResult>('/vault/validate')
    } catch (err) {
      this.error(String(err))
    }

    this.log('')
    this.log(`  ${chalk.bold('Total:')}   ${result.total}`)
    this.log(`  ${chalk.bold('Valid:')}   ${chalk.green(String(result.valid))}`)
    this.log(`  ${chalk.bold('Invalid:')} ${result.invalid > 0 ? chalk.red(String(result.invalid)) : chalk.green('0')}`)

    if (result.errors.length > 0) {
      this.log('')
      this.log(chalk.red('  Validation errors:'))
      for (const e of result.errors) {
        this.log(`  ${chalk.gray(e.path)} — ${e.message}`)
      }
    }
    this.log('')
  }
}
