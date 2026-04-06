// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import { useState, useCallback } from 'react'
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type OnNodeDrag, type NodeMouseHandler,
} from '@xyflow/react'
import { useRouter } from 'next/navigation'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import { computeGroupsLayout, savePositions, clearSavedPositions, type GroupWithMembers } from '@/components/canvas/canvas-layout'
import { groups as groupsApi } from '@/lib/api'
import type { WorkspaceGroup, Agent } from '@/lib/api'

// ─── Props ────────────────────────────────────────────────────────────────────

interface GroupsCanvasProps {
  groups: WorkspaceGroup[]
  groupsWithMembers: GroupWithMembers[]
  allAgents: Agent[]
}

// ─── Inner canvas (needs ReactFlowProvider context) ───────────────────────────

function GroupsCanvasInner({ groups, groupsWithMembers, allAgents }: GroupsCanvasProps) {
  const router = useRouter()
  const { fitView, screenToFlowPosition } = useReactFlow()

  const { nodes: initialNodes, edges: initialEdges } = computeGroupsLayout(groupsWithMembers, allAgents)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const [editMode, setEditMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  // ─── Reset layout ──────────────────────────────────────────────────────────

  const handleResetLayout = useCallback(() => {
    clearSavedPositions('groups')
    const { nodes: fresh, edges: freshEdges } = computeGroupsLayout(groupsWithMembers, allAgents)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ padding: 0.1 }), 50)
  }, [groupsWithMembers, allAgents, setNodes, setEdges, fitView])

  // ─── Drag-drop: move agent into/out of group ──────────────────────────────

  const handleNodeDragStopWithGrouping = useCallback<OnNodeDrag>(async (_, node, allNodes) => {
    savePositions('groups', allNodes as Node[])
    if (!editMode) return
    if (!node.id.startsWith('agent-')) return

    const agentId = node.id.replace('agent-', '')

    const groupNode = (allNodes as Node[]).find(n =>
      n.id.startsWith('group-') &&
      n.position.x <= node.position.x &&
      node.position.x <= n.position.x + ((n.measured?.width as number | undefined) ?? 260) &&
      n.position.y <= node.position.y &&
      node.position.y <= n.position.y + ((n.measured?.height as number | undefined) ?? 200)
    )

    const currentParent = node.parentId
    const targetGroupId = groupNode?.id.replace('group-', '')

    try {
      if (targetGroupId && targetGroupId !== currentParent?.replace('group-', '')) {
        if (currentParent) {
          await groupsApi.removeMember(currentParent.replace('group-', ''), agentId)
        }
        await groupsApi.addMember(targetGroupId, { agentId, role: 'member' })
      }
    } catch {
      // Silently ignore — layout will be stale until next load
    }
  }, [editMode])

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
    setContextMenu({
      kind: 'pane',
      x: clientX,
      y: clientY,
      flowX: flowPos.x,
      flowY: flowPos.y,
    })
  }, [screenToFlowPosition])

  // ─── Side panel / context menu actions ────────────────────────────────────

  const handleAddMemberToGroup = useCallback(async (agentId: string, groupId: string) => {
    await groupsApi.addMember(groupId, { agentId, role: 'member' })
    const { nodes: fresh, edges: freshEdges } = computeGroupsLayout(groupsWithMembers, allAgents)
    setNodes(fresh)
    setEdges(freshEdges)
  }, [groupsWithMembers, allAgents, setNodes, setEdges])

  const handleRemoveFromGroup = useCallback(async (agentId: string, groupId: string) => {
    await groupsApi.removeMember(groupId, agentId)
    const { nodes: fresh, edges: freshEdges } = computeGroupsLayout(groupsWithMembers, allAgents)
    setNodes(fresh)
    setEdges(freshEdges)
  }, [groupsWithMembers, allAgents, setNodes, setEdges])

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    await groupsApi.delete(groupId)
    const { nodes: fresh, edges: freshEdges } = computeGroupsLayout(
      groupsWithMembers.filter(g => g.id !== groupId),
      allAgents
    )
    setNodes(fresh)
    setEdges(freshEdges)
  }, [groupsWithMembers, allAgents, setNodes, setEdges])

  return (
    <div className="flex flex-col gap-3">
      <CanvasToolbar
        editMode={editMode}
        onToggleEdit={() => setEditMode(e => !e)}
        onFitView={() => fitView({ padding: 0.1 })}
        onResetLayout={handleResetLayout}
        onAddGroup={() => window.dispatchEvent(new CustomEvent('canvas:new-group'))}
      />
      <div style={{ height: '70vh' }} className="border border-gray-700 rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStopWithGrouping}
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
          className="bg-gray-900"
        >
          <Background color="#374151" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
        onGroupDeleted={(groupId) => {
          setNodes(nds => nds.filter(n => n.id !== `group-${groupId}`))
          setEdges(eds => eds.filter(e => !e.id.includes(`group-${groupId}`)))
          setPanelContent(null)
        }}
      />

      <CanvasContextMenu
        menu={contextMenu}
        editMode={editMode}
        groups={groups.map(g => ({ id: g.id, name: g.name }))}
        onClose={() => setContextMenu(null)}
        onOpenPanel={setPanelContent}
        onAddMemberToGroup={handleAddMemberToGroup}
        onRemoveFromGroup={handleRemoveFromGroup}
        onDeleteGroup={handleDeleteGroup}
        onNewGroup={(_flowX, _flowY) => window.dispatchEvent(new CustomEvent('canvas:new-group'))}
        onNavigateToAgent={(slug) => router.push(`/dashboard/agents/${slug}`)}
      />
    </div>
  )
}

// ─── Export (wrapped in provider) ────────────────────────────────────────────

export function GroupsCanvas(props: GroupsCanvasProps) {
  return (
    <ReactFlowProvider>
      <GroupsCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
