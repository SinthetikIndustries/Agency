// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import { useState, useCallback, useEffect } from 'react'
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type OnNodeDrag, type NodeMouseHandler,
} from '@xyflow/react'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import { computeAgentLayout, savePositions, clearSavedPositions } from '@/components/canvas/canvas-layout'
import { agentSkills as agentSkillsApi } from '@/lib/api'
import type { Agent, AgentSkill } from '@/lib/api'

// ─── Inner (needs ReactFlowProvider context) ──────────────────────────────────

function AgentCanvasInner({ agent }: { agent: Agent }) {
  const { fitView, screenToFlowPosition } = useReactFlow()
  const surfaceId = `agent-${agent.identity.slug}`

  const [agentSkillList, setAgentSkillList] = useState<AgentSkill[]>([])

  useEffect(() => {
    agentSkillsApi.list(agent.identity.slug)
      .then(r => setAgentSkillList(r.skills))
      .catch(() => {})
  }, [agent.identity.slug])

  const getLayout = useCallback((skills: AgentSkill[]) => {
    return computeAgentLayout(
      agent,
      skills,
      agent.identity.additionalWorkspacePaths ?? [],
      surfaceId
    )
  }, [agent, surfaceId])

  const { nodes: initialNodes, edges: initialEdges } = getLayout(agentSkillList)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges)

  // Re-layout when skills load
  useEffect(() => {
    if (agentSkillList.length === 0) return
    const { nodes: fresh, edges: freshEdges } = getLayout(agentSkillList)
    setNodes(fresh)
    setEdges(freshEdges)
  }, [agentSkillList, getLayout, setNodes, setEdges])

  const [editMode, setEditMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const handleNodeDragStop = useCallback<OnNodeDrag>((_, _node, allNodes) => {
    savePositions(surfaceId, allNodes as Node[])
  }, [surfaceId])

  const handleResetLayout = useCallback(() => {
    clearSavedPositions(surfaceId)
    const { nodes: fresh, edges: freshEdges } = getLayout(agentSkillList)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ padding: 0.15 }), 50)
  }, [surfaceId, getLayout, agentSkillList, setNodes, setEdges, fitView])

  const handleNodeContextMenu = useCallback<NodeMouseHandler>((event, node) => {
    event.preventDefault()
    setContextMenu({
      kind: 'node',
      nodeId: node.id,
      nodeType: node.type ?? 'agentNode',
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    const clientX = 'clientX' in event ? event.clientX : 0
    const clientY = 'clientY' in event ? event.clientY : 0
    const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
    setContextMenu({ kind: 'pane', x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  return (
    <div className="flex flex-col gap-3">
      <CanvasToolbar
        editMode={editMode}
        onToggleEdit={() => setEditMode(e => !e)}
        onFitView={() => fitView({ padding: 0.15 })}
        onResetLayout={handleResetLayout}
      />
      <div style={{ height: '70vh' }} className="border border-gray-700 rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeClick={(_e, node) => {
            if (node.type === 'skillNode') {
              setPanelContent({ type: 'skill', skillId: node.id.replace('skill-', ''), agentSlug: agent.identity.slug })
            } else if (node.type === 'toolNode') {
              setPanelContent({ type: 'tool', toolName: node.id.replace('tool-', ''), agentSlug: agent.identity.slug })
            } else if (node.type === 'workspaceNode') {
              const path = node.data?.path as string ?? ''
              setPanelContent({ type: 'workspace', path, agentSlug: agent.identity.slug })
            }
          }}
          fitView
          className="bg-gray-900"
        >
          <Background color="#374151" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
      />

      <CanvasContextMenu
        menu={contextMenu}
        editMode={editMode}
        groups={[]}
        onClose={() => setContextMenu(null)}
        onOpenPanel={setPanelContent}
        onNewGroup={(_flowX, _flowY) => {}}
      />
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function AgentCanvas({ agent }: { agent: Agent }) {
  return (
    <ReactFlowProvider>
      <AgentCanvasInner agent={agent} />
    </ReactFlowProvider>
  )
}
