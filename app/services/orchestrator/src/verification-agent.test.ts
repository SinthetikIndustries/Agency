import { describe, it, expect } from 'vitest'
import { buildVerificationPrompt, parseVerdict } from './verification-agent.js'

describe('buildVerificationPrompt', () => {
  it('includes anti-rationalization rules', () => {
    const prompt = buildVerificationPrompt({ taskDescription: 'Fix auth bug', filesChanged: ['src/auth.ts'] })
    expect(prompt).toContain('Reading is not verification')
    expect(prompt).toContain('Run it')
    expect(prompt).toContain('STRICTLY PROHIBITED')
  })

  it('lists the files changed', () => {
    const prompt = buildVerificationPrompt({ taskDescription: 'Fix bug', filesChanged: ['src/auth.ts', 'tests/auth.test.ts'] })
    expect(prompt).toContain('src/auth.ts')
    expect(prompt).toContain('tests/auth.test.ts')
  })
})

describe('parseVerdict', () => {
  it('extracts PASS verdict', () => {
    expect(parseVerdict('All checks ran fine.\n\nVERDICT: PASS')).toBe('PASS')
  })
  it('extracts FAIL verdict', () => {
    expect(parseVerdict('Login endpoint returns 500.\n\nVERDICT: FAIL')).toBe('FAIL')
  })
  it('extracts PARTIAL verdict', () => {
    expect(parseVerdict('Could not start server.\n\nVERDICT: PARTIAL')).toBe('PARTIAL')
  })
  it('returns null when no verdict found', () => {
    expect(parseVerdict('No verdict line here.')).toBeNull()
  })
})
