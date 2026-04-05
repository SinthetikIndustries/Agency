// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react'
import { NODE_TYPES } from '@/components/canvas/node-types'
import type { WorkspaceGroup, Agent } from '@/lib/api'

interface GroupsCanvasProps {
  groups: WorkspaceGroup[]
  allAgents: Agent[]
}

export function GroupsCanvas({ groups, allAgents }: GroupsCanvasProps) {
  const initialNodes: Node[] = []
  const initialEdges: Edge[] = []

  const memberAgentIds = new Set<string>()

  groups.forEach((group, gi) => {
    const gx = gi * 300
    initialNodes.push({
      id: `group-${group.id}`,
      type: 'groupNode',
      position: { x: gx, y: 80 },
      data: {
        label: group.name,
        hierarchyType: group.hierarchyType,
        memberCount: group.memberCount ?? 0,
        goals: group.goals ?? [],
      },
    })
  })

  // Unassigned agents at the bottom
  let ux = 0
  allAgents.forEach(agent => {
    if (!memberAgentIds.has(agent.identity.id)) {
      initialNodes.push({
        id: `agent-${agent.identity.id}`,
        type: 'agentNode',
        position: { x: ux * 180, y: 350 },
        data: {
          label: agent.identity.name,
          slug: agent.identity.slug,
          status: agent.identity.status,
          isOrchestrator: agent.identity.slug === 'orchestrator',
        },
      })
      ux++
    }
  })

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div style={{ height: '600px' }} className="border border-gray-700 rounded-lg overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        className="bg-gray-900"
      >
        <Background color="#374151" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
