// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import React, { useEffect, useState } from 'react'
import { audit, type AuditEntry } from '@/lib/api'

const ACTION_OPTIONS = [
  'all',
  'session.create',
  'session.send',
  'approval.approve',
  'approval.reject',
  'skill.install',
  'skill.remove',
  'connector.enable',
  'connector.disable',
  'agent.enable',
  'agent.disable',
]

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [actionFilter])

  function load() {
    setLoading(true)
    const params = actionFilter !== 'all' ? { action: actionFilter, limit: 200 } : { limit: 200 }
    audit.list(params)
      .then(r => setEntries(r.entries))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => prev === id ? null : id)
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">Record of all system actions</p>
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded px-2 py-1 focus:outline-none"
        >
          {ACTION_OPTIONS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">No audit entries found</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Action</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Actor</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Target</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <React.Fragment key={entry.id}>
                  <tr
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-blue-400">{entry.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{entry.actor}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {entry.target_type && entry.target_id
                        ? `${entry.target_type}:${entry.target_id.slice(0, 12)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-600">
                        {expanded === entry.id ? '▲' : '▼'}
                      </span>
                    </td>
                  </tr>
                  {expanded === entry.id && Object.keys(entry.details).length > 0 && (
                    <tr key={`${entry.id}-details`} className="border-b border-gray-800 bg-gray-800/20">
                      <td colSpan={5} className="px-4 py-3">
                        <pre className="text-xs text-gray-400 overflow-x-auto">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
