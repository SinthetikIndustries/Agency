// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createToolRegistry } from '../index.js'
import type { ToolContext } from '@agency/shared-types'

// Mock execa module so tests don't spawn real processes
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({
    stdout: 'mock output',
    stderr: '',
    exitCode: 0,
    failed: false,
  }),
}))

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentId: 'agent-test',
    sessionId: 'session-test',
    workspacePath: '/tmp/test-workspace',
    shellPermissionLevel: 'full',
    sessionGrantActive: false,
    agentManagementPermission: 'approval_required',
    ...overrides,
  }
}

describe('shell_run — permission levels', () => {
  let registry: ReturnType<typeof createToolRegistry>

  beforeEach(() => {
    // No queueClient — forces local dispatch so handleShellRun runs directly
    registry = createToolRegistry()
    vi.clearAllMocks()
  })

  // ── Level 0: none ──────────────────────────────────────────────────────────

  it('none → returns error without running', async () => {
    const result = await registry.dispatch(
      'shell_run',
      { command: 'echo hello' },
      makeContext({ shellPermissionLevel: 'none' })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.error).toMatch(/disabled/)
    expect(output.stdout).toBeUndefined()
  })

  // ── Level 1: per_command ───────────────────────────────────────────────────

  it('per_command → returns approval_required for any command', async () => {
    const result = await registry.dispatch(
      'shell_run',
      { command: 'ls -la' },
      makeContext({ shellPermissionLevel: 'per_command' })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.approval_required).toBe(true)
    expect(output.command).toBe('ls -la')
    expect(output.reason).toMatch(/per_command/)
    expect(output.message).toBeDefined()
  })

  it('per_command → returns approval_required even for safe commands', async () => {
    const result = await registry.dispatch(
      'shell_run',
      { command: 'echo safe' },
      makeContext({ shellPermissionLevel: 'per_command' })
    )
    const output = result.output as any
    expect(output.approval_required).toBe(true)
  })

  // ── Level 2: session_destructive ──────────────────────────────────────────

  it('session_destructive without session grant → returns error', async () => {
    const result = await registry.dispatch(
      'shell_run',
      { command: 'ls' },
      makeContext({ shellPermissionLevel: 'session_destructive', sessionGrantActive: false })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.error).toMatch(/session grant/)
    expect(output.stdout).toBeUndefined()
  })

  it('session_destructive with grant + destructive command → returns approval_required', async () => {
    const result = await registry.dispatch(
      'shell_run',
      { command: 'rm -rf /tmp/some-dir' },
      makeContext({ shellPermissionLevel: 'session_destructive', sessionGrantActive: true })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.approval_required).toBe(true)
    expect(output.command).toBe('rm -rf /tmp/some-dir')
    expect(output.reason).toMatch(/destructive/)
  })

  it('session_destructive with grant + safe command → runs command', async () => {
    const { execa } = await import('execa')
    const result = await registry.dispatch(
      'shell_run',
      { command: 'echo hello' },
      makeContext({ shellPermissionLevel: 'session_destructive', sessionGrantActive: true })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.stdout).toBe('mock output')
    expect(output.exitCode).toBe(0)
    expect(execa).toHaveBeenCalled()
  })

  // ── Level 3: session_only ─────────────────────────────────────────────────

  it('session_only without session grant → returns error', async () => {
    const result = await registry.dispatch(
      'shell_run',
      { command: 'ls' },
      makeContext({ shellPermissionLevel: 'session_only', sessionGrantActive: false })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.error).toMatch(/session grant/)
  })

  it('session_only with session grant → runs command freely', async () => {
    const { execa } = await import('execa')
    const result = await registry.dispatch(
      'shell_run',
      { command: 'rm -rf /tmp/some-dir' },
      makeContext({ shellPermissionLevel: 'session_only', sessionGrantActive: true })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.stdout).toBe('mock output')
    expect(execa).toHaveBeenCalled()
  })

  // ── Level 4: full ─────────────────────────────────────────────────────────

  it('full → runs any command with no restrictions', async () => {
    const { execa } = await import('execa')
    const result = await registry.dispatch(
      'shell_run',
      { command: 'rm -rf /' },
      makeContext({ shellPermissionLevel: 'full', sessionGrantActive: false })
    )
    expect(result.success).toBe(true)
    const output = result.output as any
    expect(output.stdout).toBe('mock output')
    expect(output.approval_required).toBeUndefined()
    expect(output.error).toBeUndefined()
    expect(execa).toHaveBeenCalled()
  })
})

// ── Destructive command pattern detection ────────────────────────────────────

describe('session_destructive — destructive pattern detection', () => {
  let registry: ReturnType<typeof createToolRegistry>

  beforeEach(() => {
    registry = createToolRegistry()
    vi.clearAllMocks()
  })

  const grantedCtx = makeContext({ shellPermissionLevel: 'session_destructive', sessionGrantActive: true })

  async function dispatchCommand(command: string) {
    const result = await registry.dispatch('shell_run', { command }, grantedCtx)
    return result.output as any
  }

  it('rm -rf triggers approval', async () => {
    const out = await dispatchCommand('rm -rf /some/path')
    expect(out.approval_required).toBe(true)
  })

  it('rmdir triggers approval', async () => {
    const out = await dispatchCommand('rmdir /tmp/empty-dir')
    expect(out.approval_required).toBe(true)
  })

  it('sudo triggers approval', async () => {
    const out = await dispatchCommand('sudo apt update')
    expect(out.approval_required).toBe(true)
  })

  it('apt install triggers approval', async () => {
    const out = await dispatchCommand('apt install curl')
    expect(out.approval_required).toBe(true)
  })

  it('systemctl triggers approval', async () => {
    const out = await dispatchCommand('systemctl restart nginx')
    expect(out.approval_required).toBe(true)
  })

  it('kill -9 triggers approval', async () => {
    const out = await dispatchCommand('kill -9 1234')
    expect(out.approval_required).toBe(true)
  })

  it('npm install -g triggers approval', async () => {
    const out = await dispatchCommand('npm install -g typescript')
    expect(out.approval_required).toBe(true)
  })

  it('echo is safe, does not trigger approval', async () => {
    const out = await dispatchCommand('echo "hello world"')
    expect(out.approval_required).toBeUndefined()
    expect(out.stdout).toBe('mock output')
  })

  it('ls -la is safe, does not trigger approval', async () => {
    const out = await dispatchCommand('ls -la /tmp')
    expect(out.approval_required).toBeUndefined()
    expect(out.stdout).toBe('mock output')
  })

  it('cat file is safe, does not trigger approval', async () => {
    const out = await dispatchCommand('cat /tmp/myfile.txt')
    expect(out.approval_required).toBeUndefined()
    expect(out.stdout).toBe('mock output')
  })
})
