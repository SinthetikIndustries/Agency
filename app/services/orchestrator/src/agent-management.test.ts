// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

// ─── Minimal mocks ────────────────────────────────────────────────────────────

// Mock fs/promises so tests don't touch the real filesystem
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  rename: vi.fn().mockResolvedValue(undefined),
  cp: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}))

import { Orchestrator } from './index.js'
import type { DatabaseClient } from './db.js'
import type { ToolContext } from '@agency/shared-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockDb(): DatabaseClient {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeMockModelRouter() {
  return {
    resolveModel: vi.fn().mockReturnValue('claude-3-5-sonnet-20241022'),
    stream: vi.fn(),
    complete: vi.fn(),
  } as any
}

function makeMockToolRegistry() {
  const handlers = new Map<string, (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>>()
  const manifests = new Map<string, { name: string }>()

  const toolNames = [
    'agent_list', 'agent_get', 'agent_set_profile', 'profile_list',
    'agent_create', 'agent_delete',
  ]
  for (const name of toolNames) {
    manifests.set(name, { name })
  }

  return {
    get: vi.fn((name: string) => manifests.get(name) ?? null),
    register: vi.fn((manifest: { name: string }, handler: any) => {
      handlers.set(manifest.name, handler)
    }),
    toAnthropicTools: vi.fn().mockReturnValue([]),
    dispatch: vi.fn(),
    _handlers: handlers,
  } as any
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentId: 'main',
    sessionId: randomUUID(),
    workspacePath: '/tmp/test-workspace',
    shellPermissionLevel: 'none',
    sessionGrantActive: false,
    agentManagementPermission: 'approval_required',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Orchestrator.createAgent()', () => {
  let db: ReturnType<typeof makeMockDb>
  let orchestrator: Orchestrator

  beforeEach(async () => {
    db = makeMockDb()
    const toolRegistry = makeMockToolRegistry()
    orchestrator = new Orchestrator(db as any, makeMockModelRouter(), toolRegistry)

    // Seed a "main" agent in the internal map via loadAgentRegistry path
    // by pre-populating the DB mock to return main agent + personal-assistant profile
    ;(db.query as any).mockResolvedValue([
      {
        id: 'main',
        name: 'Main Agent',
        slug: 'main',
        lifecycle_type: 'always_on',
        wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none',
        agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main',
        status: 'active',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant',
        profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant',
        profile_description: 'Default profile',
        system_prompt: 'You are helpful.',
        model_tier: 'strong',
        model_override: null,
        allowed_tools: '[]',
        behavior_settings: '{}',
        tags: '[]',
        built_in: true,
      },
    ])
    await orchestrator.initialize()
  })

  it('creates an agent and returns its info', async () => {
    const result = await orchestrator.createAgent({ name: 'Test Bot' })
    expect(result.agent.slug).toBe('test-bot')
    expect(result.agent.name).toBe('Test Bot')
    expect(result.agent.status).toBe('active')
    expect(result.agent.lifecycleType).toBe('dormant')
  })

  it('generates slug from name, replacing spaces with hyphens and removing special chars', async () => {
    const result = await orchestrator.createAgent({ name: 'My New Agent!' })
    expect(result.agent.slug).toBe('my-new-agent')
  })

  it('deduplicates slug with suffix when collision exists', async () => {
    await orchestrator.createAgent({ name: 'Bot' })
    const second = await orchestrator.createAgent({ name: 'Bot' })
    expect(second.agent.slug).toBe('bot-2')
  })

  it('inserts a row into agent_identities', async () => {
    await orchestrator.createAgent({ name: 'New Agent' })
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agent_identities'),
      expect.arrayContaining(['new-agent', 'New Agent', 'dormant'])
    )
  })

  it('uses provided profileSlug, lifecycleType, and shellPermissionLevel', async () => {
    const result = await orchestrator.createAgent({
      name: 'Dev Bot',
      profileSlug: 'developer',
      lifecycleType: 'always_on',
      shellPermissionLevel: 'session_only',
    })
    expect(result.agent.lifecycleType).toBe('always_on')
    // profile is resolved from built-in; developer profile name is 'Developer'
    expect(result.agent.profile).toBe('Developer')
  })

  it('auto-adds new agent workspace to main agent additionalWorkspacePaths', async () => {
    const result = await orchestrator.createAgent({ name: 'New Bot' })
    const newAgentWorkspace = orchestrator.getAgent(result.agent.slug)!.identity.workspacePath
    const mainPaths = orchestrator.getAgent('main')!.identity.additionalWorkspacePaths
    expect(mainPaths).toContain(newAgentWorkspace)
  })
})

describe('Orchestrator.deleteAgent()', () => {
  let db: ReturnType<typeof makeMockDb>
  let orchestrator: Orchestrator

  beforeEach(async () => {
    db = makeMockDb()
    const toolRegistry = makeMockToolRegistry()
    orchestrator = new Orchestrator(db as any, makeMockModelRouter(), toolRegistry)

    ;(db.query as any).mockResolvedValue([
      {
        id: 'main',
        name: 'Main Agent',
        slug: 'main',
        lifecycle_type: 'always_on',
        wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none',
        agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main',
        status: 'active',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant',
        profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant',
        profile_description: 'Default',
        system_prompt: 'You are helpful.',
        model_tier: 'strong',
        model_override: null,
        allowed_tools: '[]',
        behavior_settings: '{}',
        tags: '[]',
        built_in: true,
      },
    ])
    await orchestrator.initialize()

    // Create an agent to delete
    await orchestrator.createAgent({ name: 'To Delete' })
  })

  it('throws when attempting to delete main agent', async () => {
    await expect(orchestrator.deleteAgent({ slug: 'main' })).rejects.toThrow('Cannot delete the main agent')
  })

  it('throws when agent does not exist', async () => {
    await expect(orchestrator.deleteAgent({ slug: 'nonexistent' })).rejects.toThrow('Agent not found: nonexistent')
  })

  it('marks agent as deleted in DB', async () => {
    await orchestrator.deleteAgent({ slug: 'to-delete' })
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET status='deleted'"),
      ['to-delete']
    )
  })

  it('removes agent from in-memory map', async () => {
    expect(orchestrator.getAgent('to-delete')).toBeDefined()
    await orchestrator.deleteAgent({ slug: 'to-delete' })
    expect(orchestrator.getAgent('to-delete')).toBeUndefined()
  })

  it('returns success message mentioning the archive path', async () => {
    const result = await orchestrator.deleteAgent({ slug: 'to-delete' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('archived')
    expect(result.message).toContain('.archive/')
  })
})

describe('agent_create tool handler (approval gate)', () => {
  let db: ReturnType<typeof makeMockDb>
  let toolRegistry: ReturnType<typeof makeMockToolRegistry>

  beforeEach(async () => {
    db = makeMockDb()
    toolRegistry = makeMockToolRegistry()
    const orchestrator = new Orchestrator(db as any, makeMockModelRouter(), toolRegistry)

    ;(db.query as any).mockResolvedValue([
      {
        id: 'main',
        name: 'Main Agent',
        slug: 'main',
        lifecycle_type: 'always_on',
        wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none',
        agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main',
        status: 'active',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant',
        profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant',
        profile_description: 'Default',
        system_prompt: 'You are helpful.',
        model_tier: 'strong',
        model_override: null,
        allowed_tools: '[]',
        behavior_settings: '{}',
        tags: '[]',
        built_in: true,
      },
    ])
    await orchestrator.initialize()
  })

  function getHandler(name: string) {
    return toolRegistry._handlers.get(name)!
  }

  it('returns pending_approval when agentManagementPermission is approval_required', async () => {
    const handler = getHandler('agent_create')
    const ctx = makeContext({ agentManagementPermission: 'approval_required' })
    const result = await handler({ name: 'Alpha' }, ctx) as any
    expect(result.status).toBe('pending_approval')
    expect(result.approvalId).toBeDefined()
    expect(result.message).toContain('agency approvals approve')
  })

  it('inserts approval row into approvals table when approval_required', async () => {
    const handler = getHandler('agent_create')
    const ctx = makeContext({ agentManagementPermission: 'approval_required' })
    await handler({ name: 'Beta' }, ctx)
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO approvals'),
      expect.arrayContaining(['agent_create'])
    )
  })

  it('creates agent immediately when agentManagementPermission is autonomous', async () => {
    const handler = getHandler('agent_create')
    const ctx = makeContext({ agentManagementPermission: 'autonomous' })
    const result = await handler({ name: 'Gamma' }, ctx) as any
    expect(result.agent).toBeDefined()
    expect(result.agent.slug).toBe('gamma')
  })
})

describe('agent_delete tool handler (always requires approval)', () => {
  let db: ReturnType<typeof makeMockDb>
  let toolRegistry: ReturnType<typeof makeMockToolRegistry>
  let orchestrator: Orchestrator

  beforeEach(async () => {
    db = makeMockDb()
    toolRegistry = makeMockToolRegistry()
    orchestrator = new Orchestrator(db as any, makeMockModelRouter(), toolRegistry)

    ;(db.query as any).mockResolvedValue([
      {
        id: 'main',
        name: 'Main Agent',
        slug: 'main',
        lifecycle_type: 'always_on',
        wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none',
        agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main',
        status: 'active',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant',
        profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant',
        profile_description: 'Default',
        system_prompt: 'You are helpful.',
        model_tier: 'strong',
        model_override: null,
        allowed_tools: '[]',
        behavior_settings: '{}',
        tags: '[]',
        built_in: true,
      },
    ])
    await orchestrator.initialize()
    // Create agents that the delete handler can find
    await orchestrator.createAgent({ name: 'Some Agent' })
    await orchestrator.createAgent({ name: 'Target Agent' })
  })

  function getHandler(name: string) {
    return toolRegistry._handlers.get(name)!
  }

  it('always returns pending_approval even when autonomous', async () => {
    const handler = getHandler('agent_delete')
    const ctx = makeContext({ agentManagementPermission: 'autonomous' })
    const result = await handler({ slug: 'some-agent' }, ctx) as any
    expect(result.status).toBe('pending_approval')
    expect(result.approvalId).toBeDefined()
  })

  it('inserts approval row with tool_name=agent_delete', async () => {
    const handler = getHandler('agent_delete')
    const ctx = makeContext({ agentManagementPermission: 'approval_required' })
    await handler({ slug: 'target-agent' }, ctx)
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO approvals'),
      expect.arrayContaining(['agent_delete'])
    )
  })
})

// ─── Fix 3: Empty slug guard ─────────────────────────────────────────────────

describe('createAgent() empty slug guard', () => {
  let orchestrator: Orchestrator

  beforeEach(async () => {
    const db = makeMockDb()
    const toolRegistry = makeMockToolRegistry()
    orchestrator = new Orchestrator(db as any, makeMockModelRouter(), toolRegistry)

    ;(db.query as any).mockResolvedValue([
      {
        id: 'main',
        name: 'Main Agent',
        slug: 'main',
        lifecycle_type: 'always_on',
        wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none',
        agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main',
        status: 'active',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant',
        profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant',
        profile_description: 'Default profile',
        system_prompt: 'You are helpful.',
        model_tier: 'strong',
        model_override: null,
        allowed_tools: '[]',
        behavior_settings: '{}',
        tags: '[]',
        built_in: true,
      },
    ])
    await orchestrator.initialize()
  })

  it('throws when name produces an empty slug (only special chars)', async () => {
    await expect(orchestrator.createAgent({ name: '!!!' })).rejects.toThrow(
      'Agent name must contain at least one alphanumeric character'
    )
  })

  it('throws when name is empty string', async () => {
    await expect(orchestrator.createAgent({ name: '' })).rejects.toThrow(
      'Agent name must contain at least one alphanumeric character'
    )
  })

  it('does not throw when name has at least one alphanumeric character', async () => {
    await expect(orchestrator.createAgent({ name: 'a' })).resolves.toBeDefined()
  })
})

// ─── Fix 4: agent_delete handler slug validation ──────────────────────────────

describe('agent_delete tool handler — slug validation before approval', () => {
  let db: ReturnType<typeof makeMockDb>
  let toolRegistry: ReturnType<typeof makeMockToolRegistry>

  beforeEach(async () => {
    db = makeMockDb()
    toolRegistry = makeMockToolRegistry()
    const orchestrator = new Orchestrator(db as any, makeMockModelRouter(), toolRegistry)

    ;(db.query as any).mockResolvedValue([
      {
        id: 'main',
        name: 'Main Agent',
        slug: 'main',
        lifecycle_type: 'always_on',
        wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none',
        agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main',
        status: 'active',
        created_by: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant',
        profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant',
        profile_description: 'Default',
        system_prompt: 'You are helpful.',
        model_tier: 'strong',
        model_override: null,
        allowed_tools: '[]',
        behavior_settings: '{}',
        tags: '[]',
        built_in: true,
      },
    ])
    await orchestrator.initialize()
    // Create a real agent so the delete handler can find it
    await orchestrator.createAgent({ name: 'Real Agent' })
  })

  function getHandler(name: string) {
    return toolRegistry._handlers.get(name)!
  }

  it('returns error (not approval) when slug is "main"', async () => {
    const handler = getHandler('agent_delete')
    const ctx = makeContext()
    const result = await handler({ slug: 'main' }, ctx) as any
    expect(result.error).toContain('Cannot delete the main agent')
    // Must NOT have inserted an approval row
    expect(db.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO approvals'),
      expect.anything()
    )
  })

  it('returns error (not approval) when agent does not exist', async () => {
    const handler = getHandler('agent_delete')
    const ctx = makeContext()
    const result = await handler({ slug: 'ghost-agent' }, ctx) as any
    expect(result.error).toContain('Agent not found: ghost-agent')
    expect(db.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO approvals'),
      expect.anything()
    )
  })

  it('inserts approval row when slug exists and is not "main"', async () => {
    const handler = getHandler('agent_delete')
    const ctx = makeContext()
    const result = await handler({ slug: 'real-agent' }, ctx) as any
    expect(result.status).toBe('pending_approval')
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO approvals'),
      expect.arrayContaining(['agent_delete'])
    )
  })
})

describe('Orchestrator.addWorkspacePath()', () => {
  let db: ReturnType<typeof makeMockDb>
  let orchestrator: Orchestrator

  beforeEach(async () => {
    db = makeMockDb()
    orchestrator = new Orchestrator(db as any, makeMockModelRouter(), makeMockToolRegistry())
    ;(db.query as any).mockResolvedValue([
      {
        id: 'main', name: 'Main Agent', slug: 'main',
        lifecycle_type: 'always_on', wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none', agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main', status: 'active',
        created_by: 'system', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant', profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant', profile_description: 'Default profile',
        system_prompt: 'You are helpful.', model_tier: 'strong', model_override: null,
        allowed_tools: '[]', behavior_settings: '{}', tags: '[]', built_in: true,
        additional_workspace_paths: [],
      },
    ])
    await orchestrator.initialize()
  })

  it('adds the path to the agent in-memory', async () => {
    await orchestrator.addWorkspacePath('main', '/custom/project')
    expect(orchestrator.getAgent('main')!.identity.additionalWorkspacePaths).toContain('/custom/project')
  })

  it('calls db.execute with array_append', async () => {
    await orchestrator.addWorkspacePath('main', '/custom/project')
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('array_append'),
      ['/custom/project', 'main']
    )
  })

  it('is a no-op if path is already present', async () => {
    await orchestrator.addWorkspacePath('main', '/custom/project')
    await orchestrator.addWorkspacePath('main', '/custom/project')
    const appendCalls = (db.execute as any).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('array_append')
    )
    expect(appendCalls).toHaveLength(1)
  })

  it('resolves relative paths to absolute before storing', async () => {
    await orchestrator.addWorkspacePath('main', 'relative/path')
    const paths = orchestrator.getAgent('main')!.identity.additionalWorkspacePaths
    expect(paths.some(p => p.startsWith('/') && p.endsWith('relative/path'))).toBe(true)
  })

  it('throws when agent does not exist', async () => {
    await expect(orchestrator.addWorkspacePath('ghost', '/some/path')).rejects.toThrow(
      'Agent not found: ghost'
    )
  })
})

describe('Orchestrator.removeWorkspacePath()', () => {
  let db: ReturnType<typeof makeMockDb>
  let orchestrator: Orchestrator

  beforeEach(async () => {
    db = makeMockDb()
    orchestrator = new Orchestrator(db as any, makeMockModelRouter(), makeMockToolRegistry())
    ;(db.query as any).mockResolvedValue([
      {
        id: 'main', name: 'Main Agent', slug: 'main',
        lifecycle_type: 'always_on', wake_mode: 'auto',
        current_profile_id: 'builtin-personal-assistant',
        shell_permission_level: 'none', agent_management_permission: 'approval_required',
        workspace_path: '/tmp/.agency/workspaces/main', status: 'active',
        created_by: 'system', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        profile_id: 'builtin-personal-assistant', profile_name: 'Personal Assistant',
        profile_slug: 'personal-assistant', profile_description: 'Default profile',
        system_prompt: 'You are helpful.', model_tier: 'strong', model_override: null,
        allowed_tools: '[]', behavior_settings: '{}', tags: '[]', built_in: true,
        additional_workspace_paths: [],
      },
    ])
    await orchestrator.initialize()
    // Seed a custom path on main and create a sub-agent
    await orchestrator.addWorkspacePath('main', '/custom/shared')
    await orchestrator.createAgent({ name: 'Sub Bot' })
  })

  it('removes path from agent in-memory', async () => {
    await orchestrator.removeWorkspacePath('main', '/custom/shared')
    expect(orchestrator.getAgent('main')!.identity.additionalWorkspacePaths).not.toContain('/custom/shared')
  })

  it('calls db.execute with array_remove', async () => {
    ;(db.execute as any).mockClear()
    await orchestrator.removeWorkspacePath('main', '/custom/shared')
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('array_remove'),
      ['/custom/shared', 'main']
    )
  })

  it('cascades removal to main agent when removing from a sub-agent', async () => {
    // Give sub-bot the same custom path
    await orchestrator.addWorkspacePath('sub-bot', '/custom/shared')
    ;(db.execute as any).mockClear()
    // Now remove from sub-bot — main should also lose it
    await orchestrator.removeWorkspacePath('sub-bot', '/custom/shared')
    // Verify in-memory state
    expect(orchestrator.getAgent('main')!.identity.additionalWorkspacePaths).not.toContain('/custom/shared')
    // Verify both DB calls were made (one for sub-bot, one for main cascade)
    const arrayCalls = (db.execute as any).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('array_remove')
    )
    expect(arrayCalls).toHaveLength(2)
  })

  it('does NOT cascade when removing directly from main', async () => {
    ;(db.execute as any).mockClear()
    await orchestrator.removeWorkspacePath('main', '/custom/shared')
    // Only one array_remove call: the removal from main itself
    const arrayCalls = (db.execute as any).mock.calls.filter((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('array_remove')
    )
    expect(arrayCalls).toHaveLength(1)
  })

  it('throws when trying to remove a sub-agent primary workspace from main', async () => {
    const subBot = orchestrator.getAgent('sub-bot')!
    const primaryPath = subBot.identity.workspacePath
    await expect(orchestrator.removeWorkspacePath('main', primaryPath)).rejects.toThrow(
      "Cannot remove an agent's primary workspace from the main agent"
    )
  })

  it('throws when agent does not exist', async () => {
    await expect(orchestrator.removeWorkspacePath('ghost', '/some/path')).rejects.toThrow(
      'Agent not found: ghost'
    )
  })
})
