// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { approvals, type Approval } from '@/lib/api'

export default function ApprovalsPage() {
  const [list, setList] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    approvals.list()
      .then(r => setList(r.approvals))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  async function decide(id: string, approve: boolean) {
    try {
      if (approve) {
        await approvals.approve(id)
      } else {
        await approvals.reject(id)
      }
      setActionMsg(`Request ${approve ? 'approved' : 'rejected'}`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const pending = list.filter(a => a.status === 'pending')
  const resolved = list.filter(a => a.status !== 'pending')

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Pending tool execution approvals</p>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {actionMsg && <p className="text-sm text-green-400 mb-4">{actionMsg}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          {pending.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-600">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(a => (
                <ApprovalCard key={a.id} approval={a} onDecide={decide} />
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div>
              <h2 className="text-xs text-gray-600 uppercase tracking-wider mb-3">Recent</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Tool</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Agent</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolved.map(a => (
                      <tr key={a.id} className="border-b border-gray-800 last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-gray-300">{a.tool_name}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{a.agent_id.slice(0, 8)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            a.status === 'approved' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: Approval
  onDecide: (id: string, approve: boolean) => void
}) {
  const [input, setInput] = useState<Record<string, unknown>>({})

  useEffect(() => {
    try {
      setInput(JSON.parse(approval.tool_input) as Record<string, unknown>)
    } catch {
      setInput({})
    }
  }, [approval.tool_input])

  return (
    <div className="bg-gray-900 border border-yellow-800/50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="font-mono text-sm text-white">{approval.tool_name}</span>
          <span className="ml-2 text-xs text-gray-600">by {approval.agent_id.slice(0, 8)}</span>
        </div>
        <span className="text-xs text-gray-600 shrink-0">
          {new Date(approval.created_at).toLocaleString()}
        </span>
      </div>

      {approval.reason && (
        <p className="text-xs text-gray-400 mb-3">{approval.reason}</p>
      )}

      {Object.keys(input).length > 0 && (
        <pre className="text-xs bg-gray-800 text-gray-300 rounded p-3 mb-3 overflow-x-auto">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onDecide(approval.id, true)}
          className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => onDecide(approval.id, false)}
          className="text-xs bg-red-900/50 hover:bg-red-900 text-red-300 px-3 py-1.5 rounded transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
