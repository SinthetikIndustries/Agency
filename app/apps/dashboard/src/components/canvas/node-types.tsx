// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { Handle, Position } from '@xyflow/react'

interface GroupNodeData {
  label: string
  hierarchyType: string
  memberCount: number
  goals: string[]
}

export function GroupNode({ data }: { data: GroupNodeData }) {
  return (
    <div className="bg-gray-800 border-2 border-blue-500 rounded-lg p-3 min-w-[180px]">
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-blue-400 text-xs px-1.5 py-0.5 bg-blue-900 rounded">{data.hierarchyType}</span>
        <span className="text-xs text-gray-400">{data.memberCount} members</span>
      </div>
      <p className="text-white text-sm font-medium">{data.label}</p>
      {data.goals?.slice(0, 2).map((g, i) => (
        <p key={i} className="text-gray-400 text-xs mt-0.5 truncate">• {g}</p>
      ))}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

interface AgentNodeData {
  label: string
  slug: string
  status: string
  isOrchestrator?: boolean
}

export function AgentNode({ data }: { data: AgentNodeData }) {
  return (
    <div className={`rounded-lg p-3 min-w-[140px] border ${
      data.isOrchestrator
        ? 'bg-purple-900 border-purple-400'
        : 'bg-gray-700 border-gray-500'
    }`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          data.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
        }`} />
        <p className="text-white text-sm font-medium truncate">{data.label}</p>
      </div>
      <p className="text-gray-400 text-xs mt-0.5">{data.slug}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

interface SkillNodeData { label: string; version: string }
export function SkillNode({ data }: { data: SkillNodeData }) {
  return (
    <div className="bg-green-900 border border-green-600 rounded-lg p-2 min-w-[120px]">
      <Handle type="target" position={Position.Top} />
      <p className="text-green-300 text-xs font-mono">{data.label}</p>
      <p className="text-green-500 text-xs">{data.version}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

interface ToolNodeData { label: string; toolType: string }
export function ToolNode({ data }: { data: ToolNodeData }) {
  return (
    <div className="bg-gray-900 border border-gray-600 rounded p-2 min-w-[100px]">
      <Handle type="target" position={Position.Top} />
      <p className="text-gray-300 text-xs font-mono truncate">{data.label}</p>
      <p className="text-gray-500 text-xs">{data.toolType}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

interface WorkspaceNodeData { label: string; path: string }
export function WorkspaceNode({ data }: { data: WorkspaceNodeData }) {
  return (
    <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-2 min-w-[150px]">
      <Handle type="target" position={Position.Top} />
      <p className="text-yellow-300 text-xs font-medium">{data.label}</p>
      <p className="text-yellow-500 text-xs truncate font-mono">{data.path}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const NODE_TYPES = {
  groupNode: GroupNode,
  agentNode: AgentNode,
  skillNode: SkillNode,
  toolNode: ToolNode,
  workspaceNode: WorkspaceNode,
}
