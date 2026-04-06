# Orchestrator Workspace Labeling & System Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add classified workspace labeling to the orchestrator page, a Group Workspaces card to all agent pages, lock orchestrator name/profile, and create a system group at install time.

**Architecture:** New `GET /agents/:slug/workspaces` gateway route classifies an agent's workspace paths into primary/secondary(agent)/group categories. The dashboard uses this to drive labeled workspace and group workspace cards. A migration adds `is_system` to `workspace_groups`. The install script creates the system group after agents are provisioned.

**Tech Stack:** TypeScript, Fastify, Vitest, Next.js (React), PostgreSQL, node:fs/promises

---

## File Map

| File | Action |
|------|--------|
| `app/apps/gateway/migrations/029_system_group.sql` | Create — add `is_system` column |
| `app/apps/gateway/src/workspace-routes.ts` | Create — `GET /agents/:slug/workspaces` |
| `app/apps/gateway/src/workspace-routes.test.ts` | Create — vitest tests for the route |
| `app/apps/gateway/src/groups-routes.ts` | Modify — support `isSystem` flag on `POST /groups` |
| `app/apps/gateway/src/index.ts` | Modify — register workspace-routes |
| `app/services/orchestrator/src/index.ts` | Modify — sync orchestrator on `createAgent`/`deleteAgent` |
| `app/apps/dashboard/src/lib/api.ts` | Modify — add `AgentWorkspaceContext` type + `agents.workspaces()` |
| `app/apps/dashboard/src/app/dashboard/agents/[slug]/page.tsx` | Modify — lock name/profile, rework WorkspaceSection, add GroupWorkspacesSection |
| `cli/src/commands/install.ts` | Modify — create system group after agent provisioning |

---

## Task 1: Migration — add `is_system` to workspace_groups

**Files:**
- Create: `app/apps/gateway/migrations/029_system_group.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 029_system_group.sql
-- Mark a workspace group as the system-managed group (orchestrator-only visibility)

ALTER TABLE workspace_groups
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
```

Save to `app/apps/gateway/migrations/029_system_group.sql`.

- [ ] **Step 2: Verify migration file exists and is valid SQL**

```bash
cat app/apps/gateway/migrations/029_system_group.sql
```

Expected: prints the ALTER TABLE statement.

- [ ] **Step 3: Commit**

```bash
git add app/apps/gateway/migrations/029_system_group.sql
git commit -m "feat: add is_system column to workspace_groups"
```

---

## Task 2: Gateway — `GET /agents/:slug/workspaces` route + tests

**Files:**
- Create: `app/apps/gateway/src/workspace-routes.ts`
- Create: `app/apps/gateway/src/workspace-routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/apps/gateway/src/workspace-routes.test.ts`:

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerWorkspaceRoutes } from './workspace-routes.js'

function makeMockDb() {
  return {
    queryOne: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeApp(db = makeMockDb()) {
  const app = Fastify()
  registerWorkspaceRoutes(app, db as any)
  return { app, db }
}

const orchestratorRow = {
  slug: 'orchestrator',
  name: 'System',
  workspace_path: '/home/user/.agency/agents/orchestrator',
  additional_workspace_paths: [
    '/home/user/.agency/agents/aria',
    '/home/user/.agency/shared/system/workspace',
  ],
}

const ariaRow = {
  slug: 'aria',
  name: 'Aria',
  workspace_path: '/home/user/.agency/agents/aria',
  additional_workspace_paths: ['/home/user/.agency/shared/team/workspace'],
}

const systemGroup = {
  id: 'sys-1',
  name: 'Agency System',
  workspace_path: '/home/user/.agency/shared/system/workspace',
  is_system: true,
}

const teamGroup = {
  id: 'team-1',
  name: 'Team',
  workspace_path: '/home/user/.agency/shared/team/workspace',
  is_system: false,
}

describe('GET /agents/:slug/workspaces', () => {
  it('returns 404 for unknown agent', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(null)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/unknown/workspaces' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Agent not found')
  })

  it('classifies secondary paths for orchestrator', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(orchestratorRow)
    db.query
      .mockResolvedValueOnce([ariaRow])      // all other agents
      .mockResolvedValueOnce([systemGroup, teamGroup]) // all groups for orchestrator
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/orchestrator/workspaces' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.primary).toEqual({ path: '/home/user/.agency/agents/orchestrator' })
    expect(body.secondary).toHaveLength(1)
    expect(body.secondary[0]).toMatchObject({ path: '/home/user/.agency/agents/aria', agentName: 'Aria', agentSlug: 'aria' })
    expect(body.groupWorkspaces).toHaveLength(2)
    expect(body.groupWorkspaces[0]).toMatchObject({ groupId: 'sys-1', groupName: 'Agency System', isSystemGroup: true })
    expect(body.groupWorkspaces[1]).toMatchObject({ groupId: 'team-1', groupName: 'Team', isSystemGroup: false })
  })

  it('returns empty secondary for non-orchestrator agents', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(ariaRow)
    db.query
      .mockResolvedValueOnce([orchestratorRow]) // all other agents (aria is not in orchestrator's primary ws)
      .mockResolvedValueOnce([teamGroup])        // aria's groups (system excluded)
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/aria/workspaces' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.secondary).toHaveLength(0)
    expect(body.groupWorkspaces).toHaveLength(1)
    expect(body.groupWorkspaces[0]).toMatchObject({ groupId: 'team-1', isSystemGroup: false })
  })

  it('orchestrator sees all groups including system group', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(orchestratorRow)
    db.query
      .mockResolvedValueOnce([ariaRow])
      .mockResolvedValueOnce([systemGroup, teamGroup])
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/orchestrator/workspaces' })
    const body = res.json()
    expect(body.groupWorkspaces.some((g: { isSystemGroup: boolean }) => g.isSystemGroup)).toBe(true)
  })

  it('non-orchestrator agents do not see system group', async () => {
    const { app, db } = makeApp()
    db.queryOne.mockResolvedValueOnce(ariaRow)
    db.query
      .mockResolvedValueOnce([orchestratorRow])
      .mockResolvedValueOnce([teamGroup]) // query only returns non-system groups for members
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/agents/aria/workspaces' })
    const body = res.json()
    expect(body.groupWorkspaces.some((g: { isSystemGroup: boolean }) => g.isSystemGroup)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd app && pnpm --filter @agency/gateway test -- workspace-routes 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './workspace-routes.js'`

- [ ] **Step 3: Implement the route**

Create `app/apps/gateway/src/workspace-routes.ts`:

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'

interface AgentRow {
  slug: string
  name: string
  workspace_path: string
  additional_workspace_paths: string[] | null
}

interface GroupRow {
  id: string
  name: string
  workspace_path: string
  is_system: boolean
}

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
): Promise<void> {
  app.get<{ Params: { slug: string } }>('/agents/:slug/workspaces', async (request, reply) => {
    const { slug } = request.params

    const agent = await db.queryOne<AgentRow>(
      "SELECT slug, name, workspace_path, additional_workspace_paths FROM agent_identities WHERE slug=$1 AND status != 'deleted'",
      [slug]
    )
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    const primary = { path: agent.workspace_path }
    const additionalPaths = agent.additional_workspace_paths ?? []

    // Build map of other agents' primary workspace paths
    const otherAgents = await db.query<AgentRow>(
      "SELECT slug, name, workspace_path FROM agent_identities WHERE slug != $1 AND status != 'deleted'",
      [slug]
    )
    const agentByPath = new Map(otherAgents.map(a => [a.workspace_path, a]))

    const secondary = additionalPaths
      .filter(p => agentByPath.has(p))
      .map(p => {
        const a = agentByPath.get(p)!
        return { path: p, agentName: a.name, agentSlug: a.slug }
      })

    // Group workspaces: orchestrator sees all, others see only their memberships (excluding system)
    let groupRows: GroupRow[]
    if (slug === 'orchestrator') {
      groupRows = await db.query<GroupRow>(
        'SELECT id, name, workspace_path, is_system FROM workspace_groups ORDER BY is_system DESC, created_at ASC'
      )
    } else {
      groupRows = await db.query<GroupRow>(
        `SELECT g.id, g.name, g.workspace_path, g.is_system
         FROM workspace_groups g
         JOIN workspace_group_members m ON m.group_id = g.id
         JOIN agent_identities a ON a.id = m.agent_id
         WHERE a.slug = $1 AND g.is_system = FALSE`,
        [slug]
      )
    }

    const groupWorkspaces = groupRows.map(g => ({
      path: g.workspace_path,
      groupId: g.id,
      groupName: g.name,
      isSystemGroup: g.is_system,
    }))

    return reply.send({ primary, secondary, groupWorkspaces })
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd app && pnpm --filter @agency/gateway test -- workspace-routes 2>&1 | tail -20
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/apps/gateway/src/workspace-routes.ts app/apps/gateway/src/workspace-routes.test.ts
git commit -m "feat: add GET /agents/:slug/workspaces classified workspace endpoint"
```

---

## Task 3: Gateway — register workspace-routes + support isSystem on POST /groups

**Files:**
- Modify: `app/apps/gateway/src/index.ts` (line ~35 imports, line ~1938 registration)
- Modify: `app/apps/gateway/src/groups-routes.ts` (line 62 — POST /groups body)

- [ ] **Step 1: Register the new route in index.ts**

In `app/apps/gateway/src/index.ts`, add the import near line 35 alongside `registerGroupRoutes`:

```typescript
import { registerWorkspaceRoutes } from './workspace-routes.js'
```

Then near line 1938 alongside `await registerGroupRoutes(...)`, add:

```typescript
  await registerWorkspaceRoutes(app, db)
```

- [ ] **Step 2: Support isSystem in POST /groups**

In `app/apps/gateway/src/groups-routes.ts`, update the `POST /groups` body type (line 63) and the INSERT (line 74):

```typescript
  // POST /groups — create group
  app.post('/groups', async (req, reply) => {
    const body = req.body as { name: string; slug?: string; description?: string; hierarchyType?: string; goals?: string[]; isSystem?: boolean }
    if (!body.name) return reply.status(400).send({ error: 'name is required' })

    const id = randomUUID()
    const slug = body.slug ?? slugify(body.name)
    const workspacePath = join(sharedDir, slug, 'workspace')
    const memoryPath = join(sharedDir, slug, 'memory')

    await mkdir(workspacePath, { recursive: true })
    await mkdir(memoryPath, { recursive: true })

    await db.execute(
      `INSERT INTO workspace_groups (id, name, description, hierarchy_type, goals, workspace_path, memory_path, is_system, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
      [id, body.name, body.description ?? null, body.hierarchyType ?? 'flat', JSON.stringify(body.goals ?? []), workspacePath, memoryPath, body.isSystem ?? false, null]
    )

    const group = await db.queryOne<WorkspaceGroup>('SELECT * FROM workspace_groups WHERE id=$1', [id])
    void auditLogger.log({ action: 'group.create', actor: 'user', targetType: 'group', targetId: id, details: { name: body.name, slug } })
    return reply.status(201).send({ group })
  })
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd app && pnpm --filter @agency/gateway build 2>&1 | tail -10
```

Expected: exits cleanly with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/apps/gateway/src/index.ts app/apps/gateway/src/groups-routes.ts
git commit -m "feat: register workspace-routes, support isSystem on POST /groups"
```

---

## Task 4: Orchestrator — sync workspace on createAgent/deleteAgent

**Files:**
- Modify: `app/services/orchestrator/src/index.ts`
  - `createAgent()` near line 761
  - `deleteAgent()` near line 797

- [ ] **Step 1: Write failing test**

In `app/services/orchestrator/src/agent-management.test.ts`, find the existing `createAgent` test block and add a new test after it. First check what tests already exist:

```bash
grep -n "createAgent\|deleteAgent\|orchestrator" app/services/orchestrator/src/agent-management.test.ts | head -20
```

Then add these two tests to the appropriate describe blocks:

```typescript
it('adds new agent workspace to orchestrator additional paths', async () => {
  const db = makeMockDb()
  // Return orchestrator agent on queryOne calls for addWorkspacePath
  db.queryOne
    .mockResolvedValueOnce(null) // ensureOrchestratorAgent check
    .mockResolvedValueOnce(null) // ensureMainAgent check
    .mockResolvedValueOnce(null) // profile lookup
    .mockResolvedValueOnce({ additional_workspace_paths: [] }) // main addWorkspacePath
    .mockResolvedValueOnce({ additional_workspace_paths: [] }) // orchestrator addWorkspacePath

  const orchestrator = new Orchestrator({ db, modelRouter: makeMockModelRouter(), toolRegistry: makeMockToolRegistry(), agencyDir: '/tmp/.agency' })
  await orchestrator.createAgent({ name: 'Aria', profileSlug: 'default', lifecycleType: 'dormant' })

  const execCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
  const workspaceUpdates = execCalls.filter((c: unknown[]) =>
    typeof c[0] === 'string' && c[0].includes('additional_workspace_paths') && c[0].includes('array_append')
  )
  // Should have called addWorkspacePath for both 'main' and 'orchestrator'
  expect(workspaceUpdates.length).toBeGreaterThanOrEqual(2)
})

it('removes deleted agent workspace from orchestrator additional paths', async () => {
  const db = makeMockDb()
  const ariaId = 'aria-id'
  db.query.mockResolvedValueOnce([
    { id: ariaId, slug: 'aria', name: 'Aria', workspace_path: '/tmp/.agency/agents/aria', additional_workspace_paths: [], lifecycle_type: 'dormant', wake_mode: 'auto', current_profile_id: 'default', shell_permission_level: 'none', agent_management_permission: 'approval_required', agency_permissions: '{}', autonomous_mode: false, status: 'active', created_by: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), profile_slug: 'default' }
  ])
  db.queryOne
    .mockResolvedValueOnce(null) // orchestrator
    .mockResolvedValueOnce(null) // main
    .mockResolvedValueOnce({ additional_workspace_paths: ['/tmp/.agency/agents/aria'] }) // main removeWorkspacePath
    .mockResolvedValueOnce({ additional_workspace_paths: ['/tmp/.agency/agents/aria'] }) // orchestrator removeWorkspacePath

  const orchestrator = new Orchestrator({ db, modelRouter: makeMockModelRouter(), toolRegistry: makeMockToolRegistry(), agencyDir: '/tmp/.agency' })
  await orchestrator.loadAgents()
  await orchestrator.deleteAgent({ slug: 'aria' })

  const execCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
  const workspaceRemovals = execCalls.filter((c: unknown[]) =>
    typeof c[0] === 'string' && c[0].includes('additional_workspace_paths') && c[0].includes('array_remove')
  )
  expect(workspaceRemovals.length).toBeGreaterThanOrEqual(2)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd app && pnpm --filter @agency/orchestrator test 2>&1 | tail -20
```

Expected: the new tests FAIL.

- [ ] **Step 3: Add orchestrator sync to createAgent**

In `app/services/orchestrator/src/index.ts`, find line ~761:

```typescript
    // Auto-grant main agent access to new agent's workspace
    await this.addWorkspacePath('main', workspacePath)
```

Replace with:

```typescript
    // Auto-grant main and orchestrator access to new agent's workspace
    await this.addWorkspacePath('main', workspacePath)
    await this.addWorkspacePath('orchestrator', workspacePath).catch(() => {})
```

- [ ] **Step 4: Add orchestrator sync to deleteAgent**

In `app/services/orchestrator/src/index.ts`, find line ~796:

```typescript
    // Revoke main agent's access to this workspace
    await this.removeWorkspacePath('main', identity.workspacePath).catch(() => {})
```

Replace with:

```typescript
    // Revoke main and orchestrator access to this workspace
    await this.removeWorkspacePath('main', identity.workspacePath).catch(() => {})
    await this.removeWorkspacePath('orchestrator', identity.workspacePath).catch(() => {})
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd app && pnpm --filter @agency/orchestrator test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/orchestrator/src/index.ts app/services/orchestrator/src/agent-management.test.ts
git commit -m "feat: sync orchestrator workspace paths on agent create/delete"
```

---

## Task 5: Dashboard API — add AgentWorkspaceContext type and agents.workspaces()

**Files:**
- Modify: `app/apps/dashboard/src/lib/api.ts`

- [ ] **Step 1: Add type and API call**

In `app/apps/dashboard/src/lib/api.ts`, after the `Agent` interface (around line 248), add:

```typescript
export interface AgentWorkspaceSecondary {
  path: string
  agentName: string
  agentSlug: string
}

export interface AgentWorkspaceGroup {
  path: string
  groupId: string
  groupName: string
  isSystemGroup: boolean
}

export interface AgentWorkspaceContext {
  primary: { path: string }
  secondary: AgentWorkspaceSecondary[]
  groupWorkspaces: AgentWorkspaceGroup[]
}
```

Then in the `agents` object (after `addWorkspace` around line 278), add:

```typescript
  workspaces: (slug: string) =>
    request<AgentWorkspaceContext>(`/agents/${slug}/workspaces`),
```

- [ ] **Step 2: Build dashboard to confirm no TypeScript errors**

```bash
cd app && pnpm --filter @agency/dashboard build 2>&1 | tail -10
```

Expected: build completes cleanly.

- [ ] **Step 3: Commit**

```bash
git add app/apps/dashboard/src/lib/api.ts
git commit -m "feat: add AgentWorkspaceContext type and agents.workspaces() API call"
```

---

## Task 6: Dashboard — orchestrator locks, workspace labeling, group workspace card

**Files:**
- Modify: `app/apps/dashboard/src/app/dashboard/agents/[slug]/page.tsx`

This task has three logical sub-changes in the same file:
1. Lock name/profile fields for orchestrator
2. Rework WorkspaceSection to use classified workspace context
3. Add GroupWorkspacesSection below WorkspaceSection

- [ ] **Step 1: Update the import line to include new API types**

At the top of the file (line 12), add `type AgentWorkspaceContext, type AgentWorkspaceSecondary, type AgentWorkspaceGroup` to the import:

```typescript
import { agents, workspace, models, routingProfiles, skills, agentSkills, tools, mcp, agentMcp, type Agent, type AgentWorkspaceContext, type AgentWorkspaceSecondary, type AgentWorkspaceGroup, type WorkspaceFile, type AgentModelConfig, type RoutingProfile, type Skill, type AgentSkill, type Tool, type McpServer, type AgentMcpServer } from '@/lib/api'
```

- [ ] **Step 2: Lock name field for orchestrator in OverviewTab**

In OverviewTab (line ~337), the Name row currently renders an `<input>` unconditionally. Replace:

```tsx
        <Row label="Name">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm text-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 min-w-[220px]"
          />
        </Row>
```

With:

```tsx
        <Row label="Name">
          {isOrchestrator ? (
            <span className="text-sm text-gray-300 min-w-[220px]">{agent.identity.name}</span>
          ) : (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 min-w-[220px]"
            />
          )}
        </Row>
```

- [ ] **Step 3: Hide profile section for orchestrator**

The Profile section (line ~353) currently renders unconditionally. Wrap it:

```tsx
      {/* Profile */}
      {!isOrchestrator && (
        <Section title="Profile">
          <Row label="Active profile">
            {profiles.length > 0 ? (
              <select
                defaultValue={agent.profile?.slug ?? ''}
                onChange={e => void switchProfile(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 min-w-[220px]"
              >
                {profiles.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </select>
            ) : (
              <span className="text-sm text-gray-400">{agent.profile?.name ?? '—'}</span>
            )}
          </Row>
        </Section>
      )}
```

- [ ] **Step 4: Fetch workspace context in OverviewTab and pass to sections**

In OverviewTab, after the existing state declarations (line ~296), add:

```typescript
  const [workspaceCtx, setWorkspaceCtx] = useState<AgentWorkspaceContext | null>(null)

  useEffect(() => {
    agents.workspaces(slug).then(setWorkspaceCtx).catch(() => {})
  }, [slug])
```

Then update the WorkspaceSection call (line ~403):

```tsx
      {/* Workspace */}
      <WorkspaceSection agent={agent} slug={slug} onReload={onReload} workspaceCtx={workspaceCtx} />

      {/* Group Workspaces */}
      <GroupWorkspacesSection workspaceCtx={workspaceCtx} isOrchestrator={isOrchestrator} />
```

- [ ] **Step 5: Rework WorkspaceSection to use workspace context**

Replace the entire `WorkspaceSection` function (lines ~176–278) with:

```tsx
// ─── Workspace Section ────────────────────────────────────────────────────────

function WorkspaceSection({ agent, slug, onReload, workspaceCtx }: {
  agent: Agent
  slug: string
  onReload: () => void
  workspaceCtx: AgentWorkspaceContext | null
}) {
  const isOrchestrator = slug === 'orchestrator'
  const [newPath, setNewPath] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function handleAdd() {
    const path = newPath.trim()
    if (!path) return
    setAdding(true); setErr(''); setMsg('')
    try {
      await agents.addWorkspace(slug, path)
      setNewPath('')
      setMsg('Workspace added')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add workspace')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(path: string) {
    if (removing.has(path)) return
    setRemoving(prev => new Set(prev).add(path))
    setErr(''); setMsg('')
    try {
      await agents.removeWorkspace(slug, path)
      setMsg('Workspace removed')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to remove workspace')
    } finally {
      setRemoving(prev => { const s = new Set(prev); s.delete(path); return s })
    }
  }

  const locked = new Set(agent.lockedWorkspacePaths ?? [])
  const additional = agent.identity.additionalWorkspacePaths ?? []

  return (
    <Section title="Workspace">
      {/* Primary workspace */}
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        <span className="text-sm text-gray-400 shrink-0 w-44">Primary</span>
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="font-mono text-xs text-gray-400 truncate">{agent.identity.workspacePath}</span>
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">primary</span>
        </div>
      </div>

      {isOrchestrator ? (
        /* Orchestrator: show secondary (agent) workspaces, locked */
        workspaceCtx?.secondary.map((ws: AgentWorkspaceSecondary) => (
          <div key={ws.path} className="flex items-center justify-between px-4 py-2.5 gap-4">
            <span className="font-mono text-xs text-gray-400 flex-1 truncate">{ws.path}</span>
            <div className="shrink-0 flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">secondary</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/30 text-indigo-400 border border-indigo-800/40">{ws.agentName}</span>
            </div>
          </div>
        ))
      ) : (
        /* Other agents: show additional paths with remove buttons */
        additional.map(path => (
          <div key={path} className="flex items-center justify-between px-4 py-2.5 gap-4">
            <span className="font-mono text-xs text-gray-400 flex-1 truncate">{path}</span>
            <div className="shrink-0 flex items-center gap-2">
              {locked.has(path) ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">locked</span>
              ) : (
                <button
                  onClick={() => void handleRemove(path)}
                  disabled={removing.has(path)}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Remove workspace"
                >
                  {removing.has(path) ? '…' : '✕'}
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {/* Add row — hidden for orchestrator */}
      {!isOrchestrator && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800">
          <input
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd() }}
            placeholder="/absolute/path/to/workspace"
            className="flex-1 bg-gray-800 border border-gray-700 text-xs text-gray-200 font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 placeholder:text-gray-600"
          />
          <button
            onClick={() => void handleAdd()}
            disabled={adding || !newPath.trim()}
            style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
            className="text-xs px-3 py-1.5 rounded disabled:opacity-40 transition-opacity hover:opacity-90 shrink-0"
          >
            {adding ? '…' : '+ Add'}
          </button>
        </div>
      )}

      {(msg || err) && (
        <div className="px-4 pb-2">
          {msg && <span className="text-xs text-green-400">{msg}</span>}
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      )}
    </Section>
  )
}
```

- [ ] **Step 6: Add GroupWorkspacesSection component**

Add this function before the `WorkspaceSection` function (around line 174):

```tsx
// ─── Group Workspaces Section ──────────────────────────────────────────────────

function GroupWorkspacesSection({ workspaceCtx }: { workspaceCtx: AgentWorkspaceContext | null }) {
  const groups = workspaceCtx?.groupWorkspaces ?? []

  return (
    <Section title="Group Workspaces">
      {groups.length === 0 ? (
        <div className="px-4 py-3">
          <span className="text-xs text-gray-600">No group workspaces</span>
        </div>
      ) : (
        groups.map((gw: AgentWorkspaceGroup) => (
          <div key={gw.groupId} className="flex items-center justify-between px-4 py-2.5 gap-4">
            <div className="flex-1 min-w-0">
              <a
                href={`/dashboard/groups/${gw.groupId}`}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                {gw.groupName}
              </a>
              <div className="font-mono text-xs text-gray-600 truncate mt-0.5">{gw.path}</div>
            </div>
            <div className="shrink-0">
              {gw.isSystemGroup ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">primary group</span>
              ) : workspaceCtx?.secondary !== undefined && 'secondary' in workspaceCtx ? (
                // orchestrator page — show tertiary
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">tertiary</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800/40">group workspace</span>
              )}
            </div>
          </div>
        ))
      )}
    </Section>
  )
}
```

Wait — the badge logic for non-orchestrator vs orchestrator needs to be cleaner. Pass `isOrchestrator` as a prop:

```tsx
// ─── Group Workspaces Section ──────────────────────────────────────────────────

function GroupWorkspacesSection({ workspaceCtx, isOrchestrator }: {
  workspaceCtx: AgentWorkspaceContext | null
  isOrchestrator: boolean
}) {
  const groupList = workspaceCtx?.groupWorkspaces ?? []

  return (
    <Section title="Group Workspaces">
      {groupList.length === 0 ? (
        <div className="px-4 py-3">
          <span className="text-xs text-gray-600">No group workspaces</span>
        </div>
      ) : (
        groupList.map((gw: AgentWorkspaceGroup) => (
          <div key={gw.groupId} className="flex items-center justify-between px-4 py-2.5 gap-4">
            <div className="flex-1 min-w-0">
              <a
                href={`/dashboard/groups/${gw.groupId}`}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {gw.groupName}
              </a>
              <div className="font-mono text-xs text-gray-600 truncate mt-0.5">{gw.path}</div>
            </div>
            <div className="shrink-0">
              {gw.isSystemGroup ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">primary group</span>
              ) : isOrchestrator ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">tertiary</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800/40">group workspace</span>
              )}
            </div>
          </div>
        ))
      )}
    </Section>
  )
}
```


- [ ] **Step 7: Build dashboard to verify no TypeScript errors**

```bash
cd app && pnpm --filter @agency/dashboard build 2>&1 | tail -15
```

Expected: build completes cleanly.

- [ ] **Step 8: Commit**

```bash
git add app/apps/dashboard/src/app/dashboard/agents/[slug]/page.tsx
git commit -m "feat: lock orchestrator name/profile, labeled workspace cards, group workspace card"
```

---

## Task 7: Install script — create system group after agent provisioning

**Files:**
- Modify: `cli/src/commands/install.ts`

- [ ] **Step 1: Add seedSystemGroup function**

In `cli/src/commands/install.ts`, after the `seedAgents` function (around line 662), add:

```typescript
async function seedSystemGroup(): Promise<void> {
  // Create the system-wide group — orchestrator-only visibility
  const res = await gatewayFetch('/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Agency System',
      slug: 'system',
      description: 'System-wide workspace managed by the orchestrator. Not visible to other agents.',
      isSystem: true,
    }),
  })
  const data = await res.json() as { group?: { workspacePath?: string; workspace_path?: string } }
  const workspacePath = data.group?.workspacePath ?? data.group?.workspace_path
  if (workspacePath) {
    // Grant orchestrator file access to the system group workspace
    await gatewayFetch('/agents/orchestrator/workspaces', {
      method: 'POST',
      body: JSON.stringify({ path: workspacePath }),
    })
  }
}
```

- [ ] **Step 2: Call seedSystemGroup after seedAgents in the run() method**

Find the block around line 814:

```typescript
      process.stdout.write(chalk.gray('  Creating default agents... '))
      await seedAgents(agentName)
      this.log(chalk.green('done'))
```

Replace with:

```typescript
      process.stdout.write(chalk.gray('  Creating default agents... '))
      await seedAgents(agentName)
      this.log(chalk.green('done'))

      process.stdout.write(chalk.gray('  Creating system workspace group... '))
      await seedSystemGroup()
      this.log(chalk.green('done'))
```

- [ ] **Step 3: Build CLI to verify no TypeScript errors**

```bash
cd cli && npm run build 2>&1 | tail -10
```

Expected: build completes cleanly.

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/install.ts
git commit -m "feat: create system workspace group during agency install"
```

---

## Task 8: Full build verification + push

- [ ] **Step 1: Run all gateway tests**

```bash
cd app && pnpm --filter @agency/gateway test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run all orchestrator tests**

```bash
cd app && pnpm --filter @agency/orchestrator test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Build all packages**

```bash
cd app && pnpm build 2>&1 | tail -15
```

Expected: all packages build cleanly.

- [ ] **Step 4: Push to GitHub**

```bash
git push
```
