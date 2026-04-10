// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type OnNodeDrag, type NodeMouseHandler,
} from '@xyflow/react'
import { useRouter } from 'next/navigation'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import { computeNetworkLayout, savePositions, clearSavedPositions, type GroupWithMembers } from '@/components/canvas/canvas-layout'
import { agents, groups } from '@/lib/api'
import type { Agent, WorkspaceGroup } from '@/lib/api'

// ─── Inner (needs ReactFlowProvider context) ──────────────────────────────────

function NetworkPageInner() {
  const router = useRouter()
  const { fitView, screenToFlowPosition } = useReactFlow()

  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [groupsWithMembers, setGroupsWithMembers] = useState<GroupWithMembers[]>([])
  const [loading, setLoading] = useState(true)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [editMode, setEditMode] = useState(false)
  const [liveMode, setLiveMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const livePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async (fitAfter = false) => {
    try {
      const [agentData, groupData] = await Promise.all([agents.list(), groups.list()])
      const withMembers: GroupWithMembers[] = await Promise.all(
        groupData.groups.map(g =>
          groups.get(g.id).then(d => ({ ...g, members: d.members }))
        )
      )
      setAllAgents(agentData.agents)
      setGroupsWithMembers(withMembers)
      const { nodes: fresh, edges: freshEdges } = computeNetworkLayout(agentData.agents, withMembers)
      setNodes(fresh)
      setEdges(freshEdges)
      if (fitAfter) setTimeout(() => fitView({ padding: 0.1 }), 50)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [setNodes, setEdges, fitView])

  useEffect(() => { void load(true) }, [load])

  // ─── Live mode ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (liveMode) {
      livePollRef.current = setInterval(() => { void load(false) }, 5000)
    } else {
      if (livePollRef.current) clearInterval(livePollRef.current)
    }
    return () => { if (livePollRef.current) clearInterval(livePollRef.current) }
  }, [liveMode, load])

  // ─── Position persistence ─────────────────────────────────────────────────

  const handleNodeDragStop = useCallback<OnNodeDrag>((_, _node, allNodes) => {
    savePositions('network', allNodes as Node[])
  }, [])

  const handleResetLayout = useCallback(() => {
    clearSavedPositions('network')
    const { nodes: fresh, edges: freshEdges } = computeNetworkLayout(allAgents, groupsWithMembers)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ padding: 0.1 }), 50)
  }, [allAgents, groupsWithMembers, setNodes, setEdges, fitView])

  // ─── Context menu ─────────────────────────────────────────────────────────

  const handleNodeContextMenu = useCallback<NodeMouseHandler>((event, node) => {
    event.preventDefault()
    setContextMenu({
      kind: 'node',
      nodeId: node.id,
      nodeType: node.type ?? 'agentNode',
      x: event.clientX,
      y: event.clientY,
      parentId: node.parentId,
    })
  }, [])

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    const clientX = 'clientX' in event ? event.clientX : 0
    const clientY = 'clientY' in event ? event.clientY : 0
    const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
    setContextMenu({ kind: 'pane', x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Loading network…</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Network</h1>
          <p className="text-gray-400 text-sm mt-1">Global view of all agents and groups</p>
        </div>
        <CanvasToolbar
          editMode={editMode}
          onToggleEdit={() => setEditMode(e => !e)}
          onFitView={() => fitView({ padding: 0.1 })}
          onResetLayout={handleResetLayout}
          liveMode={liveMode}
          onToggleLive={() => setLiveMode(l => !l)}
        />
      </div>
      <div style={{ height: '75vh' }} className="border border-gray-700 rounded-lg overflow-hidden">
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
            if (node.type === 'groupNode') {
              setPanelContent({ type: 'group', groupId: node.id.replace('group-', '') })
            } else if (node.type === 'agentNode' || node.type === 'orchestratorNode') {
              const slug = node.data?.slug as string | undefined
              if (slug) setPanelContent({ type: 'agent', slug })
            }
          }}
          fitView
          defaultEdgeOptions={{
            style: { stroke: '#6b7280', strokeWidth: 2 },
            animated: false,
          }}
          className="bg-gray-950"
        >
          <Background color="#1f2937" gap={24} />
          <Controls />
          <MiniMap className="bg-gray-900" nodeColor="#374151" maskColor="rgba(0,0,0,0.4)" />
        </ReactFlow>
      </div>

      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
        onGroupUpdated={() => void load(false)}
        onGroupDeleted={() => void load(false)}
        onMemberAdded={() => void load(false)}
        onMemberRemoved={() => void load(false)}
      />

      <CanvasContextMenu
        menu={contextMenu}
        editMode={editMode}
        groups={groupsWithMembers.map(g => ({ id: g.id, name: g.name }))}
        onClose={() => setContextMenu(null)}
        onOpenPanel={setPanelContent}
        onDeleteGroup={async (groupId) => {
          await groups.delete(groupId)
          void load(false)
        }}
        onNewGroup={(_flowX, _flowY) => { /* Groups are managed from the groups page */ }}
        onNavigateToAgent={(slug) => router.push(`/dashboard/agents/${slug}`)}
      />
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function NetworkPage() {
  return (
    <ReactFlowProvider>
      <NetworkPageInner />
    </ReactFlowProvider>
  )
}
