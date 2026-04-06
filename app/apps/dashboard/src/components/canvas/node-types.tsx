// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { Handle, Position, NodeResizer, NodeToolbar, type NodeProps } from '@xyflow/react'

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
  const d = data as unknown as GroupNodeData
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
  const d = data as unknown as AgentNodeData
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
  const d = data as unknown as OrchestratorNodeData
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
  const d = data as unknown as SkillNodeData
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
  const d = data as unknown as ToolNodeData
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
  const d = data as unknown as WorkspaceNodeData
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
