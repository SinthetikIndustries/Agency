// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { buildDefaultConfig, setupObsidianVault } from '../../src/commands/install.js'
import { mkdtemp, rm, writeFile, readFile, access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

describe('buildDefaultConfig', () => {
  it('sets name from userName', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    expect(cfg.name).toBe('Alice')
  })

  it('sets repoDir', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    expect(cfg.repoDir).toBe('/repo')
  })

  it('derives gatewayDir from repoDir', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    expect(cfg.gatewayDir).toBe('/repo/app/apps/gateway')
  })

  it('uses claude-sonnet-4-6 as default model', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    expect((cfg.modelRouter as { defaultModel: string }).defaultModel).toBe('claude-sonnet-4-6')
  })

  it('enables vaultSync with ~/.agency/vault path', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    const vaultSync = (cfg.daemons as { vaultSync: { enabled: boolean; vaultPath: string } }).vaultSync
    expect(vaultSync.enabled).toBe(true)
    expect(vaultSync.vaultPath).toBe(join(homedir(), '.agency', 'vault'))
  })

  it('sets gateway port to 2002', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    expect((cfg.gateway as { port: number }).port).toBe(2002)
  })

  it('sets redis url to port 2004', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    expect((cfg.redis as { url: string }).url).toBe('redis://localhost:2004')
  })

  it('sets ollama endpoint to port 2005 and enables it', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice' })
    const ollama = (cfg.modelRouter as { providers: { ollama: { enabled: boolean; endpoint: string } } }).providers.ollama
    expect(ollama.enabled).toBe(true)
    expect(ollama.endpoint).toBe('http://localhost:2005')
  })
})

describe('setupObsidianVault', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'agency-vault-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('creates canon/, proposals/, notes/, templates/ subdirectories', async () => {
    const vaultPath = join(tmpDir, 'vault')
    const obsidianCfg = join(tmpDir, 'obsidian.json')
    await setupObsidianVault(vaultPath, obsidianCfg)
    for (const sub of ['canon', 'proposals', 'notes', 'templates']) {
      await expect(access(join(vaultPath, sub))).resolves.toBeUndefined()
    }
  })

  it('registers the vault path in obsidian config', async () => {
    const vaultPath = join(tmpDir, 'vault')
    const obsidianCfg = join(tmpDir, 'obsidian.json')
    await setupObsidianVault(vaultPath, obsidianCfg)
    const raw = await readFile(obsidianCfg, 'utf8')
    const config = JSON.parse(raw) as { vaults: Record<string, { path: string }> }
    const paths = Object.values(config.vaults).map(v => v.path)
    expect(paths).toContain(vaultPath)
  })

  it('merges with existing obsidian vaults (does not overwrite)', async () => {
    const vaultPath = join(tmpDir, 'vault')
    const obsidianCfg = join(tmpDir, 'obsidian.json')
    const existing = { vaults: { 'existing-uuid': { path: '/other/vault', ts: 1000, open: false } } }
    await writeFile(obsidianCfg, JSON.stringify(existing), 'utf8')
    await setupObsidianVault(vaultPath, obsidianCfg)
    const raw = await readFile(obsidianCfg, 'utf8')
    const config = JSON.parse(raw) as { vaults: Record<string, { path: string }> }
    const paths = Object.values(config.vaults).map(v => v.path)
    expect(paths).toContain('/other/vault')
    expect(paths).toContain(vaultPath)
  })

  it('handles obsidian config without vaults key', async () => {
    const vaultPath = join(tmpDir, 'vault')
    const obsidianCfg = join(tmpDir, 'obsidian.json')
    await writeFile(obsidianCfg, JSON.stringify({}), 'utf8')  // valid JSON, no vaults key
    await expect(setupObsidianVault(vaultPath, obsidianCfg)).resolves.toBeUndefined()
    const raw = await readFile(obsidianCfg, 'utf8')
    const config = JSON.parse(raw) as { vaults: Record<string, { path: string }> }
    const paths = Object.values(config.vaults).map(v => v.path)
    expect(paths).toContain(vaultPath)
  })

  it('does not register vault twice if already present', async () => {
    const vaultPath = join(tmpDir, 'vault')
    const obsidianCfg = join(tmpDir, 'obsidian.json')
    await setupObsidianVault(vaultPath, obsidianCfg)
    await setupObsidianVault(vaultPath, obsidianCfg)
    const raw = await readFile(obsidianCfg, 'utf8')
    const config = JSON.parse(raw) as { vaults: Record<string, { path: string }> }
    const paths = Object.values(config.vaults).map(v => v.path)
    expect(paths.filter(p => p === vaultPath).length).toBe(1)
  })
})
