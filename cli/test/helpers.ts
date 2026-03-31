// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { runCommand } from '@oclif/test'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { format } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export async function run(args: string[]): Promise<string> {
  const origLog = console.log
  console.log = (...a: unknown[]) => {
    process.stdout.write(format(...a) + '\n')
  }
  try {
    const { stdout } = await runCommand(args, { root })
    return stdout
  } finally {
    console.log = origLog
  }
}
