// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function isAgencyRepo(dir: string): Promise<boolean> {
  const results = await Promise.all([
    isDirectory(join(dir, 'app')),
    isDirectory(join(dir, 'cli')),
    isDirectory(join(dir, 'installation')),
  ])
  return results.every(Boolean)
}

export async function findRepoRoot(startDir: string): Promise<string | null> {
  let dir = startDir
  while (true) {
    if (await isAgencyRepo(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) return null  // reached filesystem root
    dir = parent
  }
}
