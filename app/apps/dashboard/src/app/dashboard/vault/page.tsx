// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { vault } from '@/lib/api'

interface GraphStatus {
  nodes: number
  edges: number
  unresolvedLinks: number
}

export default function VaultPage() {
  const [graph, setGraph] = useState<GraphStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    vault.graphStatus().then(setGraph).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Vault</h1>
        <p className="text-sm text-gray-500 mt-1">Knowledge graph stats</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : graph ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 max-w-sm">
          <h2 className="text-sm font-medium text-gray-300 mb-4">Knowledge Graph</h2>
          <div className="space-y-3">
            <Row label="Nodes" value={<span className="text-white">{graph.nodes}</span>} />
            <Row label="Edges" value={<span className="text-white">{graph.edges}</span>} />
            <Row label="Unresolved links" value={
              <span className={graph.unresolvedLinks > 0 ? 'text-yellow-400' : 'text-gray-400'}>
                {graph.unresolvedLinks}
              </span>
            } />
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Graph unavailable</p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
