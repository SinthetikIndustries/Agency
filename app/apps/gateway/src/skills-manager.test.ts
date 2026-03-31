// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillsManager } from './skills-manager.js'

function makeDb() {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(undefined),
  }
}

describe('SkillsManager.enableSkill / disableSkill', () => {
  it('enableSkill executes UPDATE with status installed', async () => {
    const db = makeDb()
    db.queryOne.mockResolvedValueOnce({
      id: '1', name: 'bash', version: '1.0.0', status: 'disabled',
      type: 'tool', anthropic_builtin_type: 'bash_20250124',
      anthropic_beta_header: null, manifest: '{}',
      installed_at: new Date(), updated_at: new Date(),
    })
    const mgr = new SkillsManager(db as any, '/tmp')
    const result = await mgr.enableSkill('bash')
    expect(result.status).toBe('installed')
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE skills SET status = 'installed'/),
      expect.arrayContaining(['bash'])
    )
  })

  it('disableSkill executes UPDATE with status disabled', async () => {
    const db = makeDb()
    db.queryOne.mockResolvedValueOnce({
      id: '1', name: 'bash', version: '1.0.0', status: 'installed',
      type: 'tool', anthropic_builtin_type: 'bash_20250124',
      anthropic_beta_header: null, manifest: '{}',
      installed_at: new Date(), updated_at: new Date(),
    })
    const mgr = new SkillsManager(db as any, '/tmp')
    const result = await mgr.disableSkill('bash')
    expect(result.status).toBe('disabled')
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE skills SET status = 'disabled'/),
      expect.arrayContaining(['bash'])
    )
  })
})

describe('SkillsManager.getAgentSkills', () => {
  it('returns installed+enabled skills via INNER JOIN', async () => {
    const db = makeDb()
    db.query.mockResolvedValueOnce([{
      id: '1', name: 'bash', version: '1.0.0', status: 'installed',
      type: 'tool', anthropic_builtin_type: 'bash_20250124',
      anthropic_beta_header: null,
      manifest: JSON.stringify({ tools: [], prompts: [], requiredTools: [] }),
      installed_at: new Date(), enabled: true, agent_config: '{}',
    }])
    const mgr = new SkillsManager(db as any, '/tmp')
    const result = await mgr.getAgentSkills('agent-1')
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('bash')
  })

  it('returns empty array when no skills assigned', async () => {
    const db = makeDb()
    const mgr = new SkillsManager(db as any, '/tmp')
    expect(await mgr.getAgentSkills('agent-1')).toEqual([])
  })
})

describe('SkillsManager.buildToolDefinitions', () => {
  it('builds tool def for anthropic builtin skill', () => {
    const mgr = new SkillsManager({} as any, '/tmp')
    const tools = mgr.buildToolDefinitions([{
      id: '1', name: 'bash', version: '1.0.0', type: 'tool',
      anthropicBuiltinType: 'bash_20250124', anthropicBetaHeader: null,
      manifest: { tools: [], prompts: [], requiredTools: [] },
      installedAt: new Date(), config: {},
    }])
    expect(tools).toHaveLength(1)
    expect((tools[0] as any).type).toBe('bash_20250124')
  })

  it('first-installed-at wins on conflict', () => {
    const mgr = new SkillsManager({} as any, '/tmp')
    const tools = mgr.buildToolDefinitions([
      { id: '1', name: 'a', version: '1.0.0', type: 'tool' as const,
        anthropicBuiltinType: 'bash_20250124', anthropicBetaHeader: null,
        manifest: { tools: [], prompts: [], requiredTools: [] },
        installedAt: new Date('2026-01-01'), config: {} },
      { id: '2', name: 'b', version: '1.0.0', type: 'tool' as const,
        anthropicBuiltinType: 'bash_20250124', anthropicBetaHeader: null,
        manifest: { tools: [], prompts: [], requiredTools: [] },
        installedAt: new Date('2026-02-01'), config: {} },
    ])
    expect(tools).toHaveLength(1)
  })
})

describe('SkillsManager.collectBetaHeaders', () => {
  it('returns unique non-null beta headers', () => {
    const mgr = new SkillsManager({} as any, '/tmp')
    const headers = mgr.collectBetaHeaders([
      { id: '1', name: 'cu', version: '1.0.0', type: 'tool' as const,
        anthropicBuiltinType: 'computer_20251124',
        anthropicBetaHeader: 'computer-use-2025-11-24',
        manifest: { tools: [], prompts: [], requiredTools: [] },
        installedAt: new Date(), config: {} },
      { id: '2', name: 'bash', version: '1.0.0', type: 'tool' as const,
        anthropicBuiltinType: 'bash_20250124', anthropicBetaHeader: null,
        manifest: { tools: [], prompts: [], requiredTools: [] },
        installedAt: new Date(), config: {} },
    ])
    expect(headers).toEqual(['computer-use-2025-11-24'])
  })
})
