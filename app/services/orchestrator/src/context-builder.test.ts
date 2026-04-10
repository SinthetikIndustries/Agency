// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentWithProfile } from '@agency/shared-types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockReaddir = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  readdir: mockReaddir,
  rename: vi.fn().mockResolvedValue(undefined),
  cp: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs', () => ({ existsSync: vi.fn().mockReturnValue(false) }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(systemPrompt = 'You are helpful.'): AgentWithProfile {
  return {
    identity: {
      id: 'main',
      name: 'Main',
      slug: 'main',
      description: '',
      workspacePath: '/tmp/.agency/agents/main',
      additionalWorkspacePaths: [],
      lifecycleType: 'always_on',
      wakeMode: 'auto',
      currentProfileId: 'builtin-personal-assistant',
      shellPermissionLevel: 'none',
      agentManagementPermission: 'approval_required',
      agencyPermissions: { agentCreate: 'deny', agentDelete: 'deny', agentUpdate: 'deny', groupCreate: 'deny', groupUpdate: 'deny', groupDelete: 'deny', shellRun: 'deny' },
      autonomousMode: false,
      status: 'active',
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
      parentAgentId: null,
    },
    profile: {
      id: 'builtin-personal-assistant',
      name: 'Personal Assistant',
      slug: 'personal-assistant',
      description: 'Default',
      systemPrompt,
      modelTier: 'strong',
      allowedTools: [],
      behaviorSettings: { tone: 'professional', verbosity: 'normal', proactive: false },
      tags: [],
      builtIn: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }
}

async function makeBuildContext(
  memoryStore?: { read: ReturnType<typeof vi.fn> },
  configRows?: Array<{ file_type: string; content: string }>
) {
  const { Orchestrator } = await import('./index.js')
  const db = {
    query: vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('agent_config_files') && configRows) return configRows
      return []
    }),
    execute: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }
  const modelRouter = {
    complete: vi.fn(),
    stream: vi.fn(),
    resolveModel: vi.fn((t: string) => t === 'cheap' ? 'gpt-4.1-mini' : 'gpt-4.1'),
    defaultModel: 'gpt-4.1',
    healthCheck: vi.fn(),
    listAllModels: vi.fn(),
    resolveProvider: vi.fn(),
    pullOllamaModel: vi.fn(),
    ollamaEnabled: false,
  }
  const toolRegistry = { getTools: vi.fn().mockReturnValue([]) }
  const orchestrator = new Orchestrator(db as any, modelRouter as any, toolRegistry as any, undefined, memoryStore as any)
  // Access private method via cast for testing
  return (orchestrator as any).buildContext.bind(orchestrator) as (
    agent: AgentWithProfile,
    messages: unknown[],
    options?: { systemInjection?: string }
  ) => Promise<{ systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>; history: unknown[] }>
}

// ─── buildContext — systemBlocks ──────────────────────────────────────────────

describe('buildContext() — systemBlocks', () => {
  beforeEach(() => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([])
  })

  it('returns systemBlocks array instead of flat system string', async () => {
    const buildContext = await makeBuildContext()
    const result = await buildContext(makeAgent(), [])
    expect(result).toHaveProperty('systemBlocks')
    expect(Array.isArray(result.systemBlocks)).toBe(true)
  })

  it('first block contains the profile system prompt with cache_control', async () => {
    const buildContext = await makeBuildContext()
    const result = await buildContext(makeAgent('You are a helpful assistant.'), [])
    const first = result.systemBlocks[0]!
    expect(first.text).toBe('You are a helpful assistant.')
    expect(first.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('only emits the static block when no workspace files or injection', async () => {
    const buildContext = await makeBuildContext()
    const result = await buildContext(makeAgent(), [])
    expect(result.systemBlocks).toHaveLength(1)
  })

  it('adds a second dynamic block when agent config files are present in DB', async () => {
    const configRows = [{ file_type: 'identity', content: '# Identity\nI am the main agent.' }]
    const buildContext = await makeBuildContext(undefined, configRows)
    const result = await buildContext(makeAgent(), [])
    expect(result.systemBlocks).toHaveLength(2)
    expect(result.systemBlocks[1]!.text).toContain('I am the main agent.')
    expect(result.systemBlocks[1]!.cache_control).toBeUndefined()
  })

  it('adds a second dynamic block when systemInjection is provided', async () => {
    const buildContext = await makeBuildContext()
    const result = await buildContext(makeAgent(), [], { systemInjection: 'Extra context.' })
    expect(result.systemBlocks).toHaveLength(2)
    expect(result.systemBlocks[1]!.text).toContain('Extra context.')
  })
})

// ─── buildContext() — memory integration ─────────────────────────────────────

describe('buildContext() — memory integration', () => {
  beforeEach(() => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([])
  })

  it('includes relevant memories in the dynamic block', async () => {
    const mockRead = vi.fn().mockResolvedValue([
      { id: '1', agentId: 'main', type: 'semantic', content: 'User prefers bullet points', createdAt: new Date(), expiresAt: null },
    ])
    const buildContext = await makeBuildContext({ read: mockRead })
    const messages = [{ role: 'user', content: 'Explain something' }]
    const result = await buildContext(makeAgent(), messages)
    expect(result.systemBlocks).toHaveLength(2)
    expect(result.systemBlocks[1]!.text).toContain('User prefers bullet points')
    expect(result.systemBlocks[1]!.text).toContain('Relevant Memories')
  })

  it('queries memoryStore with the last user message', async () => {
    const mockRead = vi.fn().mockResolvedValue([])
    const buildContext = await makeBuildContext({ read: mockRead })
    const messages = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Response' },
      { role: 'user', content: 'Second message' },
    ]
    await buildContext(makeAgent(), messages)
    expect(mockRead).toHaveBeenCalledWith(expect.objectContaining({ query: 'Second message' }))
  })

  it('does not add a memory block when memoryStore returns no results', async () => {
    const mockRead = vi.fn().mockResolvedValue([])
    const buildContext = await makeBuildContext({ read: mockRead })
    const result = await buildContext(makeAgent(), [{ role: 'user', content: 'hello' }])
    expect(result.systemBlocks).toHaveLength(1)
  })

  it('is non-fatal when memoryStore.read() throws', async () => {
    const mockRead = vi.fn().mockRejectedValue(new Error('DB down'))
    const buildContext = await makeBuildContext({ read: mockRead })
    await expect(buildContext(makeAgent(), [{ role: 'user', content: 'hello' }])).resolves.toBeDefined()
  })

  it('skips memory query when no messages are present', async () => {
    const mockRead = vi.fn().mockResolvedValue([])
    const buildContext = await makeBuildContext({ read: mockRead })
    await buildContext(makeAgent(), [])
    expect(mockRead).not.toHaveBeenCalled()
  })
})
