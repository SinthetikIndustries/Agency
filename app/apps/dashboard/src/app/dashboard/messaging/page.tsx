// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import { messaging, sessions, agents as agentsApi, type InboxDepth, type RecentMessage } from '@/lib/api'

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-900/50 text-yellow-400',
  delivered: 'bg-blue-900/50 text-blue-400',
  read: 'bg-green-900/50 text-green-400',
  expired: 'bg-gray-800 text-gray-500',
  dead: 'bg-red-900/50 text-red-400',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-orange-400',
  normal: 'text-gray-400',
}

export default function MessagingPage() {
  const [depths, setDepths] = useState<InboxDepth[]>([])
  const [messages, setMessages] = useState<RecentMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [invokeAgent, setInvokeAgent] = useState('')
  const [invokePrompt, setInvokePrompt] = useState('')
  const [invokeResponse, setInvokeResponse] = useState<{ agentName: string; response: string; timestamp: Date } | null>(null)
  const [invokeLoading, setInvokeLoading] = useState(false)
  const [invokeError, setInvokeError] = useState('')
  const [invokeOpen, setInvokeOpen] = useState(true)
  const [agentList, setAgentList] = useState<Array<{ slug: string; name: string }>>([])

  const load = useCallback(() => {
    messaging.status()
      .then(r => {
        setDepths(r.inboxDepths.sort((a, b) => b.total - a.total))
        setMessages(r.recentMessages)
        setError('')
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  useEffect(() => {
    agentsApi.list()
      .then(d => setAgentList(
        d.agents.map((a) => ({ slug: a.identity?.slug ?? '', name: a.identity?.name ?? '' }))
          .filter((a) => a.slug)
      ))
      .catch(() => {})
  }, [])

  const handleInvoke = async () => {
    if (!invokeAgent || !invokePrompt.trim()) return
    setInvokeLoading(true)
    setInvokeError('')
    setInvokeResponse(null)
    try {
      const { session } = await sessions.create(invokeAgent, 'dashboard')
      const data = await sessions.send(session.id, invokePrompt)
      const agentName = agentList.find(a => a.slug === invokeAgent)?.name ?? invokeAgent
      setInvokeResponse({ agentName, response: data.response, timestamp: new Date() })
      setInvokePrompt('')
    } catch (err) {
      setInvokeError(err instanceof Error ? err.message : 'Invocation failed')
    } finally {
      setInvokeLoading(false)
    }
  }

  const filteredMessages = filter
    ? messages.filter(m =>
        m.subject.toLowerCase().includes(filter.toLowerCase()) ||
        m.fromAgentId.includes(filter) ||
        m.toAgentId.includes(filter) ||
        m.status.includes(filter)
      )
    : messages

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Messaging</h1>
          <p className="text-sm text-gray-500 mt-1">Inter-agent message queues</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-blue-500"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={load}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Invoke Agent panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setInvokeOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
        >
          <div>
            <span className="text-sm font-medium text-white">Invoke Agent</span>
            <span className="text-xs text-gray-500 ml-2">Send a prompt and wait for response</span>
          </div>
          <span className="text-gray-500 text-xs">{invokeOpen ? '▲' : '▼'}</span>
        </button>

        {invokeOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
            <div className="flex gap-3 pt-3">
              <select
                value={invokeAgent}
                onChange={e => setInvokeAgent(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-500 w-48"
              >
                <option value="">Select agent…</option>
                {agentList.map(a => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
              <textarea
                value={invokePrompt}
                onChange={e => setInvokePrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleInvoke() }}
                placeholder="Enter prompt… (Cmd+Enter to send)"
                rows={2}
                className="flex-1 bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-500 resize-none"
              />
              <button
                onClick={() => void handleInvoke()}
                disabled={invokeLoading || !invokeAgent || !invokePrompt.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm px-4 py-1.5 rounded transition-colors whitespace-nowrap"
              >
                {invokeLoading ? 'Running…' : 'Invoke'}
              </button>
            </div>

            {invokeError && (
              <p className="text-xs text-red-400">{invokeError}</p>
            )}

            {invokeResponse && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-400">{invokeResponse.agentName}</span>
                  <span className="text-xs text-gray-600">{invokeResponse.timestamp.toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{invokeResponse.response}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Inbox depths */}
          <div>
            <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Inbox Queue Depths</h2>
            {depths.length === 0 ? (
              <p className="text-sm text-gray-600">No agents found or Redis not configured.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {depths.map(d => (
                  <div
                    key={d.agentId}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-white">{d.agentName}</p>
                        <p className="text-xs text-gray-600 font-mono">{d.agentSlug}</p>
                      </div>
                      <span className={`text-lg font-bold ${d.total > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                        {d.total}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <div className="flex-1 bg-gray-800 rounded px-2 py-1">
                        <span className="text-orange-400 font-medium">{d.high}</span>
                        <span className="text-gray-600 ml-1">high</span>
                      </div>
                      <div className="flex-1 bg-gray-800 rounded px-2 py-1">
                        <span className="text-gray-300 font-medium">{d.normal}</span>
                        <span className="text-gray-600 ml-1">normal</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent messages */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xs text-gray-500 uppercase tracking-wider">Recent Messages</h2>
              <input
                type="text"
                placeholder="Filter by subject, agent, status…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="ml-auto bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-500 w-56"
              />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">From</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">To</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Subject</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Priority</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Status</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMessages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-600 text-xs">
                        No messages
                      </td>
                    </tr>
                  ) : (
                    filteredMessages.map(m => (
                      <tr key={m.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-400 truncate max-w-[120px]">
                          {m.fromAgentId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-400 truncate max-w-[120px]">
                          {m.toAgentId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-300 max-w-[200px] truncate">
                          {m.subject}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className={PRIORITY_COLORS[m.priority] ?? 'text-gray-400'}>
                            {m.priority}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[m.status] ?? 'bg-gray-800 text-gray-400'}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
