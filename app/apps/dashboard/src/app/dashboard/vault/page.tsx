// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { vault, type VaultStatus } from '@/lib/api'

interface GraphStatus {
  nodes: number
  edges: number
  unresolvedLinks: number
}

export default function VaultPage() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [graph, setGraph] = useState<GraphStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    Promise.all([
      vault.status().then(setStatus).catch(() => {}),
      vault.graphStatus().then(setGraph).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  async function triggerSync() {
    setSyncing(true)
    setError('')
    try {
      const res = await vault.sync()
      setActionMsg(res.message)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleString()
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Vault</h1>
          <p className="text-sm text-gray-500 mt-1">Knowledge base status and sync</p>
        </div>
        <button
          onClick={() => void triggerSync()}
          disabled={syncing || !status?.enabled}
          className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 px-4 py-2 rounded transition-colors"
        >
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {actionMsg && <p className="text-sm text-green-400 mb-4">{actionMsg}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-300 mb-4">Status</h2>
              <div className="space-y-3">
                <Row label="Enabled" value={
                  <span className={status?.enabled ? 'text-green-400' : 'text-gray-500'}>
                    {status?.enabled ? 'Yes' : 'No'}
                  </span>
                } />
                <Row label="Documents" value={<span className="text-white">{status?.documentCount ?? '—'}</span>} />
                <Row label="Errors" value={
                  <span className={status?.errorCount ? 'text-red-400' : 'text-gray-400'}>
                    {status?.errorCount ?? 0}
                  </span>
                } />
                <Row label="Last sync" value={<span className="text-gray-400 text-xs">{formatDate(status?.lastSyncAt ?? null)}</span>} />
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-300 mb-4">Knowledge Graph</h2>
              {graph ? (
                <div className="space-y-3">
                  <Row label="Nodes" value={<span className="text-white">{graph.nodes}</span>} />
                  <Row label="Edges" value={<span className="text-white">{graph.edges}</span>} />
                  <Row label="Unresolved links" value={
                    <span className={graph.unresolvedLinks > 0 ? 'text-yellow-400' : 'text-gray-400'}>
                      {graph.unresolvedLinks}
                    </span>
                  } />
                </div>
              ) : (
                <p className="text-sm text-gray-600">Graph unavailable</p>
              )}
            </div>
          </div>

          {!status?.enabled && (
            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4">
              <p className="text-sm text-yellow-400">
                Vault is disabled. Run <code className="font-mono text-xs">agency vault init --path &lt;dir&gt;</code> to enable it.
              </p>
            </div>
          )}
        </div>
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
