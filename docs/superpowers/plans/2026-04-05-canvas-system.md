# Agency Canvas System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully interactive canvas layer for Agency — three purpose-built surfaces (Groups, Network, Agent) where users can manage the entire system visually without touching the dashboard forms.

**Architecture:** Shared component library in `components/canvas/` consumed by three canvas surfaces. All surfaces share node types, a slide-in side panel, and a context menu system. Each surface has its own layout algorithm (grid for groups, Dagre for network, radial for agent). Canvas mutations call the existing gateway API and update local ReactFlow state — no page reloads, no new API endpoints.

**Tech Stack:** `@xyflow/react` (already installed), `@dagrejs/dagre` (to install), Next.js 16 client components, Tailwind CSS 4

---

## Progress

**Last updated:** 2026-04-05 | **Head commit:** `92bb99e`

| Task | Status | Commits |
|---|---|---|
| Task 1: Install dagre + redesign node types | ✅ Complete | `de48ed8`, `2e3601a` |
| Task 2: Create canvas-layout.ts | ✅ Complete | `04189c4`, `835ca74` |
| Task 3: Update canvas-toolbar.tsx | ✅ Complete | `c42c26b` |
| Task 4: Create CanvasSidePanel | ✅ Complete | `3120af9`, `92bb99e` |
| Task 5: Create CanvasContextMenu | ⬜ Not started | — |
| Task 6: Rebuild GroupsCanvas | ⬜ Not started | — |
| Task 7: Rebuild Network Map | ⬜ Not started | — |
| Task 8: Extract and rebuild AgentCanvas | ⬜ Not started | — |
| Task 9: Full build verification + push | ⬜ Not started | — |

**Files completed:**
- `components/canvas/node-types.tsx` — 6 node types, NodeProps generics, HIERARCHY_COLOR hoisted ✅
- `components/canvas/canvas-layout.ts` — Dagre + radial layout, localStorage persistence, null guards ✅
- `components/canvas/canvas-toolbar.tsx` — Live Mode, Reset Layout, Add Group/Agent buttons ✅
- `components/canvas/canvas-side-panel.tsx` — all 5 panel variants, error handling, Next.js Link ✅

**Next task to execute: Task 5 — Create CanvasContextMenu**

---

## File Map

**Create:**
- `app/apps/dashboard/src/components/canvas/canvas-layout.ts` — Dagre + manual layout functions for all three surfaces; localStorage position persistence
- `app/apps/dashboard/src/components/canvas/canvas-side-panel.tsx` — slide-in right panel for node detail/edit
- `app/apps/dashboard/src/components/canvas/canvas-context-menu.tsx` — right-click context menu for nodes and pane
- `app/apps/dashboard/src/app/dashboard/agents/[slug]/AgentCanvas.tsx` — extracted, rebuilt agent canvas tab

**Modify:**
- `app/apps/dashboard/src/components/canvas/node-types.tsx` — full redesign of all 6 node types
- `app/apps/dashboard/src/components/canvas/canvas-toolbar.tsx` — add Layout Reset, Live Mode, Add buttons
- `app/apps/dashboard/src/app/dashboard/groups/GroupsCanvas.tsx` — rebuild with parent/child nesting, drag-drop, context menu, edges
- `app/apps/dashboard/src/app/dashboard/groups/page.tsx` — fetch group member data, pass to GroupsCanvas
- `app/apps/dashboard/src/app/dashboard/network/page.tsx` — rebuild with full NetworkCanvas implementation
- `app/apps/dashboard/src/app/dashboard/agents/[slug]/page.tsx` — import new AgentCanvas, remove inline stub

---

## Task 1: Install @dagrejs/dagre and redesign node types

**Files:**
- Modify: `app/apps/dashboard/package.json`
- Modify: `app/apps/dashboard/src/components/canvas/node-types.tsx`

- [ ] **Step 1: Install dagre**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm add @dagrejs/dagre
pnpm add -D @types/dagre
```

Expected: no errors, `@dagrejs/dagre` appears in `package.json` dependencies.

- [ ] **Step 2: Replace node-types.tsx with the full redesigned implementation**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { Handle, Position, NodeResizer, NodeToolbar, useReactFlow, type NodeProps } from '@xyflow/react'
import { useCallback } from 'react'

// ─── Shared node helpers ─────────────────────────────────────────────────────

function StatusDot({ status }: { status?: string }) {
  const color = status === 'active' ? 'bg-emerald-400' : 'bg-gray-500'
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
}

function InitialAvatar({ name, color = 'bg-gray-600' }: { name: string; color?: string }) {
  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${color}`}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function PermissionBadge({ level }: { level?: string }) {
  const color = level === 'autonomous' ? 'bg-green-900/60 text-green-300 border-green-700/40'
    : level === 'request' ? 'bg-yellow-900/60 text-yellow-300 border-yellow-700/40'
    : 'bg-gray-900/60 text-gray-400 border-gray-700/40'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${color}`}>{level ?? 'deny'}</span>
  )
}

// ─── GroupNode ─────────────────────────────────────────────────────────────────

export interface GroupNodeData {
  label: string
  hierarchyType: string
  memberCount: number
  goals: string[]
  onOpenPanel?: () => void
}

export function GroupNode({ data, selected }: NodeProps) {
  const d = data as GroupNodeData
  const hierarchyColor: Record<string, string> = {
    flat:         'text-blue-300 bg-blue-900/60 border-blue-700/40',
    hierarchical: 'text-purple-300 bg-purple-900/60 border-purple-700/40',
    council:      'text-amber-300 bg-amber-900/60 border-amber-700/40',
  }
  const borderSelected = selected ? 'border-blue-400' : 'border-blue-700/60'

  return (
    <div
      className={`bg-blue-950/30 border-2 ${borderSelected} rounded-xl w-full h-full`}
      style={{ minWidth: 240, minHeight: 180 }}
    >
      <NodeResizer
        minWidth={240}
        minHeight={180}
        isVisible={selected}
        color="#3b82f6"
        lineStyle={{ borderWidth: 2 }}
      />
      <NodeToolbar position={Position.Top} isVisible={selected}>
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 shadow-lg">
          <button
            className="px-2 py-1 text-xs text-blue-300 hover:bg-gray-700 rounded"
            onClick={() => d.onOpenPanel?.()}
          >
            Edit
          </button>
          <button className="px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded">
            Add Member
          </button>
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} className="!bg-blue-600 !border-blue-400" />
      <div className="p-3 border-b border-blue-800/40 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-blue-800/70 flex items-center justify-center text-blue-300 text-xs font-bold flex-shrink-0">
          G
        </div>
        <span className="text-blue-100 text-sm font-semibold truncate flex-1">{d.label}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border ${hierarchyColor[d.hierarchyType] ?? hierarchyColor.flat}`}>
          {d.hierarchyType}
        </span>
      </div>
      <div className="px-3 pt-2 pb-1">
        <span className="text-xs text-blue-300/60">{d.memberCount} member{d.memberCount !== 1 ? 's' : ''}</span>
        {d.goals?.slice(0, 2).map((g, i) => (
          <p key={i} className="text-xs text-blue-200/40 mt-0.5 truncate">· {g}</p>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-600 !border-blue-400" />
    </div>
  )
}

// ─── AgentNode ────────────────────────────────────────────────────────────────

export interface AgentNodeData {
  label: string
  slug: string
  status: string
  profile?: string
  isOrchestrator?: boolean
  onOpenPanel?: () => void
  onNavigate?: () => void
}

export function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData
  const borderColor = d.isOrchestrator
    ? selected ? 'border-purple-400' : 'border-purple-600/70'
    : d.status === 'active'
      ? selected ? 'border-emerald-400' : 'border-emerald-600/70'
      : selected ? 'border-gray-400' : 'border-gray-600/50'
  const avatarColor = d.isOrchestrator ? 'bg-purple-700' : d.status === 'active' ? 'bg-emerald-800' : 'bg-gray-700'

  return (
    <div className={`bg-gray-800/90 border-2 ${borderColor} rounded-xl p-3 min-w-[160px] shadow-md`}>
      <NodeToolbar position={Position.Top} isVisible={selected}>
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 shadow-lg">
          <button
            className="px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded"
            onClick={() => d.onOpenPanel?.()}
          >
            Settings
          </button>
          <button
            className="px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded"
            onClick={() => d.onNavigate?.()}
          >
            Canvas
          </button>
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !border-gray-400" />
      <div className="flex items-center gap-2.5">
        <InitialAvatar name={d.label} color={avatarColor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-white text-sm font-medium truncate">{d.label}</span>
            <StatusDot status={d.status} />
          </div>
          <span className="text-gray-500 text-xs font-mono">{d.slug}</span>
        </div>
      </div>
      {d.profile && (
        <div className="mt-2 pt-2 border-t border-gray-700/60">
          <span className="text-xs text-gray-500">{d.profile}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !border-gray-400" />
    </div>
  )
}

// ─── OrchestratorNode ─────────────────────────────────────────────────────────

export interface OrchestratorNodeData {
  label: string
  status: string
}

export function OrchestratorNode({ data, selected }: NodeProps) {
  const d = data as OrchestratorNodeData
  const borderColor = selected ? 'border-purple-400' : 'border-purple-500/80'

  return (
    <div className={`bg-purple-950/60 border-2 ${borderColor} rounded-xl p-3 min-w-[180px] shadow-lg`}>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !border-purple-400" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-purple-700 flex items-center justify-center text-purple-200 text-sm font-bold flex-shrink-0">
          S
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-purple-100 text-sm font-semibold">{d.label}</span>
            <StatusDot status={d.status} />
          </div>
          <span className="text-purple-400/60 text-xs">orchestrator</span>
        </div>
      </div>
    </div>
  )
}

// ─── SkillNode ────────────────────────────────────────────────────────────────

export interface SkillNodeData {
  label: string
  version: string
  skillType?: string
  onOpenPanel?: () => void
}

export function SkillNode({ data, selected }: NodeProps) {
  const d = data as SkillNodeData
  const border = selected ? 'border-teal-400' : 'border-teal-700/60'

  return (
    <div className={`bg-teal-950/40 border-2 ${border} rounded-xl p-3 min-w-[140px] shadow-md`}>
      <NodeToolbar position={Position.Top} isVisible={selected}>
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 shadow-lg">
          <button
            className="px-2 py-1 text-xs text-teal-300 hover:bg-gray-700 rounded"
            onClick={() => d.onOpenPanel?.()}
          >
            Detail
          </button>
          <button className="px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded">
            Detach
          </button>
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} className="!bg-teal-600 !border-teal-400" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-teal-800/70 flex items-center justify-center text-teal-300 text-xs font-bold flex-shrink-0">
          SK
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-teal-100 text-sm font-medium block truncate">{d.label}</span>
          <span className="text-teal-400/60 text-xs">{d.version}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-teal-600 !border-teal-400" />
    </div>
  )
}

// ─── ToolNode ─────────────────────────────────────────────────────────────────

export interface ToolNodeData {
  label: string
  toolType: string
  permissionLevel?: string
  onOpenPanel?: () => void
}

export function ToolNode({ data, selected }: NodeProps) {
  const d = data as ToolNodeData
  const border = selected ? 'border-slate-400' : 'border-slate-600/60'

  return (
    <div className={`bg-slate-800/60 border-2 ${border} rounded-xl p-3 min-w-[130px] shadow-md`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !border-slate-400" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold flex-shrink-0">
          T
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-slate-100 text-xs font-mono block truncate">{d.label}</span>
          <span className="text-slate-500 text-xs">{d.toolType}</span>
        </div>
      </div>
      {d.permissionLevel && (
        <div className="mt-2">
          <PermissionBadge level={d.permissionLevel} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !border-slate-400" />
    </div>
  )
}

// ─── WorkspaceNode ────────────────────────────────────────────────────────────

export interface WorkspaceNodeData {
  label: string
  path: string
  onOpenPanel?: () => void
}

export function WorkspaceNode({ data, selected }: NodeProps) {
  const d = data as WorkspaceNodeData
  const border = selected ? 'border-amber-400' : 'border-amber-700/60'

  return (
    <div className={`bg-amber-950/30 border-2 ${border} rounded-xl p-3 min-w-[160px] shadow-md`}>
      <NodeToolbar position={Position.Top} isVisible={selected}>
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 shadow-lg">
          <button
            className="px-2 py-1 text-xs text-amber-300 hover:bg-gray-700 rounded"
            onClick={() => d.onOpenPanel?.()}
          >
            Browse
          </button>
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Top} className="!bg-amber-600 !border-amber-400" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-amber-800/70 flex items-center justify-center text-amber-300 text-xs font-bold flex-shrink-0">
          W
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-amber-100 text-sm font-medium block truncate">{d.label}</span>
          <span className="text-amber-500/70 text-xs font-mono block truncate">{d.path}</span>
        </div>
      </div>
    </div>
  )
}

// ─── NODE_TYPES map ───────────────────────────────────────────────────────────

export const NODE_TYPES = {
  groupNode:         GroupNode,
  agentNode:         AgentNode,
  orchestratorNode:  OrchestratorNode,
  skillNode:         SkillNode,
  toolNode:          ToolNode,
  workspaceNode:     WorkspaceNode,
} as const
```

- [ ] **Step 3: Build the dashboard and verify no TypeScript errors**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm build 2>&1 | tail -20
```

Expected: Build succeeds. If TypeScript errors appear in node-types.tsx, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/package.json app/apps/dashboard/src/components/canvas/node-types.tsx app/apps/dashboard/pnpm-lock.yaml
git commit -m "feat(canvas): install dagre, redesign all node types with n8n-quality styling"
```

---

## Task 2: Create canvas-layout.ts

**Files:**
- Create: `app/apps/dashboard/src/components/canvas/canvas-layout.ts`

- [ ] **Step 1: Create canvas-layout.ts**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { WorkspaceGroup, Agent, AgentSkill } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupWithMembers extends WorkspaceGroup {
  members: { agentId: string; role: string }[]
}

// ─── LocalStorage position persistence ────────────────────────────────────────

export function loadSavedPositions(surfaceId: string): Record<string, { x: number; y: number }> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(`canvas-positions-${surfaceId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function savePositions(surfaceId: string, nodes: Node[]): void {
  if (typeof window === 'undefined') return
  const positions: Record<string, { x: number; y: number }> = {}
  for (const node of nodes) {
    positions[node.id] = node.position
  }
  localStorage.setItem(`canvas-positions-${surfaceId}`, JSON.stringify(positions))
}

export function clearSavedPositions(surfaceId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(`canvas-positions-${surfaceId}`)
}

function applyOverrides(nodes: Node[], saved: Record<string, { x: number; y: number }>): Node[] {
  return nodes.map(n => saved[n.id] ? { ...n, position: saved[n.id] } : n)
}

// ─── Groups canvas layout ─────────────────────────────────────────────────────
// Manual grid: groups laid out in rows, agents nested inside their group
// container. Unassigned agents appear in a row below all groups.

const GROUP_MIN_W = 260
const GROUP_MIN_H = 200
const GROUP_PAD_X = 40
const GROUP_PAD_Y = 60
const AGENT_W = 170
const AGENT_H = 80
const AGENT_GAP = 16

function groupDimensions(memberCount: number): { w: number; h: number } {
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(memberCount))))
  const rows = Math.max(1, Math.ceil(memberCount / cols))
  const w = Math.max(GROUP_MIN_W, GROUP_PAD_X * 2 + cols * (AGENT_W + AGENT_GAP) - AGENT_GAP)
  const h = Math.max(GROUP_MIN_H, GROUP_PAD_Y + rows * (AGENT_H + AGENT_GAP) + GROUP_PAD_Y * 0.5)
  return { w, h }
}

export function computeGroupsLayout(
  groupsWithMembers: GroupWithMembers[],
  allAgents: Agent[],
  surfaceId = 'groups'
): { nodes: Node[]; edges: Edge[] } {
  const saved = loadSavedPositions(surfaceId)
  const agentById = new Map(allAgents.map(a => [a.identity.id, a]))
  const assignedAgentIds = new Set(groupsWithMembers.flatMap(g => g.members.map(m => m.agentId)))

  // ── Layout groups in a wrapping grid ──────────────────────────────────────
  const GROUPS_PER_ROW = 3
  const GROUP_COL_GAP = 40
  const GROUP_ROW_GAP = 60

  let colX = 40
  let rowY = 40
  let maxRowH = 0
  let col = 0

  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const group of groupsWithMembers) {
    const { w, h } = groupDimensions(group.members.length)

    if (col > 0 && col % GROUPS_PER_ROW === 0) {
      colX = 40
      rowY += maxRowH + GROUP_ROW_GAP
      maxRowH = 0
    }

    const groupId = `group-${group.id}`
    nodes.push({
      id: groupId,
      type: 'groupNode',
      position: { x: colX, y: rowY },
      style: { width: w, height: h },
      data: {
        label: group.name,
        hierarchyType: group.hierarchyType,
        memberCount: group.members.length,
        goals: group.goals,
      },
    })

    // Position agents inside the group
    const agentCols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(group.members.length))))
    group.members.forEach((member, i) => {
      const agent = agentById.get(member.agentId)
      if (!agent) return
      const col2 = i % agentCols
      const row2 = Math.floor(i / agentCols)
      nodes.push({
        id: `agent-${agent.identity.id}`,
        type: 'agentNode',
        parentId: groupId,
        extent: 'parent' as const,
        position: {
          x: GROUP_PAD_X / 2 + col2 * (AGENT_W + AGENT_GAP),
          y: GROUP_PAD_Y + row2 * (AGENT_H + AGENT_GAP),
        },
        data: {
          label: agent.identity.name,
          slug: agent.identity.slug,
          status: agent.identity.status,
          profile: agent.profile.name,
        },
      })
      edges.push({
        id: `membership-${groupId}-${agent.identity.id}`,
        source: groupId,
        target: `agent-${agent.identity.id}`,
        type: 'membership',
        style: { stroke: '#3b82f6', strokeWidth: 1.5 },
      })
    })

    if (h > maxRowH) maxRowH = h
    colX += w + GROUP_COL_GAP
    col++
  }

  // ── Unassigned agents row below all groups ─────────────────────────────────
  const unassigned = allAgents.filter(a => !assignedAgentIds.has(a.identity.id))
  const unassignedY = rowY + maxRowH + 60
  unassigned.forEach((agent, i) => {
    nodes.push({
      id: `agent-${agent.identity.id}`,
      type: agent.identity.slug === 'orchestrator' ? 'orchestratorNode' : 'agentNode',
      position: { x: 40 + i * (AGENT_W + AGENT_GAP), y: unassignedY },
      data: {
        label: agent.identity.name,
        slug: agent.identity.slug,
        status: agent.identity.status,
        profile: agent.profile.name,
        isOrchestrator: agent.identity.slug === 'orchestrator',
      },
    })
  })

  return { nodes: applyOverrides(nodes, saved), edges }
}

// ─── Network canvas layout ────────────────────────────────────────────────────
// Dagre top-down: orchestrator pinned at top, groups mid-tier, agents bottom.

export function computeNetworkLayout(
  allAgents: Agent[],
  groupsWithMembers: GroupWithMembers[],
  surfaceId = 'network'
): { nodes: Node[]; edges: Edge[] } {
  const saved = loadSavedPositions(surfaceId)
  const agentById = new Map(allAgents.map(a => [a.identity.id, a]))
  const assignedAgentIds = new Set(groupsWithMembers.flatMap(g => g.members.map(m => m.agentId)))

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  // Orchestrator pinned — handled separately after layout, just add for edge routing
  const orchestrator = allAgents.find(a => a.identity.slug === 'orchestrator')

  // Add group nodes to Dagre
  groupsWithMembers.forEach(group => {
    const { w, h } = groupDimensions(group.members.length)
    g.setNode(`group-${group.id}`, { width: w, height: h, label: group.name })
  })

  // Add unassigned agents (non-orchestrator) to Dagre
  allAgents
    .filter(a => !assignedAgentIds.has(a.identity.id) && a.identity.slug !== 'orchestrator')
    .forEach(agent => {
      g.setNode(`agent-${agent.identity.id}`, { width: 170, height: 80 })
    })

  // Orchestrator → groups and unassigned agents edges for layout only
  if (orchestrator) {
    groupsWithMembers.forEach(group => {
      g.setEdge('orch-placeholder', `group-${group.id}`)
    })
    allAgents
      .filter(a => !assignedAgentIds.has(a.identity.id) && a.identity.slug !== 'orchestrator')
      .forEach(agent => {
        g.setEdge('orch-placeholder', `agent-${agent.identity.id}`)
      })
    g.setNode('orch-placeholder', { width: 180, height: 80 })
  }

  dagre.layout(g)

  const nodes: Node[] = []
  const edges: Edge[] = []

  // Orchestrator node — pinned, draggable: false
  if (orchestrator) {
    const orchPos = g.node('orch-placeholder')
    nodes.push({
      id: 'agent-orchestrator',
      type: 'orchestratorNode',
      position: { x: orchPos ? orchPos.x - 90 : 400, y: 40 },
      draggable: false,
      data: { label: orchestrator.identity.name, status: orchestrator.identity.status },
    })
  }

  // Group nodes with nested agents
  groupsWithMembers.forEach(group => {
    const pos = g.node(`group-${group.id}`)
    const { w, h } = groupDimensions(group.members.length)
    const groupId = `group-${group.id}`
    nodes.push({
      id: groupId,
      type: 'groupNode',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      style: { width: w, height: h },
      data: {
        label: group.name,
        hierarchyType: group.hierarchyType,
        memberCount: group.members.length,
        goals: group.goals,
      },
    })

    const agentCols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(group.members.length))))
    group.members.forEach((member, i) => {
      const agent = agentById.get(member.agentId)
      if (!agent) return
      const col = i % agentCols
      const row = Math.floor(i / agentCols)
      nodes.push({
        id: `agent-${agent.identity.id}`,
        type: 'agentNode',
        parentId: groupId,
        extent: 'parent' as const,
        position: {
          x: GROUP_PAD_X / 2 + col * (AGENT_W + AGENT_GAP),
          y: GROUP_PAD_Y + row * (AGENT_H + AGENT_GAP),
        },
        data: {
          label: agent.identity.name,
          slug: agent.identity.slug,
          status: agent.identity.status,
          profile: agent.profile.name,
        },
      })
      edges.push({
        id: `membership-${groupId}-${agent.identity.id}`,
        source: groupId,
        target: `agent-${agent.identity.id}`,
        style: { stroke: '#3b82f6', strokeWidth: 1.5 },
      })
    })
  })

  // Unassigned agents
  allAgents
    .filter(a => !assignedAgentIds.has(a.identity.id) && a.identity.slug !== 'orchestrator')
    .forEach(agent => {
      const pos = g.node(`agent-${agent.identity.id}`)
      nodes.push({
        id: `agent-${agent.identity.id}`,
        type: 'agentNode',
        position: { x: pos.x - 85, y: pos.y - 40 },
        data: {
          label: agent.identity.name,
          slug: agent.identity.slug,
          status: agent.identity.status,
          profile: agent.profile.name,
        },
      })
    })

  return { nodes: applyOverrides(nodes, saved), edges }
}

// ─── Agent canvas layout ──────────────────────────────────────────────────────
// Radial: agent at center, skills top-left arc, tools top-right arc,
// workspaces bottom arc.

export function computeAgentLayout(
  agent: Agent,
  agentSkills: AgentSkill[],
  workspacePaths: string[],
  surfaceId: string
): { nodes: Node[]; edges: Edge[] } {
  const saved = loadSavedPositions(surfaceId)
  const CX = 500
  const CY = 400
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Center agent node
  nodes.push({
    id: 'agent-center',
    type: agent.identity.slug === 'orchestrator' ? 'orchestratorNode' : 'agentNode',
    position: { x: CX - 85, y: CY - 40 },
    data: {
      label: agent.identity.name,
      slug: agent.identity.slug,
      status: agent.identity.status,
      profile: agent.profile.name,
      isOrchestrator: agent.identity.slug === 'orchestrator',
    },
  })

  // Skills — arc top-left (225° to 315° if center is 12 o'clock, so from ~135° to ~225°)
  const skillCount = agentSkills.length
  const skillRadius = Math.max(220, 140 + skillCount * 20)
  agentSkills.forEach((skill, i) => {
    const angle = (Math.PI * 1.1) + (i - (skillCount - 1) / 2) * (Math.PI * 0.25 / Math.max(skillCount - 1, 1))
    const x = CX + skillRadius * Math.cos(angle) - 70
    const y = CY + skillRadius * Math.sin(angle) - 40
    nodes.push({
      id: `skill-${skill.id}`,
      type: 'skillNode',
      position: { x, y },
      data: { label: skill.name, version: skill.version },
    })
    edges.push({
      id: `e-skill-${skill.id}`,
      source: 'agent-center',
      target: `skill-${skill.id}`,
      style: { stroke: '#0d9488', strokeWidth: 1.5 },
    })
  })

  // Tools — arc top-right
  const tools = agent.profile.allowedTools ?? []
  const toolCount = tools.length
  const toolRadius = Math.max(220, 140 + toolCount * 10)
  tools.slice(0, 12).forEach((tool, i) => {
    const angle = -(Math.PI * 0.1) - (i - (Math.min(toolCount, 12) - 1) / 2) * (Math.PI * 0.25 / Math.max(Math.min(toolCount, 12) - 1, 1))
    const x = CX + toolRadius * Math.cos(angle) - 65
    const y = CY + toolRadius * Math.sin(angle) - 40
    nodes.push({
      id: `tool-${tool}`,
      type: 'toolNode',
      position: { x, y },
      data: { label: tool, toolType: 'tool' },
    })
    edges.push({
      id: `e-tool-${tool}`,
      source: 'agent-center',
      target: `tool-${tool}`,
      style: { stroke: '#475569', strokeWidth: 1 },
    })
  })

  // Workspaces — bottom arc
  const allPaths = [agent.identity.workspacePath, ...(agent.identity.additionalWorkspacePaths ?? []), ...workspacePaths].filter(Boolean)
  const wsRadius = 200
  allPaths.forEach((path, i) => {
    const angle = Math.PI / 2 + (i - (allPaths.length - 1) / 2) * (Math.PI * 0.3 / Math.max(allPaths.length - 1, 1))
    const x = CX + wsRadius * Math.cos(angle) - 80
    const y = CY + wsRadius * Math.sin(angle) - 40
    const label = i === 0 ? 'Private Workspace' : path.split('/').slice(-2).join('/')
    nodes.push({
      id: `workspace-${i}`,
      type: 'workspaceNode',
      position: { x, y },
      data: { label, path },
    })
    edges.push({
      id: `e-ws-${i}`,
      source: 'agent-center',
      target: `workspace-${i}`,
      style: { stroke: '#92400e', strokeDasharray: '4 2', strokeWidth: 1 },
    })
  })

  return { nodes: applyOverrides(nodes, saved), edges }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "canvas-layout|error" | head -20
```

Expected: No errors relating to canvas-layout.ts.

- [ ] **Step 3: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/components/canvas/canvas-layout.ts
git commit -m "feat(canvas): add Dagre + radial layout utilities with localStorage persistence"
```

---

## Task 3: Update canvas-toolbar.tsx

**Files:**
- Modify: `app/apps/dashboard/src/components/canvas/canvas-toolbar.tsx`

- [ ] **Step 1: Replace canvas-toolbar.tsx**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

interface CanvasToolbarProps {
  editMode: boolean
  onToggleEdit: () => void
  onFitView?: () => void
  onResetLayout?: () => void
  liveMode?: boolean
  onToggleLive?: () => void
  onAddGroup?: () => void
  onAddAgent?: () => void
}

export function CanvasToolbar({
  editMode,
  onToggleEdit,
  onFitView,
  onResetLayout,
  liveMode,
  onToggleLive,
  onAddGroup,
  onAddAgent,
}: CanvasToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onToggleEdit}
        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
          editMode
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
      >
        {editMode ? 'Editing' : 'Edit'}
      </button>

      {onFitView && (
        <button
          onClick={onFitView}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Fit
        </button>
      )}

      {onResetLayout && (
        <button
          onClick={onResetLayout}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Reset Layout
        </button>
      )}

      {onToggleLive && (
        <button
          onClick={onToggleLive}
          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            liveMode
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${liveMode ? 'bg-emerald-300' : 'bg-gray-500'}`} />
          Live
        </button>
      )}

      <div className="flex-1" />

      {onAddGroup && (
        <button
          onClick={onAddGroup}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-800 hover:bg-blue-700 text-blue-200 transition-colors"
        >
          + Group
        </button>
      )}

      {onAddAgent && (
        <button
          onClick={onAddAgent}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          + Agent
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/components/canvas/canvas-toolbar.tsx
git commit -m "feat(canvas): update toolbar with Live Mode, Reset Layout, and Add buttons"
```

---

## Task 4: Create CanvasSidePanel

**Files:**
- Create: `app/apps/dashboard/src/components/canvas/canvas-side-panel.tsx`

- [ ] **Step 1: Create canvas-side-panel.tsx**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  agents, groups, agentSkills, workspace,
  type Agent, type WorkspaceGroup, type GroupMember, type WorkspaceFile,
} from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SidePanelContent =
  | { type: 'group'; groupId: string }
  | { type: 'agent'; slug: string }
  | { type: 'skill'; skillId: string; agentSlug: string }
  | { type: 'tool'; toolName: string; agentSlug: string }
  | { type: 'workspace'; path: string; agentSlug?: string }

interface CanvasSidePanelProps {
  content: SidePanelContent | null
  onClose: () => void
  onGroupUpdated?: (group: WorkspaceGroup) => void
  onGroupDeleted?: (groupId: string) => void
  onMemberAdded?: (groupId: string, agentId: string) => void
  onMemberRemoved?: (groupId: string, agentId: string) => void
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CanvasSidePanel({
  content,
  onClose,
  onGroupUpdated,
  onGroupDeleted,
  onMemberAdded,
  onMemberRemoved,
}: CanvasSidePanelProps) {
  const isOpen = content !== null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transition-transform duration-200 overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <span className="text-white font-semibold text-sm">
            {content?.type === 'group' ? 'Group' :
             content?.type === 'agent' ? 'Agent' :
             content?.type === 'skill' ? 'Skill' :
             content?.type === 'tool' ? 'Tool' :
             content?.type === 'workspace' ? 'Workspace' : ''}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          {content?.type === 'group' && (
            <GroupPanel
              groupId={content.groupId}
              onUpdated={onGroupUpdated}
              onDeleted={onGroupDeleted}
              onMemberAdded={onMemberAdded}
              onMemberRemoved={onMemberRemoved}
            />
          )}
          {content?.type === 'agent' && (
            <AgentPanel slug={content.slug} />
          )}
          {content?.type === 'skill' && (
            <SkillPanel skillId={content.skillId} agentSlug={content.agentSlug} />
          )}
          {content?.type === 'tool' && (
            <ToolPanel toolName={content.toolName} agentSlug={content.agentSlug} />
          )}
          {content?.type === 'workspace' && (
            <WorkspacePanel path={content.path} agentSlug={content.agentSlug} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Group panel ───────────────────────────────────────────────────────────────

function GroupPanel({
  groupId,
  onUpdated,
  onDeleted,
  onMemberAdded,
  onMemberRemoved,
}: {
  groupId: string
  onUpdated?: (group: WorkspaceGroup) => void
  onDeleted?: (groupId: string) => void
  onMemberAdded?: (groupId: string, agentId: string) => void
  onMemberRemoved?: (groupId: string, agentId: string) => void
}) {
  const [group, setGroup] = useState<WorkspaceGroup | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    Promise.all([groups.get(groupId), agents.list()]).then(([gData, aData]) => {
      setGroup(gData.group)
      setMembers(gData.members)
      setAllAgents(aData.agents)
      setName(gData.group.name)
      setDescription(gData.group.description ?? '')
      setGoals(gData.group.goals.length > 0 ? gData.group.goals : [''])
    }).catch(console.error)
  }, [groupId])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const updated = await groups.update(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
        goals: goals.filter(Boolean),
      })
      setGroup(updated.group)
      onUpdated?.(updated.group)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(agentId: string) {
    await groups.addMember(groupId, { agentId })
    const updated = await groups.get(groupId)
    setMembers(updated.members)
    onMemberAdded?.(groupId, agentId)
  }

  async function handleRemoveMember(agentId: string) {
    await groups.removeMember(groupId, agentId)
    setMembers(prev => prev.filter(m => m.agentId !== agentId))
    onMemberRemoved?.(groupId, agentId)
  }

  async function handleDelete() {
    await groups.delete(groupId)
    onDeleted?.(groupId)
  }

  if (!group) return <p className="text-gray-500 text-sm">Loading...</p>

  const memberIds = new Set(members.map(m => m.agentId))
  const availableAgents = allAgents.filter(a => !memberIds.has(a.identity.id))

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Goals</label>
        {goals.map((g, i) => (
          <div key={i} className="flex gap-2 mb-1">
            <input
              value={g}
              onChange={e => setGoals(prev => prev.map((x, j) => j === i ? e.target.value : x))}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setGoals(prev => prev.filter((_, j) => j !== i))}
              className="text-gray-500 hover:text-red-400 text-sm"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setGoals(prev => [...prev, ''])}
          className="text-xs text-blue-400 hover:text-blue-300 mt-1"
        >
          + Add goal
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>

      <div className="border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-medium">Members ({members.length})</span>
          {availableAgents.length > 0 && (
            <select
              className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300"
              defaultValue=""
              onChange={e => { if (e.target.value) { handleAddMember(e.target.value); e.target.value = '' } }}
            >
              <option value="">+ Add member</option>
              {availableAgents.map(a => (
                <option key={a.identity.id} value={a.identity.id}>{a.identity.name}</option>
              ))}
            </select>
          )}
        </div>
        {members.length === 0 && <p className="text-gray-600 text-xs">No members yet.</p>}
        {members.map(member => {
          const agent = allAgents.find(a => a.identity.id === member.agentId)
          return (
            <div key={member.agentId} className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-white text-sm">{agent?.identity.name ?? member.agentId}</span>
                <span className="ml-2 text-xs text-gray-500">{member.role}</span>
              </div>
              <button
                onClick={() => handleRemoveMember(member.agentId)}
                className="text-xs text-gray-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-gray-700 pt-4">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete Group
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-red-300">Delete this group? Agents will lose workspace access. Directory is preserved on disk.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded">Confirm Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agent panel ───────────────────────────────────────────────────────────────

function AgentPanel({ slug }: { slug: string }) {
  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    agents.get(slug).then(d => setAgent(d.agent)).catch(console.error)
  }, [slug])

  if (!agent) return <p className="text-gray-500 text-sm">Loading...</p>

  const id = agent.identity
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-white ${id.slug === 'orchestrator' ? 'bg-purple-700' : 'bg-gray-700'}`}>
          {id.name[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-white font-semibold">{id.name}</p>
          <p className="text-gray-500 text-xs font-mono">{id.slug}</p>
        </div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${id.status === 'active' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
          {id.status}
        </span>
      </div>

      <Row label="Profile" value={agent.profile.name} />
      <Row label="Model tier" value={agent.profile.modelTier ?? '—'} />
      <Row label="Lifecycle" value={id.lifecycleType} />
      <Row label="Wake mode" value={id.wakeMode} />
      <Row label="Shell access" value={id.shellPermissionLevel} />
      {id.autonomousMode !== undefined && (
        <Row label="Autonomous mode" value={id.autonomousMode ? 'On' : 'Off'} />
      )}

      <div className="pt-2 border-t border-gray-700">
        <p className="text-xs text-gray-400 mb-1">Workspace</p>
        <p className="text-xs font-mono text-gray-500 break-all">{id.workspacePath}</p>
        {(id.additionalWorkspacePaths ?? []).map((p, i) => (
          <p key={i} className="text-xs font-mono text-gray-600 break-all mt-0.5">{p}</p>
        ))}
      </div>

      <a
        href={`/dashboard/agents/${slug}?tab=overview`}
        className="block text-center py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg mt-2"
      >
        Open Full Settings
      </a>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-300">{value}</span>
    </div>
  )
}

// ─── Skill panel ───────────────────────────────────────────────────────────────

function SkillPanel({ skillId, agentSlug }: { skillId: string; agentSlug: string }) {
  const [skillData, setSkillData] = useState<Awaited<ReturnType<typeof agentSkills.list>>['skills'][0] | null>(null)

  useEffect(() => {
    agentSkills.list(agentSlug).then(d => {
      const found = d.skills.find(s => s.id === skillId)
      if (found) setSkillData(found)
    }).catch(console.error)
  }, [skillId, agentSlug])

  if (!skillData) return <p className="text-gray-500 text-sm">Loading...</p>

  return (
    <div className="space-y-3">
      <p className="text-white font-semibold">{skillData.name}</p>
      <Row label="Version" value={skillData.version} />
      <Row label="Status" value={skillData.status} />
      {skillData.manifest.description && (
        <p className="text-xs text-gray-400">{skillData.manifest.description}</p>
      )}
      {(skillData.manifest.tools ?? []).length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Tools used</p>
          {skillData.manifest.tools!.map(t => (
            <span key={t} className="inline-block text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded mr-1 mb-1">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tool panel ────────────────────────────────────────────────────────────────

function ToolPanel({ toolName, agentSlug }: { toolName: string; agentSlug: string }) {
  return (
    <div className="space-y-3">
      <p className="text-white font-semibold font-mono">{toolName}</p>
      <p className="text-xs text-gray-400">
        Tool permissions and call history are managed in the agent settings.
      </p>
      <a
        href={`/dashboard/agents/${agentSlug}?tab=tools`}
        className="block text-center py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
      >
        Open Tool Settings
      </a>
    </div>
  )
}

// ─── Workspace panel ───────────────────────────────────────────────────────────

function WorkspacePanel({ path, agentSlug }: { path: string; agentSlug?: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')

  useEffect(() => {
    if (!agentSlug) { setLoading(false); return }
    workspace.list(agentSlug, '').then(d => {
      setFiles(d.files)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [agentSlug, path])

  async function openDir(dir: string) {
    if (!agentSlug) return
    const data = await workspace.list(agentSlug, dir)
    setFiles(data.files)
    setCurrentPath(dir)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Path</p>
        <p className="text-xs font-mono text-gray-400 break-all">{path}</p>
      </div>
      {currentPath && (
        <button
          onClick={() => openDir(currentPath.split('/').slice(0, -1).join('/'))}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          ← Back
        </button>
      )}
      {loading && <p className="text-xs text-gray-500">Loading files…</p>}
      <div className="space-y-0.5">
        {files.map(f => (
          <button
            key={f.name}
            onClick={() => f.type === 'directory' ? openDir(currentPath ? `${currentPath}/${f.name}` : f.name) : undefined}
            className="w-full text-left px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 rounded flex items-center gap-2"
          >
            <span className="text-gray-500 w-3 text-center">{f.type === 'directory' ? '▶' : '·'}</span>
            {f.name}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "side-panel|error" | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/components/canvas/canvas-side-panel.tsx
git commit -m "feat(canvas): add CanvasSidePanel with group, agent, skill, tool, workspace panels"
```

---

## Task 5: Create CanvasContextMenu

**Files:**
- Create: `app/apps/dashboard/src/components/canvas/canvas-context-menu.tsx`

- [ ] **Step 1: Create canvas-context-menu.tsx**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { useCallback, useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { SidePanelContent } from './canvas-side-panel'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ContextMenuState =
  | { kind: 'node'; nodeId: string; nodeType: string; x: number; y: number; parentId?: string }
  | { kind: 'pane'; x: number; y: number; flowX: number; flowY: number }
  | null

interface CanvasContextMenuProps {
  menu: ContextMenuState
  editMode: boolean
  groups: { id: string; name: string }[]
  onClose: () => void
  onOpenPanel: (content: SidePanelContent) => void
  onAddMemberToGroup?: (agentId: string, groupId: string) => Promise<void>
  onRemoveFromGroup?: (agentId: string, groupId: string) => Promise<void>
  onDeleteGroup?: (groupId: string) => Promise<void>
  onNewGroup?: (flowX: number, flowY: number) => void
  onNewAgent?: () => void
  onNavigateToAgent?: (slug: string) => void
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export function CanvasContextMenu({
  menu,
  editMode,
  groups,
  onClose,
  onOpenPanel,
  onAddMemberToGroup,
  onRemoveFromGroup,
  onDeleteGroup,
  onNewGroup,
  onNewAgent,
  onNavigateToAgent,
}: CanvasContextMenuProps) {
  const { getNode } = useReactFlow()

  useEffect(() => {
    window.addEventListener('keydown', onClose)
    return () => window.removeEventListener('keydown', onClose)
  }, [onClose])

  if (!menu) return null

  const node = menu.kind === 'node' ? getNode(menu.nodeId) : null
  const agentSlug = node?.data?.slug as string | undefined
  const groupIdFromNode = menu.kind === 'node' && menu.nodeType === 'groupNode'
    ? menu.nodeId.replace('group-', '')
    : undefined

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1 min-w-[180px]"
        style={{ top: menu.y, left: menu.x }}
        onClick={e => e.stopPropagation()}
      >
        {menu.kind === 'node' && menu.nodeType === 'groupNode' && groupIdFromNode && (
          <>
            <MenuItem onClick={() => { onOpenPanel({ type: 'group', groupId: groupIdFromNode }); onClose() }}>
              Edit Group
            </MenuItem>
            {editMode && (
              <MenuItem
                variant="danger"
                onClick={async () => { await onDeleteGroup?.(groupIdFromNode); onClose() }}
              >
                Delete Group
              </MenuItem>
            )}
          </>
        )}

        {menu.kind === 'node' && (menu.nodeType === 'agentNode' || menu.nodeType === 'orchestratorNode') && agentSlug && (
          <>
            <MenuItem onClick={() => { onOpenPanel({ type: 'agent', slug: agentSlug }); onClose() }}>
              View / Edit Agent
            </MenuItem>
            <MenuItem onClick={() => { onNavigateToAgent?.(agentSlug); onClose() }}>
              Open Agent Canvas
            </MenuItem>
            {editMode && groups.length > 0 && (
              <SubMenu label="Add to Group">
                {groups.map(g => (
                  <MenuItem
                    key={g.id}
                    onClick={async () => {
                      const agentId = menu.nodeId.replace('agent-', '')
                      await onAddMemberToGroup?.(agentId, g.id)
                      onClose()
                    }}
                  >
                    {g.name}
                  </MenuItem>
                ))}
              </SubMenu>
            )}
            {editMode && menu.parentId && (
              <MenuItem
                variant="danger"
                onClick={async () => {
                  const agentId = menu.nodeId.replace('agent-', '')
                  const groupId = menu.parentId!.replace('group-', '')
                  await onRemoveFromGroup?.(agentId, groupId)
                  onClose()
                }}
              >
                Remove from Group
              </MenuItem>
            )}
          </>
        )}

        {menu.kind === 'node' && menu.nodeType === 'skillNode' && (
          <>
            <MenuItem onClick={() => { onOpenPanel({ type: 'skill', skillId: menu.nodeId.replace('skill-', ''), agentSlug: '' }); onClose() }}>
              View Skill
            </MenuItem>
          </>
        )}

        {menu.kind === 'node' && menu.nodeType === 'toolNode' && (
          <>
            <MenuItem onClick={() => { onOpenPanel({ type: 'tool', toolName: menu.nodeId.replace('tool-', ''), agentSlug: '' }); onClose() }}>
              View Tool
            </MenuItem>
          </>
        )}

        {menu.kind === 'node' && menu.nodeType === 'workspaceNode' && (
          <>
            <MenuItem onClick={() => {
              const path = node?.data?.path as string ?? ''
              onOpenPanel({ type: 'workspace', path })
              onClose()
            }}>
              Browse Files
            </MenuItem>
          </>
        )}

        {menu.kind === 'pane' && (
          <>
            <MenuItem onClick={() => { onNewGroup?.(menu.flowX, menu.flowY); onClose() }}>
              New Group
            </MenuItem>
            {onNewAgent && (
              <MenuItem onClick={() => { onNewAgent(); onClose() }}>
                New Agent
              </MenuItem>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  children,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-900/20'
          : 'text-gray-200 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ─── SubMenu ──────────────────────────────────────────────────────────────────

function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/sub">
      <button className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center justify-between">
        {label}
        <span className="text-gray-500">›</span>
      </button>
      <div className="absolute left-full top-0 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1 min-w-[160px] hidden group-hover/sub:block">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "context-menu|error" | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/components/canvas/canvas-context-menu.tsx
git commit -m "feat(canvas): add CanvasContextMenu for node and pane right-click actions"
```

---

## Task 6: Rebuild GroupsCanvas and update groups page

**Files:**
- Modify: `app/apps/dashboard/src/app/dashboard/groups/GroupsCanvas.tsx`
- Modify: `app/apps/dashboard/src/app/dashboard/groups/page.tsx`

- [ ] **Step 1: Update groups/page.tsx to fetch member data and define GroupWithMembers**

Find the data fetching block in `page.tsx` (around line 181 where `groups.list()` and `agents.list()` are called). Replace it with a version that also fetches member data for the canvas, and update the `GroupsCanvas` props type:

```typescript
// Add this import at the top of the file with the other imports
import type { GroupMember } from '@/lib/api'

// Add this type near the top of the component file (after imports)
type GroupWithMembers = WorkspaceGroup & { members: GroupMember[] }
```

Locate the `useEffect` that fetches `groups.list()` and `agents.list()` (around line 181). Replace just that `Promise.all` call with:

```typescript
Promise.all([groups.list(), agents.list()])
  .then(async ([groupData, agentData]) => {
    setGroupList(groupData.groups)
    setAgentList(agentData.agents)
    // Fetch member data for canvas use
    const withMembers: GroupWithMembers[] = await Promise.all(
      groupData.groups.map(g =>
        groups.get(g.id).then(d => ({ ...g, members: d.members }))
      )
    )
    setGroupsWithMembers(withMembers)
  })
  .catch(console.error)
```

Add state for `groupsWithMembers` near the other `useState` declarations (around line 172):

```typescript
const [groupsWithMembers, setGroupsWithMembers] = useState<GroupWithMembers[]>([])
```

Update the `GroupsCanvas` usage (around line 242) to pass `groupsWithMembers`:

```typescript
<GroupsCanvas groups={groupList} groupsWithMembers={groupsWithMembers} allAgents={agentList} />
```

- [ ] **Step 2: Rebuild GroupsCanvas.tsx**

Replace the entire file:

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge,
} from '@xyflow/react'
import { useCallback, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import {
  computeGroupsLayout, savePositions, clearSavedPositions, type GroupWithMembers,
} from '@/components/canvas/canvas-layout'
import { groups, type WorkspaceGroup, type Agent } from '@/lib/api'

interface GroupsCanvasProps {
  groups: WorkspaceGroup[]
  groupsWithMembers: GroupWithMembers[]
  allAgents: Agent[]
}

export function GroupsCanvas({ groups: groupList, groupsWithMembers, allAgents }: GroupsCanvasProps) {
  const router = useRouter()
  const SURFACE_ID = 'groups'

  const { computedLayout, computedEdges } = (() => {
    const result = computeGroupsLayout(groupsWithMembers, allAgents, SURFACE_ID)
    return { computedLayout: result.nodes, computedEdges: result.edges }
  })()

  const [nodes, setNodes, onNodesChange] = useNodesState(computedLayout)
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges)
  const [editMode, setEditMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const { fitView, screenToFlowPosition } = useReactFlow()

  // ── Persist positions on node drag ──────────────────────────────────────────
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    // Save after position changes
    const hasMoved = changes.some(c => c.type === 'position' && c.dragging === false)
    if (hasMoved) {
      setNodes(current => { savePositions(SURFACE_ID, current); return current })
    }
  }, [onNodesChange, setNodes])

  // ── Drag-drop: agent into group ──────────────────────────────────────────────
  const handleNodeDragStop = useCallback(async (_: React.MouseEvent, node: Node) => {
    if (!editMode) return
    if (node.type !== 'agentNode') return

    // Check if dropped inside a group node
    const groupNode = nodes.find(n =>
      n.type === 'groupNode' &&
      n.id !== node.id &&
      node.position.x >= n.position.x &&
      node.position.x <= n.position.x + (n.style?.width as number ?? 260) &&
      node.position.y >= n.position.y &&
      node.position.y <= n.position.y + (n.style?.height as number ?? 200)
    )

    if (groupNode && !node.parentId) {
      // Add to group
      const agentId = node.id.replace('agent-', '')
      const groupId = groupNode.id.replace('group-', '')
      try {
        await groups.addMember(groupId, { agentId })
        setNodes(nds => nds.map(n =>
          n.id === node.id ? { ...n, parentId: groupNode.id, extent: 'parent' as const } : n
        ))
        setEdges(eds => [...eds, {
          id: `membership-${groupNode.id}-${node.id}`,
          source: groupNode.id,
          target: node.id,
          style: { stroke: '#3b82f6', strokeWidth: 1.5 },
        }])
      } catch (e) {
        console.error('Failed to add member', e)
      }
    } else if (!groupNode && node.parentId) {
      // Remove from group
      const agentId = node.id.replace('agent-', '')
      const groupId = node.parentId.replace('group-', '')
      try {
        await groups.removeMember(groupId, agentId)
        setNodes(nds => nds.map(n =>
          n.id === node.id ? { ...n, parentId: undefined, extent: undefined } : n
        ))
        setEdges(eds => eds.filter(e => e.id !== `membership-${node.parentId}-${node.id}`))
      } catch (e) {
        console.error('Failed to remove member', e)
      }
    }
  }, [editMode, nodes, setNodes, setEdges])

  // ── Node click → side panel ──────────────────────────────────────────────────
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setContextMenu(null)
    if (node.type === 'groupNode') {
      setPanelContent({ type: 'group', groupId: node.id.replace('group-', '') })
    } else if (node.type === 'agentNode' || node.type === 'orchestratorNode') {
      setPanelContent({ type: 'agent', slug: node.data.slug as string })
    }
  }, [])

  // ── Right-click context menu ─────────────────────────────────────────────────
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setContextMenu({
      kind: 'node',
      nodeId: node.id,
      nodeType: node.type ?? '',
      x: e.clientX,
      y: e.clientY,
      parentId: node.parentId,
    })
  }, [])

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setContextMenu({ kind: 'pane', x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  // ── Reset layout ─────────────────────────────────────────────────────────────
  const handleResetLayout = useCallback(() => {
    clearSavedPositions(SURFACE_ID)
    const { nodes: fresh, edges: freshEdges } = computeGroupsLayout(groupsWithMembers, allAgents, SURFACE_ID)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ duration: 300 }), 50)
  }, [groupsWithMembers, allAgents, setNodes, setEdges, fitView])

  // ── New group inline form ────────────────────────────────────────────────────
  const handleNewGroup = useCallback(async (flowX: number, flowY: number) => {
    const name = window.prompt('Group name:')
    if (!name?.trim()) return
    try {
      const result = await groups.create({ name: name.trim() })
      setNodes(nds => [...nds, {
        id: `group-${result.group.id}`,
        type: 'groupNode',
        position: { x: flowX, y: flowY },
        style: { width: 260, height: 200 },
        data: {
          label: result.group.name,
          hierarchyType: result.group.hierarchyType,
          memberCount: 0,
          goals: result.group.goals,
        },
      }])
    } catch (e) {
      console.error('Failed to create group', e)
    }
  }, [setNodes])

  const groupsForMenu = groupList.map(g => ({ id: g.id, name: g.name }))

  return (
    <div ref={reactFlowWrapper}>
      <CanvasToolbar
        editMode={editMode}
        onToggleEdit={() => setEditMode(e => !e)}
        onFitView={() => fitView({ duration: 300 })}
        onResetLayout={handleResetLayout}
        onAddGroup={() => handleNewGroup(100, 100)}
      />
      <div style={{ height: '70vh' }} className="mt-3 border border-gray-700 rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => setContextMenu(null)}
          onNodeDragStop={handleNodeDragStop}
          nodesDraggable={editMode}
          fitView
          className="bg-gray-900"
        >
          <Background color="#374151" gap={20} />
          <Controls />
          <MiniMap className="bg-gray-800" nodeColor="#374151" />
        </ReactFlow>
      </div>
      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
        onGroupUpdated={g => setNodes(nds => nds.map(n =>
          n.id === `group-${g.id}` ? { ...n, data: { ...n.data, label: g.name, goals: g.goals } } : n
        ))}
        onGroupDeleted={id => {
          setNodes(nds => nds.filter(n => n.id !== `group-${id}` && n.parentId !== `group-${id}`))
          setEdges(eds => eds.filter(e => !e.id.includes(`group-${id}`)))
          setPanelContent(null)
        }}
        onMemberAdded={(groupId, agentId) => {
          setNodes(nds => nds.map(n =>
            n.id === `group-${groupId}`
              ? { ...n, data: { ...n.data, memberCount: (n.data.memberCount as number) + 1 } }
              : n
          ))
        }}
        onMemberRemoved={(groupId, agentId) => {
          setNodes(nds => nds
            .map(n => n.id === `group-${groupId}`
              ? { ...n, data: { ...n.data, memberCount: Math.max(0, (n.data.memberCount as number) - 1) } }
              : n
            )
            .map(n => n.id === `agent-${agentId}` ? { ...n, parentId: undefined, extent: undefined } : n)
          )
          setEdges(eds => eds.filter(e => e.id !== `membership-group-${groupId}-agent-${agentId}`))
        }}
      />
      <CanvasContextMenu
        menu={contextMenu}
        editMode={editMode}
        groups={groupsForMenu}
        onClose={() => setContextMenu(null)}
        onOpenPanel={c => { setPanelContent(c); setContextMenu(null) }}
        onAddMemberToGroup={async (agentId, groupId) => {
          await groups.addMember(groupId, { agentId })
          setNodes(nds => nds.map(n =>
            n.id === `agent-${agentId}`
              ? { ...n, parentId: `group-${groupId}`, extent: 'parent' as const }
              : n
          ))
        }}
        onRemoveFromGroup={async (agentId, groupId) => {
          await groups.removeMember(groupId, agentId)
          setNodes(nds => nds.map(n =>
            n.id === `agent-${agentId}` ? { ...n, parentId: undefined, extent: undefined } : n
          ))
        }}
        onDeleteGroup={async (groupId) => {
          await groups.delete(groupId)
          setNodes(nds => nds.filter(n => n.id !== `group-${groupId}` && n.parentId !== `group-${groupId}`))
          setEdges(eds => eds.filter(e => !e.id.includes(groupId)))
        }}
        onNewGroup={handleNewGroup}
        onNavigateToAgent={(slug) => router.push(`/dashboard/agents/${slug}?tab=canvas`)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Build and check for errors**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "GroupsCanvas|groups/page|error TS" | head -20
```

Expected: No errors. Fix any type errors before continuing.

- [ ] **Step 4: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/app/dashboard/groups/GroupsCanvas.tsx app/apps/dashboard/src/app/dashboard/groups/page.tsx
git commit -m "feat(canvas): rebuild GroupsCanvas with parent/child nesting, drag-drop, context menu, side panel"
```

---

## Task 7: Rebuild Network Map

**Files:**
- Modify: `app/apps/dashboard/src/app/dashboard/network/page.tsx`

- [ ] **Step 1: Replace network/page.tsx**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Node,
} from '@xyflow/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import {
  computeNetworkLayout, savePositions, clearSavedPositions, type GroupWithMembers,
} from '@/components/canvas/canvas-layout'
import { agents, groups, audit, type Agent, type WorkspaceGroup, type GroupMember, type AuditEntry } from '@/lib/api'

const SURFACE_ID = 'network'
const LIVE_POLL_MS = 30_000

export default function NetworkPage() {
  const router = useRouter()
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [groupsWithMembers, setGroupsWithMembers] = useState<GroupWithMembers[]>([])
  const [allGroups, setAllGroups] = useState<WorkspaceGroup[]>([])
  const [editMode, setEditMode] = useState(false)
  const [liveMode, setLiveMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const { fitView, screenToFlowPosition } = useReactFlow()

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([agents.list(), groups.list()])
      .then(async ([agentData, groupData]) => {
        setAllAgents(agentData.agents)
        setAllGroups(groupData.groups)
        const withMembers: GroupWithMembers[] = await Promise.all(
          groupData.groups.map(g =>
            groups.get(g.id).then(d => ({ ...g, members: d.members }))
          )
        )
        setGroupsWithMembers(withMembers)
        const { nodes: n, edges: e } = computeNetworkLayout(agentData.agents, withMembers, SURFACE_ID)
        setNodes(n)
        setEdges(e)
      })
      .catch(console.error)
  }, [setNodes, setEdges])

  // ── Live mode: animate edges from audit_log ──────────────────────────────────
  const applyLiveOverlay = useCallback(async () => {
    try {
      const data = await audit.list({ limit: 100 })
      const invokeActors = new Set(
        data.entries
          .filter((e: AuditEntry) => e.action.includes('invoke') || e.action.includes('agent_message'))
          .map((e: AuditEntry) => e.actor)
      )
      const recentAgentIds = new Set(
        data.entries
          .filter((e: AuditEntry) => {
            const ts = new Date(e.created_at ?? Date.now()).getTime()
            return Date.now() - ts < 10 * 60 * 1000
          })
          .map((e: AuditEntry) => e.actor)
      )
      setEdges(eds => eds.map(e => ({
        ...e,
        animated: invokeActors.has(e.source.replace('agent-', '')) || invokeActors.has(e.target.replace('agent-', '')),
        style: {
          ...e.style,
          strokeWidth: invokeActors.has(e.source.replace('agent-', '')) ? 2.5 : 1.5,
        },
      })))
      setNodes(nds => nds.map(n => {
        const slug = (n.data?.slug as string) ?? n.id.replace('agent-', '')
        const isRecent = recentAgentIds.has(slug)
        return isRecent
          ? { ...n, className: 'animate-pulse' }
          : { ...n, className: undefined }
      }))
    } catch {
      // Live overlay is best-effort — silently ignore failures
    }
  }, [setEdges, setNodes])

  useEffect(() => {
    if (liveMode) {
      applyLiveOverlay()
      liveTimer.current = setInterval(applyLiveOverlay, LIVE_POLL_MS)
    } else {
      if (liveTimer.current) clearInterval(liveTimer.current)
      // Remove animation when live mode turns off
      setEdges(eds => eds.map(e => ({ ...e, animated: false })))
      setNodes(nds => nds.map(n => ({ ...n, className: undefined })))
    }
    return () => { if (liveTimer.current) clearInterval(liveTimer.current) }
  }, [liveMode, applyLiveOverlay, setEdges, setNodes])

  // ── Persist positions on drag ────────────────────────────────────────────────
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    const hasMoved = changes.some((c: { type: string; dragging?: boolean }) => c.type === 'position' && c.dragging === false)
    if (hasMoved) {
      setNodes(current => { savePositions(SURFACE_ID, current); return current })
    }
  }, [onNodesChange, setNodes])

  // ── Click / context menu ─────────────────────────────────────────────────────
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setContextMenu(null)
    if (node.type === 'groupNode') {
      setPanelContent({ type: 'group', groupId: node.id.replace('group-', '') })
    } else if (node.type === 'agentNode' || node.type === 'orchestratorNode') {
      setPanelContent({ type: 'agent', slug: node.data.slug as string })
    }
  }, [])

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setContextMenu({ kind: 'node', nodeId: node.id, nodeType: node.type ?? '', x: e.clientX, y: e.clientY, parentId: node.parentId })
  }, [])

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setContextMenu({ kind: 'pane', x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  // ── Reset layout ─────────────────────────────────────────────────────────────
  const handleResetLayout = useCallback(() => {
    clearSavedPositions(SURFACE_ID)
    const { nodes: fresh, edges: freshEdges } = computeNetworkLayout(allAgents, groupsWithMembers, SURFACE_ID)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ duration: 300 }), 50)
  }, [allAgents, groupsWithMembers, setNodes, setEdges, fitView])

  const handleNewGroup = useCallback(async (flowX: number, flowY: number) => {
    const name = window.prompt('Group name:')
    if (!name?.trim()) return
    try {
      const result = await groups.create({ name: name.trim() })
      setNodes(nds => [...nds, {
        id: `group-${result.group.id}`,
        type: 'groupNode',
        position: { x: flowX, y: flowY },
        style: { width: 260, height: 200 },
        data: { label: result.group.name, hierarchyType: result.group.hierarchyType, memberCount: 0, goals: [] },
      }])
    } catch (e) {
      console.error('Failed to create group', e)
    }
  }, [setNodes])

  return (
    <div className="p-6 h-screen flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Network</h1>
          <p className="text-gray-400 text-sm mt-1">Global view of all agents and groups</p>
        </div>
        <CanvasToolbar
          editMode={editMode}
          onToggleEdit={() => setEditMode(e => !e)}
          onFitView={() => fitView({ duration: 300 })}
          onResetLayout={handleResetLayout}
          liveMode={liveMode}
          onToggleLive={() => setLiveMode(m => !m)}
          onAddGroup={() => handleNewGroup(100, 100)}
        />
      </div>
      <div className="flex-1 border border-gray-700 rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => setContextMenu(null)}
          nodesDraggable={editMode}
          fitView
          className="bg-gray-900"
        >
          <Background color="#374151" gap={20} />
          <Controls />
          <MiniMap className="bg-gray-800" nodeColor="#374151" />
        </ReactFlow>
      </div>
      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
        onGroupUpdated={g => setNodes(nds => nds.map(n =>
          n.id === `group-${g.id}` ? { ...n, data: { ...n.data, label: g.name } } : n
        ))}
        onGroupDeleted={id => {
          setNodes(nds => nds.filter(n => n.id !== `group-${id}` && n.parentId !== `group-${id}`))
          setPanelContent(null)
        }}
      />
      <CanvasContextMenu
        menu={contextMenu}
        editMode={editMode}
        groups={allGroups.map(g => ({ id: g.id, name: g.name }))}
        onClose={() => setContextMenu(null)}
        onOpenPanel={c => { setPanelContent(c); setContextMenu(null) }}
        onAddMemberToGroup={async (agentId, groupId) => {
          await groups.addMember(groupId, { agentId })
        }}
        onRemoveFromGroup={async (agentId, groupId) => {
          await groups.removeMember(groupId, agentId)
        }}
        onDeleteGroup={async (groupId) => {
          await groups.delete(groupId)
          setNodes(nds => nds.filter(n => n.id !== `group-${groupId}` && n.parentId !== `group-${groupId}`))
        }}
        onNewGroup={handleNewGroup}
        onNavigateToAgent={(slug) => router.push(`/dashboard/agents/${slug}?tab=canvas`)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "network/page|error TS" | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/app/dashboard/network/page.tsx
git commit -m "feat(canvas): rebuild Network Map with full system view, live mode, context menu, side panel"
```

---

## Task 8: Extract and rebuild AgentCanvas tab

**Files:**
- Create: `app/apps/dashboard/src/app/dashboard/agents/[slug]/AgentCanvas.tsx`
- Modify: `app/apps/dashboard/src/app/dashboard/agents/[slug]/page.tsx`

- [ ] **Step 1: Create AgentCanvas.tsx**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, useReactFlow,
  type Node,
} from '@xyflow/react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import { computeAgentLayout, savePositions, clearSavedPositions } from '@/components/canvas/canvas-layout'
import { agentSkills, audit, type Agent, type AgentSkill, type AuditEntry } from '@/lib/api'

interface AgentCanvasProps {
  agent: Agent
}

const LIVE_POLL_MS = 30_000

export function AgentCanvas({ agent }: AgentCanvasProps) {
  const slug = agent.identity.slug
  const SURFACE_ID = `agent-${slug}`

  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [liveMode, setLiveMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [liveTooltip, setLiveTooltip] = useState<{ edgeId: string; text: string } | null>(null)
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const { fitView, screenToFlowPosition } = useReactFlow()

  // ── Fetch skills and build initial layout ────────────────────────────────────
  useEffect(() => {
    agentSkills.list(slug).then(d => {
      setSkills(d.skills)
      const { nodes: n, edges: e } = computeAgentLayout(agent, d.skills, [], SURFACE_ID)
      setNodes(n)
      setEdges(e)
    }).catch(() => {
      const { nodes: n, edges: e } = computeAgentLayout(agent, [], [], SURFACE_ID)
      setNodes(n)
      setEdges(e)
    })
  }, [slug, agent, SURFACE_ID, setNodes, setEdges])

  // ── Live activity overlay ─────────────────────────────────────────────────────
  const applyLiveOverlay = useCallback(async () => {
    try {
      const data = await audit.list({ limit: 200 })
      const toolCallCounts: Record<string, number> = {}
      const toolLastCalled: Record<string, number> = {}

      data.entries
        .filter((e: AuditEntry) => e.actor === slug && e.action === 'tool_call')
        .forEach((e: AuditEntry) => {
          const tool = e.target_id ?? ''
          if (tool) {
            toolCallCounts[tool] = (toolCallCounts[tool] ?? 0) + 1
            const ts = new Date(e.created_at ?? Date.now()).getTime()
            if (!toolLastCalled[tool] || ts > toolLastCalled[tool]) toolLastCalled[tool] = ts
          }
        })

      setEdges(eds => eds.map(e => {
        const toolName = e.target.replace('tool-', '')
        const called = toolCallCounts[toolName] ?? 0
        return {
          ...e,
          animated: called > 0 && liveMode,
          data: { ...e.data, callCount: called, lastCalled: toolLastCalled[toolName] },
        }
      }))
    } catch {
      // Best-effort
    }
  }, [slug, liveMode, setEdges])

  useEffect(() => {
    if (liveMode) {
      applyLiveOverlay()
      liveTimer.current = setInterval(applyLiveOverlay, LIVE_POLL_MS)
    } else {
      if (liveTimer.current) clearInterval(liveTimer.current)
      setEdges(eds => eds.map(e => ({ ...e, animated: false })))
    }
    return () => { if (liveTimer.current) clearInterval(liveTimer.current) }
  }, [liveMode, applyLiveOverlay, setEdges])

  // ── Persist positions on drag ────────────────────────────────────────────────
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    const hasMoved = changes.some((c: { type: string; dragging?: boolean }) => c.type === 'position' && c.dragging === false)
    if (hasMoved) {
      setNodes(current => { savePositions(SURFACE_ID, current); return current })
    }
  }, [onNodesChange, setNodes, SURFACE_ID])

  // ── Click → side panel ───────────────────────────────────────────────────────
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setContextMenu(null)
    if (node.type === 'skillNode') {
      setPanelContent({ type: 'skill', skillId: node.id.replace('skill-', ''), agentSlug: slug })
    } else if (node.type === 'toolNode') {
      setPanelContent({ type: 'tool', toolName: node.id.replace('tool-', ''), agentSlug: slug })
    } else if (node.type === 'workspaceNode') {
      setPanelContent({ type: 'workspace', path: node.data.path as string, agentSlug: slug })
    }
  }, [slug])

  // ── Right-click ──────────────────────────────────────────────────────────────
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setContextMenu({ kind: 'node', nodeId: node.id, nodeType: node.type ?? '', x: e.clientX, y: e.clientY })
  }, [])

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setContextMenu({ kind: 'pane', x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  // ── Reset layout ─────────────────────────────────────────────────────────────
  const handleResetLayout = useCallback(() => {
    clearSavedPositions(SURFACE_ID)
    const { nodes: fresh, edges: freshEdges } = computeAgentLayout(agent, skills, [], SURFACE_ID)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ duration: 300 }), 50)
  }, [SURFACE_ID, agent, skills, setNodes, setEdges, fitView])

  return (
    <div>
      <CanvasToolbar
        editMode={false}
        onToggleEdit={() => {}}
        onFitView={() => fitView({ duration: 300 })}
        onResetLayout={handleResetLayout}
        liveMode={liveMode}
        onToggleLive={() => setLiveMode(m => !m)}
      />
      <div style={{ height: '65vh' }} className="mt-3 border border-gray-700 rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => setContextMenu(null)}
          fitView
          className="bg-gray-900"
        >
          <Background color="#374151" gap={20} />
          <Controls />
        </ReactFlow>
      </div>
      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
      />
      <CanvasContextMenu
        menu={contextMenu}
        editMode={false}
        groups={[]}
        onClose={() => setContextMenu(null)}
        onOpenPanel={c => { setPanelContent(c); setContextMenu(null) }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update agents/[slug]/page.tsx to import the new AgentCanvas**

Find the `AgentCanvas` function at the bottom of the file (around line 1204). Remove the entire function (from `// ─── Agent Canvas Tab ─────────────────────────────────────────────────────────` through the closing `}`).

Add this import at the top of the file with the other imports:

```typescript
import { AgentCanvas } from './AgentCanvas'
```

Remove the `NODE_TYPES` import since it's no longer used directly in page.tsx:

```typescript
// Remove this line:
import { NODE_TYPES } from '@/components/canvas/node-types'
```

Also remove the `@xyflow/react` import from page.tsx since it was only used by the inline AgentCanvas stub:

```typescript
// Remove this line:
import '@xyflow/react/dist/style.css'
// Remove this line:
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react'
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "AgentCanvas|agents/\[slug\]|error TS" | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/app/dashboard/agents/\[slug\]/AgentCanvas.tsx app/apps/dashboard/src/app/dashboard/agents/\[slug\]/page.tsx
git commit -m "feat(canvas): extract and rebuild AgentCanvas with radial layout, live activity, side panel"
```

---

## Task 9: Full build verification and GitHub push

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm exec tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: No errors.

- [ ] **Step 2: Run full build**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` or similar. Fix any remaining errors.

- [ ] **Step 3: Manual smoke test — start dev server**

```bash
cd /home/sinthetix/Agency/app/apps/dashboard
pnpm dev
```

Open `http://localhost:7341` and verify:
- `/dashboard/groups` — Canvas toggle shows the Groups canvas with group containers; agents nested inside; right-click shows context menu; clicking a group opens the side panel
- `/dashboard/network` — Full system canvas with OrchestratorNode at top; Live toggle animates edges
- `/dashboard/agents/[any-slug]` → Canvas tab — Radial layout with agent at center, skills and tools as satellites; Live toggle animates tool edges

- [ ] **Step 4: Push to GitHub**

```bash
cd /home/sinthetix/Agency
git push origin main
```

Expected: Push succeeds with all 9 commits from this feature.
