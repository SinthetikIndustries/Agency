// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import { grid, type GridGraphNode, type GridEdge } from '@/lib/api'
import { GridGraph3D } from './GridGraph3D'
import { GridTreeView } from './GridTreeView'
import { NodeEditorPanel } from './NodeEditorPanel'

type Tab = 'graph' | 'tree' | 'status'

export default function GridPage() {
  const [tab, setTab] = useState<Tab>('graph')

  // Graph data
  const [nodes, setNodes] = useState<GridGraphNode[]>([])
  const [edges, setEdges] = useState<GridEdge[]>([])
  const [graphLoading, setGraphLoading] = useState(true)

  // Status
  const [status, setStatus] = useState<{ nodeCount: number; edgeCount: number; lastUpdated: string | null } | null>(null)
  const [candidates, setCandidates] = useState<Array<{ node_a_label: string; node_b_label: string; shared_neighbors: number }>>([])

  // Editor
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // ─── Load graph ────────────────────────────────────────────────────────────

  const loadGraph = useCallback(async () => {
    setGraphLoading(true)
    try {
      const data = await grid.graph()
      setNodes(data.nodes)
      setEdges(data.edges)
    } catch {
      // grid not yet populated
    } finally {
      setGraphLoading(false)
    }
  }, [])

  useEffect(() => { void loadGraph() }, [loadGraph])

  // ─── Load status + candidates ──────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'status') return
    grid.status().then(setStatus).catch(() => {})
    grid.candidates().then(r => setCandidates(r.candidates)).catch(() => {})
  }, [tab])

  // ─── New node ──────────────────────────────────────────────────────────────

  async function handleNewNode() {
    const label = prompt('Node label:')
    if (!label?.trim()) return
    const node = await grid.createNode({ label: label.trim(), type: 'concept', source: 'user' })
    await loadGraph()
    setSelectedNodeId(node.id)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-6 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">The Grid</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {nodes.length} nodes · {edges.length} edges
          </p>
        </div>
        <button
          onClick={() => void handleNewNode()}
          className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded transition-colors"
        >
          + New node
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-8 flex-shrink-0 border-b border-gray-800">
        {(['graph', 'tree', 'status'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">

        {/* ── Graph ── */}
        {tab === 'graph' && (
          graphLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Loading Grid…
            </div>
          ) : (
            <GridGraph3D
              nodes={nodes}
              edges={edges}
              onNodeClick={n => setSelectedNodeId(n.id)}
              className="w-full h-full"
            />
          )
        )}

        {/* ── Tree ── */}
        {tab === 'tree' && (
          <GridTreeView
            nodes={nodes}
            onNodeSelect={id => setSelectedNodeId(id)}
          />
        )}

        {/* ── Status ── */}
        {tab === 'status' && (
          <div className="p-8 overflow-y-auto h-full space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Nodes', value: status?.nodeCount ?? '—' },
                { label: 'Edges', value: status?.edgeCount ?? '—' },
                { label: 'Last updated', value: status?.lastUpdated
                  ? new Date(status.lastUpdated).toLocaleString() : '—' },
              ].map(s => (
                <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                </div>
              ))}
            </div>

            {candidates.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-300 mb-3">
                  Candidate Connections
                  <span className="text-xs text-gray-600 font-normal ml-2">
                    Nodes that share neighbors but have no direct link
                  </span>
                </h2>
                <div className="space-y-1">
                  {candidates.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-900 border border-gray-800 rounded text-sm">
                      <span className="text-gray-300">{c.node_a_label}</span>
                      <span className="text-gray-600 text-xs px-2">
                        {c.shared_neighbors} shared
                      </span>
                      <span className="text-gray-300">{c.node_b_label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Node editor panel */}
      <NodeEditorPanel
        nodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        onSaved={() => void loadGraph()}
      />
    </div>
  )
}
