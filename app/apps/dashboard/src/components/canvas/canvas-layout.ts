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
  try {
    localStorage.setItem(`canvas-positions-${surfaceId}`, JSON.stringify(positions))
  } catch {
    // Quota exceeded or storage unavailable — silently skip persistence
  }
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
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      })
    })

    if (h > maxRowH) maxRowH = h
    colX += w + GROUP_COL_GAP
    col++
  }

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

  const orchestrator = allAgents.find(a => a.identity.slug === 'orchestrator')

  groupsWithMembers.forEach(group => {
    const { w, h } = groupDimensions(group.members.length)
    g.setNode(`group-${group.id}`, { width: w, height: h, label: group.name })
  })

  allAgents
    .filter(a => !assignedAgentIds.has(a.identity.id) && a.identity.slug !== 'orchestrator')
    .forEach(agent => {
      g.setNode(`agent-${agent.identity.id}`, { width: 170, height: 80 })
    })

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

  groupsWithMembers.forEach(group => {
    const pos = g.node(`group-${group.id}`)
    if (!pos) return
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
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      })
    })
  })

  allAgents
    .filter(a => !assignedAgentIds.has(a.identity.id) && a.identity.slug !== 'orchestrator')
    .forEach(agent => {
      const pos = g.node(`agent-${agent.identity.id}`)
      if (!pos) return
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
      style: { stroke: '#0d9488', strokeWidth: 2 },
    })
  })

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
      style: { stroke: '#64748b', strokeWidth: 1.5 },
    })
  })

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
      style: { stroke: '#d97706', strokeDasharray: '4 2', strokeWidth: 1.5 },
    })
  })

  return { nodes: applyOverrides(nodes, saved), edges }
}
