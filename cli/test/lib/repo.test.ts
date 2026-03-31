// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { isAgencyRepo, findRepoRoot } from '../../src/lib/repo.js'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('isAgencyRepo', () => {
  it('returns true when app/, cli/, installation/ all exist', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      await mkdir(join(tmp, 'app'))
      await mkdir(join(tmp, 'cli'))
      await mkdir(join(tmp, 'installation'))
      expect(await isAgencyRepo(tmp)).toBe(true)
    } finally {
      await rm(tmp, { recursive: true })
    }
  })

  it('returns false when cli/ is missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      await mkdir(join(tmp, 'app'))
      await mkdir(join(tmp, 'installation'))
      expect(await isAgencyRepo(tmp)).toBe(false)
    } finally {
      await rm(tmp, { recursive: true })
    }
  })

  it('returns false for an empty directory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      expect(await isAgencyRepo(tmp)).toBe(false)
    } finally {
      await rm(tmp, { recursive: true })
    }
  })

  it('returns false when app/ is a file, not a directory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(join(tmp, 'app'), '')
      await mkdir(join(tmp, 'cli'))
      await mkdir(join(tmp, 'installation'))
      expect(await isAgencyRepo(tmp)).toBe(false)
    } finally {
      await rm(tmp, { recursive: true })
    }
  })
})

describe('findRepoRoot', () => {
  it('finds repo root when called from a subdirectory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      await mkdir(join(tmp, 'app'))
      await mkdir(join(tmp, 'cli'))
      await mkdir(join(tmp, 'installation'))
      const subdir = join(tmp, 'nested', 'deep')
      await mkdir(subdir, { recursive: true })
      expect(await findRepoRoot(subdir)).toBe(tmp)
    } finally {
      await rm(tmp, { recursive: true })
    }
  })

  it('returns null when no agency repo found in parents', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      expect(await findRepoRoot(tmp)).toBeNull()
    } finally {
      await rm(tmp, { recursive: true })
    }
  })

  it('finds repo root from more than 10 levels deep', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'agency-test-'))
    try {
      await mkdir(join(tmp, 'app'))
      await mkdir(join(tmp, 'cli'))
      await mkdir(join(tmp, 'installation'))
      // Create 12 levels of nesting
      let deepDir = tmp
      for (let i = 0; i < 12; i++) {
        deepDir = join(deepDir, `level${i}`)
        await mkdir(deepDir)
      }
      expect(await findRepoRoot(deepDir)).toBe(tmp)
    } finally {
      await rm(tmp, { recursive: true })
    }
  })
})
