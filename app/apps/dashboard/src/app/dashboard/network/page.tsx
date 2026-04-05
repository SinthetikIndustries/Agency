// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import { useState, useEffect } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { agents, groups } from '@/lib/api'

export default function NetworkPage() {
  const [allAgents, setAllAgents] = useState<Awaited<ReturnType<typeof agents.list>>['agents']>([])
  const [allGroups, setAllGroups] = useState<Awaited<ReturnType<typeof groups.list>>['groups']>([])
  const [editMode, setEditMode] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, , onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    Promise.all([agents.list(), groups.list()]).then(([agentData, groupData]) => {
      setAllAgents(agentData.agents)
      setAllGroups(groupData.groups)
      buildGraph(agentData.agents, groupData.groups)
    }).catch(console.error)
  }, [])

  const buildGraph = (
    agentList: Awaited<ReturnType<typeof agents.list>>['agents'],
    groupList: Awaited<ReturnType<typeof groups.list>>['groups']
  ) => {
    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    // Orchestrator at top
    const orchestrator = agentList.find(a => a.identity.slug === 'orchestrator')
    if (orchestrator) {
      newNodes.push({
        id: 'agent-orchestrator',
        type: 'agentNode',
        position: { x: 400, y: 0 },
        data: { label: orchestrator.identity.name, slug: 'orchestrator', status: orchestrator.identity.status, isOrchestrator: true },
      })
    }

    // Groups
    groupList.forEach((group, i) => {
      newNodes.push({
        id: `group-${group.id}`,
        type: 'groupNode',
        position: { x: i * 280, y: 200 },
        data: { label: group.name, hierarchyType: group.hierarchyType, memberCount: group.memberCount ?? 0, goals: group.goals ?? [] },
      })
    })

    // Other agents
    const nonOrch = agentList.filter(a => a.identity.slug !== 'orchestrator')
    nonOrch.forEach((agent, i) => {
      newNodes.push({
        id: `agent-${agent.identity.id}`,
        type: 'agentNode',
        position: { x: i * 180, y: 450 },
        data: { label: agent.identity.name, slug: agent.identity.slug, status: agent.identity.status },
      })
      // Edge from orchestrator to each agent
      if (orchestrator) {
        newEdges.push({
          id: `orch-${agent.identity.id}`,
          source: 'agent-orchestrator',
          target: `agent-${agent.identity.id}`,
          style: { strokeDasharray: '5 5', stroke: '#6b7280' },
        })
      }
    })

    setNodes(newNodes)
  }

  // Suppress unused variable warnings — state is used for potential future features
  void allAgents
  void allGroups

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Network</h1>
          <p className="text-gray-400 text-sm mt-1">Global view of all agents and groups</p>
        </div>
        <CanvasToolbar editMode={editMode} onToggleEdit={() => setEditMode(e => !e)} />
      </div>
      <div style={{ height: '70vh' }} className="border border-gray-700 rounded-lg overflow-hidden">
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
          <MiniMap className="bg-gray-800" />
        </ReactFlow>
      </div>
    </div>
  )
}
