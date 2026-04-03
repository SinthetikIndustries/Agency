import { describe, it, expect } from 'vitest'
import { classifyToolInvocation, SAFE_ALLOWLIST } from './permission-classifier.js'

describe('SAFE_ALLOWLIST', () => {
  it('includes read-only tools that skip the classifier', () => {
    expect(SAFE_ALLOWLIST).toContain('file_read')
    expect(SAFE_ALLOWLIST).toContain('file_list')
    expect(SAFE_ALLOWLIST).not.toContain('file_write')
    expect(SAFE_ALLOWLIST).not.toContain('shell_run')
  })
})

describe('classifyToolInvocation', () => {
  it('classifies safe tool invocations as allowed', async () => {
    const result = await classifyToolInvocation({
      toolName: 'file_read',
      toolInput: { path: '/home/user/project/src/main.ts' },
      recentToolUses: [],
    })
    expect(result.shouldBlock).toBe(false)
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.riskLevel)
  })

  it('classifies dangerous path writes as HIGH risk', async () => {
    const result = await classifyToolInvocation({
      toolName: 'file_write',
      toolInput: { path: '/etc/passwd', content: 'hacked' },
      recentToolUses: [],
    })
    expect(result.riskLevel).toBe('HIGH')
    expect(result.shouldBlock).toBe(true)
  })
})
