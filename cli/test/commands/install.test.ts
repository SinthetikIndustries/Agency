// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { buildDefaultConfig, selectOllamaModels, OLLAMA_MODELS } from '../../src/commands/install.js'
import { join } from 'node:path'
import { homedir } from 'node:os'

describe('buildDefaultConfig', () => {
  it('sets name from userName', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    expect(cfg.name).toBe('Alice')
  })

  it('sets repoDir', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    expect(cfg.repoDir).toBe('/repo')
  })

  it('derives gatewayDir from repoDir', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    expect(cfg.gatewayDir).toBe('/repo/app/apps/gateway')
  })

  it('uses claude-sonnet-4-6 as default model', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    expect((cfg.modelRouter as { defaultModel: string }).defaultModel).toBe('claude-sonnet-4-6')
  })

  it('enables vaultSync with ~/.agency/vault path', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    const vaultSync = (cfg.daemons as { vaultSync: { enabled: boolean; vaultPath: string } }).vaultSync
    expect(vaultSync.enabled).toBe(true)
    expect(vaultSync.vaultPath).toBe(join(homedir(), '.agency', 'vault'))
  })

  it('sets gateway port to 2002', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    expect((cfg.gateway as { port: number }).port).toBe(2002)
  })

  it('sets redis url to port 2004', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    expect((cfg.redis as { url: string }).url).toBe('redis://localhost:2004')
  })

  it('sets ollama endpoint to port 2005 and enables it', () => {
    const cfg = buildDefaultConfig({ profile: 'basic', repoDir: '/repo', userName: 'Alice', provider: 'anthropic' })
    const ollama = (cfg.modelRouter as { providers: { ollama: { enabled: boolean; endpoint: string } } }).providers.ollama
    expect(ollama.enabled).toBe(true)
    expect(ollama.endpoint).toBe('http://localhost:2005')
  })
})

describe('selectOllamaModels', () => {
  it('returns all models when user enters "a"', async () => {
    const result = await selectOllamaModels(async () => 'a')
    expect(result).toEqual(['qwen3:1.7b', 'qwen3:8b', 'nemotron-3-nano:4b', 'gemma4:e4b'])
    expect(result).not.toBe(OLLAMA_MODELS)
  })

  it('returns first model when user enters "1"', async () => {
    const result = await selectOllamaModels(async () => '1')
    expect(result).toEqual(['qwen3:1.7b'])
  })

  it('returns second model when user enters "2"', async () => {
    const result = await selectOllamaModels(async () => '2')
    expect(result).toEqual(['qwen3:8b'])
  })

  it('returns third model when user enters "3"', async () => {
    const result = await selectOllamaModels(async () => '3')
    expect(result).toEqual(['nemotron-3-nano:4b'])
  })

  it('returns fourth model when user enters "4"', async () => {
    const result = await selectOllamaModels(async () => '4')
    expect(result).toEqual(['gemma4:e4b'])
  })

  it('returns empty array when user enters "0"', async () => {
    const result = await selectOllamaModels(async () => '0')
    expect(result).toEqual([])
  })

  it('returns empty array when user enters blank', async () => {
    const result = await selectOllamaModels(async () => '')
    expect(result).toEqual([])
  })

  it('returns empty array when user enters invalid input', async () => {
    const result = await selectOllamaModels(async () => 'x')
    expect(result).toEqual([])
  })
})

