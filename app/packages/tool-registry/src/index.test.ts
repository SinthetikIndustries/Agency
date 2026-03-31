// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import { createToolRegistry, enforceAnyWorkspacePath } from './index.js'
import type { QueueClient } from '@agency/shared-worker'

describe('ToolRegistry - browser_navigate', () => {
  it('browser_navigate manifest has correct shape', () => {
    const registry = createToolRegistry()
    const manifest = registry.get('browser_navigate')

    expect(manifest).toBeDefined()
    expect(manifest?.name).toBe('browser_navigate')
    expect(manifest?.type).toBe('browser')
    expect(manifest?.description).toContain('Navigate to a URL')
    expect(manifest?.timeout).toBe(60_000)
    expect(manifest?.sandboxed).toBe(true)
    expect(manifest?.permissions).toContain('network:outbound')
  })

  it('browser_navigate inputSchema has required fields url and action', () => {
    const registry = createToolRegistry()
    const manifest = registry.get('browser_navigate')

    expect(manifest?.inputSchema).toBeDefined()
    const schema = manifest?.inputSchema as any
    expect(schema.required).toContain('url')
    expect(schema.required).toContain('action')
  })

  it('browser_navigate action enum contains fetch, screenshot, extract', () => {
    const registry = createToolRegistry()
    const manifest = registry.get('browser_navigate')

    const schema = manifest?.inputSchema as any
    const actionProp = schema.properties.action
    expect(actionProp.enum).toEqual(['fetch', 'screenshot', 'extract'])
  })

  it('browser_navigate has optional selector and waitForSelector properties', () => {
    const registry = createToolRegistry()
    const manifest = registry.get('browser_navigate')

    const schema = manifest?.inputSchema as any
    expect(schema.properties.selector).toBeDefined()
    expect(schema.properties.waitForSelector).toBeDefined()
    expect(schema.properties.timeout).toBeDefined()
  })

  it('browser type routes to queue:browser when queueClient is available', async () => {
    const mockQueueClient = {
      dispatchAndWait: vi.fn().mockResolvedValue({ success: true }),
    } as any as QueueClient

    const registry = createToolRegistry(mockQueueClient)

    const result = await registry.dispatch(
      'browser_navigate',
      { url: 'https://example.com', action: 'fetch' },
      {
        agentId: 'test-agent',
        sessionId: 'test-session',
        workspacePath: '/tmp',
        shellPermissionLevel: 'none',
        sessionGrantActive: false,
        agentManagementPermission: 'approval_required',
      }
    )

    expect(mockQueueClient.dispatchAndWait).toHaveBeenCalled()
    const call = (mockQueueClient.dispatchAndWait as any).mock.calls[0]
    expect(call[0]).toBe('queue:browser')
  })

  it('browser_navigate fallback handler returns error when no queue client', async () => {
    const registry = createToolRegistry() // No queueClient

    const result = await registry.dispatch(
      'browser_navigate',
      { url: 'https://example.com', action: 'fetch' },
      {
        agentId: 'test-agent',
        sessionId: 'test-session',
        workspacePath: '/tmp',
        shellPermissionLevel: 'none',
        sessionGrantActive: false,
        agentManagementPermission: 'approval_required',
      }
    )

    expect(result.success).toBe(true) // The stub handler returns success with error message
    expect(result.output).toEqual({ error: 'Browser worker not available (no queue client)' })
  })
})

describe('enforceAnyWorkspacePath', () => {
  it('allows path inside primary workspace', () => {
    const result = enforceAnyWorkspacePath('file.txt', '/home/user/workspace', [])
    expect(result).toBe('/home/user/workspace/file.txt')
  })

  it('allows path inside extra workspace', () => {
    const result = enforceAnyWorkspacePath('readme.md', '/home/user/workspace', ['/home/user/extra'])
    expect(result).toBe('/home/user/extra/readme.md')
  })

  it('allows absolute path inside primary workspace', () => {
    const result = enforceAnyWorkspacePath('/home/user/workspace/sub/file.txt', '/home/user/workspace', [])
    expect(result).toBe('/home/user/workspace/sub/file.txt')
  })

  it('rejects path escaping all workspaces', () => {
    expect(() =>
      enforceAnyWorkspacePath('../../../etc/passwd', '/home/user/workspace', [])
    ).toThrow('Permission denied')
  })

  it('rejects path not in any workspace', () => {
    expect(() =>
      enforceAnyWorkspacePath('/etc/passwd', '/home/user/workspace', ['/home/user/extra'])
    ).toThrow('Permission denied')
  })
})
