// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import { mcp, type McpServer } from '@/lib/api'

const STATUS_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  connected:       { dot: 'bg-green-400',               badge: 'bg-green-900/50 text-green-400',   label: 'Connected'       },
  connecting:      { dot: 'bg-yellow-400 animate-pulse', badge: 'bg-yellow-900/50 text-yellow-400', label: 'Connecting'      },
  pending_restart: { dot: 'bg-yellow-400',               badge: 'bg-yellow-900/50 text-yellow-400', label: 'Pending restart' },
  error:           { dot: 'bg-red-400',                 badge: 'bg-red-900/50 text-red-400',       label: 'Error'           },
  disconnected:    { dot: 'bg-gray-600',                badge: 'bg-gray-800 text-gray-500',        label: 'Disconnected'    },
}

function getTransportLabel(config: Record<string, unknown>): string {
  if ('command' in config) return 'stdio'
  if ('type' in config && typeof config.type === 'string') return config.type
  if ('url' in config) return 'http'
  return 'unknown'
}

const ADD_PLACEHOLDER = `// stdio example (local process):
{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "..." } }

// Remote / SSE example:
{ "url": "https://your-server.com/mcp", "type": "sse" }`

function ServerRow({
  server,
  onToggle,
  onDelete,
  onReconnect,
  busy,
}: {
  server: McpServer
  onToggle: (name: string, enable: boolean) => void
  onDelete: (name: string) => void
  onReconnect: (name: string) => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const s = STATUS_STYLES[server.status] ?? STATUS_STYLES['disconnected']!
  const transport = getTransportLabel(server.config)
  const url = typeof server.config.url === 'string' ? server.config.url : null
  const disabled = !server.enabled

  return (
    <>
      <tr className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/30 ${disabled ? 'opacity-50' : ''}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className="font-medium text-white text-sm">{server.name}</span>
            {disabled && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">disabled</span>
            )}
          </div>
          {server.error && (
            <p className="text-xs text-red-400 mt-0.5 ml-4 truncate max-w-xs">{server.error}</p>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 uppercase tracking-wide">
            {transport}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {url ? (
            <span className="font-mono truncate max-w-xs block" title={url}>{url}</span>
          ) : (
            <span>{server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-3">
            {server.tools.length > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {expanded ? 'hide' : 'tools'}
              </button>
            )}
            <button
              onClick={() => onReconnect(server.name)}
              disabled={busy || server.status === 'connecting'}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              reconnect
            </button>
            <button
              onClick={() => onToggle(server.name, !server.enabled)}
              disabled={busy}
              className={`text-xs transition-colors disabled:opacity-50 ${
                server.enabled ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'
              }`}
            >
              {server.enabled ? 'Disable' : 'Enable'}
            </button>
            {confirming ? (
              <span className="flex items-center gap-1">
                <button
                  onClick={() => { onDelete(server.name); setConfirming(false) }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  confirm
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && server.tools.length > 0 && (
        <tr className="border-b border-gray-800">
          <td colSpan={5} className="px-4 py-3 bg-gray-950/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {server.tools.map(tool => (
                <div key={tool.name} className="bg-gray-800 rounded px-3 py-2">
                  <p className="text-xs font-mono text-blue-300">{tool.name}</p>
                  {tool.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{tool.description}</p>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addConfig, setAddConfig] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    mcp.list()
      .then(r => { setServers(r.servers); setError('') })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(name: string, enable: boolean) {
    setBusy(name)
    try {
      if (enable) {
        await mcp.enable(name)
      } else {
        await mcp.disable(name)
      }
      setServers(prev => prev.map(s => s.name === name ? { ...s, enabled: enable } : s))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(name: string) {
    setBusy(name)
    try {
      await mcp.remove(name)
      setServers(prev => prev.filter(s => s.name !== name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleReconnect(name: string) {
    setBusy(name)
    try {
      const r = await mcp.reconnect(name)
      setServers(prev => prev.map(s => s.name === name ? r.server : s))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnect failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleAdd() {
    setAddError('')
    const name = addName.trim()
    if (!name) { setAddError('Name is required'); return }
    let config: Record<string, unknown>
    try {
      // Strip JS-style line comments before parsing
      const cleaned = addConfig.replace(/\/\/[^\n]*/g, '').trim()
      if (!cleaned) { setAddError('Config is required'); return }
      config = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      setAddError('Config is not valid JSON')
      return
    }
    if (!('command' in config) && !('url' in config)) {
      setAddError('Config must have "command" (stdio) or "url" (http)')
      return
    }
    setAdding(true)
    try {
      const r = await mcp.add(name, config)
      setServers(prev => [...prev, r.server])
      setShowAdd(false)
      setAddName('')
      setAddConfig('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  const counts = {
    connected: servers.filter(s => s.status === 'connected').length,
    error:     servers.filter(s => s.status === 'error').length,
    tools:     servers.reduce((n, s) => n + s.tools.length, 0),
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">MCP Servers</h1>
          <p className="text-sm text-gray-500 mt-1">Model Context Protocol server connections</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => { setShowAdd(v => !v); setAddError('') }}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
          >
            {showAdd ? 'Cancel' : 'Add server'}
          </button>
        </div>
      </div>

      {/* Add server panel */}
      {showAdd && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-white">Add MCP server</h2>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Name</label>
            <input
              type="text"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              placeholder="my-server"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Config (JSON)</label>
            <textarea
              value={addConfig}
              onChange={e => setAddConfig(e.target.value)}
              placeholder={ADD_PLACEHOLDER}
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void handleAdd()}
              disabled={adding}
              className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 text-white px-4 py-1.5 rounded transition-colors"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddName(''); setAddConfig(''); setAddError('') }}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && servers.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Connected', value: counts.connected, color: 'text-green-400' },
            { label: 'Error',     value: counts.error,     color: 'text-red-400'   },
            { label: 'Total tools', value: counts.tools,   color: 'text-blue-400'  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
              <p className={`text-2xl font-bold tabular-nums ${value > 0 ? color : 'text-gray-600'}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : servers.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center space-y-3">
          <p className="text-sm text-gray-400">No MCP servers configured.</p>
          <p className="text-xs text-gray-600">Use the "Add server" button above to add one.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Details</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {servers.map(server => (
                <ServerRow
                  key={server.name}
                  server={server}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onReconnect={handleReconnect}
                  busy={busy === server.name}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
