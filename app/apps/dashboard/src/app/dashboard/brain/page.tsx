// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import { brain, type BrainGraphNode, type BrainEdge, type BrainNode } from '@/lib/api'
import { BrainGraph3D } from './BrainGraph3D'
import { NodeEditorPanel } from './NodeEditorPanel'

type Tab = 'graph' | 'nodes' | 'status'

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>('graph')

  // Graph data
  const [nodes, setNodes] = useState<BrainGraphNode[]>([])
  const [edges, setEdges] = useState<BrainEdge[]>([])
  const [graphLoading, setGraphLoading] = useState(true)

  // Node list
  const [nodeList, setNodeList] = useState<BrainNode[]>([])
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<Array<BrainNode & { score: number }> | null>(null)
  const [searching, setSearching] = useState(false)

  // Status
  const [status, setStatus] = useState<{ nodeCount: number; edgeCount: number; lastUpdated: string | null } | null>(null)
  const [candidates, setCandidates] = useState<Array<{ node_a_label: string; node_b_label: string; shared_neighbors: number }>>([])

  // Editor
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // ─── Load graph ────────────────────────────────────────────────────────────

  const loadGraph = useCallback(async () => {
    setGraphLoading(true)
    try {
      const data = await brain.graph()
      setNodes(data.nodes)
      setEdges(data.edges)
    } catch {
      // brain not yet populated
    } finally {
      setGraphLoading(false)
    }
  }, [])

  useEffect(() => { void loadGraph() }, [loadGraph])

  // ─── Load node list ────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'nodes') return
    brain.nodes({ limit: 200 }).then(r => setNodeList(r.nodes)).catch(() => {})
  }, [tab])

  // ─── Load status + candidates ──────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'status') return
    brain.status().then(setStatus).catch(() => {})
    brain.candidates().then(r => setCandidates(r.candidates)).catch(() => {})
  }, [tab])

  // ─── Search ────────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!searchQ.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const r = await brain.search(searchQ.trim(), { limit: 30 })
      setSearchResults(r.results)
    } finally {
      setSearching(false)
    }
  }

  // ─── New node ──────────────────────────────────────────────────────────────

  async function handleNewNode() {
    const label = prompt('Node label:')
    if (!label?.trim()) return
    const node = await brain.createNode({ label: label.trim(), type: 'concept', source: 'user' })
    await loadGraph()
    setSelectedNodeId(node.id)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-6 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">The Brain</h1>
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
        {(['graph', 'nodes', 'status'] as Tab[]).map(t => (
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
              Loading brain…
            </div>
          ) : (
            <BrainGraph3D
              nodes={nodes}
              edges={edges}
              onNodeClick={n => setSelectedNodeId(n.id)}
              className="w-full h-full"
            />
          )
        )}

        {/* ── Nodes ── */}
        {tab === 'nodes' && (
          <div className="flex flex-col h-full">
            <div className="flex gap-2 px-6 py-3 border-b border-gray-800 flex-shrink-0">
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
                placeholder="Semantic search…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => void handleSearch()}
                disabled={searching}
                className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                {searching ? '…' : 'Search'}
              </button>
              {searchResults && (
                <button
                  onClick={() => setSearchResults(null)}
                  className="text-sm text-gray-600 hover:text-gray-400 px-2"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
              {(searchResults ?? nodeList).map(n => (
                <button
                  key={n.id}
                  onClick={() => setSelectedNodeId(n.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-800 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 group-hover:bg-gray-700 text-indigo-300 capitalize flex-shrink-0">
                      {n.type}
                    </span>
                    <span className="text-sm text-gray-200 truncate">{n.label}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    {'score' in n && (
                      <span className="text-xs text-gray-600">
                        {((n as BrainNode & { score: number }).score * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-xs text-gray-600">
                      {(n.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
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
