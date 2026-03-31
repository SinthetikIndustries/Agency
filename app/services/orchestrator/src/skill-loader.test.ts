// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import { loadSkillsForSession } from './skill-loader.js'
import type { ActiveSkill } from '@agency/shared-types'

function skill(overrides: Partial<ActiveSkill> = {}): ActiveSkill {
  return {
    id: '1', name: 'bash', version: '1.0.0', type: 'tool',
    anthropicBuiltinType: 'bash_20250124', anthropicBetaHeader: null,
    manifest: { tools: [], prompts: [], requiredTools: [] },
    installedAt: new Date(), config: {},
    ...overrides,
  }
}

describe('loadSkillsForSession', () => {
  it('skips skills with missing requiredTools', () => {
    const r = loadSkillsForSession(
      [skill({ name: 'vault-writer', type: 'prompt', anthropicBuiltinType: null,
               manifest: { requiredTools: ['vault_search'], prompts: ['g'], tools: [] } })],
      ['file_read']
    )
    expect(r.validSkills).toHaveLength(0)
    expect(r.skippedSkills[0]?.reason).toContain('vault_search')
  })

  it('includes skills when all requiredTools present', () => {
    const r = loadSkillsForSession([skill()], ['file_read'])
    expect(r.validSkills).toHaveLength(1)
  })

  it('includes skills when requiredTools is empty', () => {
    const r = loadSkillsForSession([skill({ manifest: { requiredTools: [], prompts: [], tools: [] } })], [])
    expect(r.validSkills).toHaveLength(1)
  })

  it('deduplicates beta headers', () => {
    const r = loadSkillsForSession([
      skill({ name: 'a', anthropicBetaHeader: 'computer-use-2025-11-24' }),
      skill({ name: 'b', anthropicBetaHeader: 'computer-use-2025-11-24' }),
    ], [])
    expect(r.betaHeaders).toHaveLength(1)
    expect(r.betaHeaders[0]).toBe('computer-use-2025-11-24')
  })

  it('returns empty betaHeaders when none present', () => {
    const r = loadSkillsForSession([skill()], [])
    expect(r.betaHeaders).toEqual([])
  })
})
