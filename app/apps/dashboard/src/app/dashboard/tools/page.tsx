// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { tools, type Tool, type ToolType } from '@/lib/api'

const TYPE_STYLES: Record<ToolType, { label: string; classes: string }> = {
  file:               { label: 'file',               classes: 'bg-blue-900/50 text-blue-400'    },
  shell:              { label: 'shell',               classes: 'bg-amber-900/50 text-amber-400'  },
  browser:            { label: 'browser',             classes: 'bg-purple-900/50 text-purple-400'},
  http:               { label: 'http',                classes: 'bg-cyan-900/50 text-cyan-400'    },
  code:               { label: 'code',                classes: 'bg-green-900/50 text-green-400'  },
  memory:             { label: 'memory',              classes: 'bg-teal-900/50 text-teal-400'    },
  vault:              { label: 'vault',               classes: 'bg-indigo-900/50 text-indigo-400'},
  messaging:          { label: 'messaging',           classes: 'bg-pink-900/50 text-pink-400'    },
  agent_management:   { label: 'agent mgmt',          classes: 'bg-gray-800 text-gray-400'       },
}

const ALL_TYPES = Object.keys(TYPE_STYLES) as ToolType[]

function SchemaView({ schema }: { schema: Record<string, unknown> }) {
  return (
    <pre className="text-xs text-gray-400 bg-gray-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(schema, null, 2)}
    </pre>
  )
}

function ToolRow({
  tool,
  onToggle,
  toggling,
}: {
  tool: Tool
  onToggle: (name: string, enabled: boolean) => void
  toggling: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const typeStyle = TYPE_STYLES[tool.type] ?? { label: tool.type, classes: 'bg-gray-800 text-gray-400' }
  const hasSchema = tool.inputSchema && Object.keys(tool.inputSchema).length > 0
  const disabled = !tool.enabled

  return (
    <>
      <tr className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/30 ${disabled ? 'opacity-50' : ''}`}>
        <td className="px-4 py-3 font-mono text-sm text-white">
          <div className="flex items-center gap-2">
            {tool.name}
            {disabled && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">disabled</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${typeStyle.classes}`}>
            {typeStyle.label}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 max-w-xs">{tool.description || '—'}</td>
        <td className="px-4 py-3 text-center">
          {tool.sandboxed
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400">yes</span>
            : <span className="text-xs text-gray-600">—</span>
          }
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 tabular-nums text-right">
          {tool.timeout >= 1000 ? `${tool.timeout / 1000}s` : `${tool.timeout}ms`}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => onToggle(tool.name, !tool.enabled)}
              disabled={toggling}
              className={`text-xs transition-colors disabled:opacity-50 ${
                tool.enabled
                  ? 'text-yellow-400 hover:text-yellow-300'
                  : 'text-green-400 hover:text-green-300'
              }`}
            >
              {toggling ? '…' : tool.enabled ? 'Disable' : 'Enable'}
            </button>
            {hasSchema && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {expanded ? 'hide schema' : 'schema'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasSchema && (
        <tr className="border-b border-gray-800">
          <td colSpan={6} className="px-4 py-3 bg-gray-950/50">
            <SchemaView schema={tool.inputSchema} />
          </td>
        </tr>
      )}
    </>
  )
}

export default function ToolsPage() {
  const [allTools, setAllTools] = useState<Tool[]>([])
  const [activeType, setActiveType] = useState<ToolType | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  function load() {
    tools.list()
      .then(r => setAllTools(r.tools))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleToggle(name: string, enable: boolean) {
    setToggling(name)
    try {
      if (enable) {
        await tools.enable(name)
      } else {
        await tools.disable(name)
      }
      setAllTools(prev => prev.map(t => t.name === name ? { ...t, enabled: enable } : t))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  const typeCounts = ALL_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = allTools.filter(tool => tool.type === t).length
    return acc
  }, {})

  const filtered = activeType === 'all' ? allTools : allTools.filter(t => t.type === activeType)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Tools</h1>
        <p className="text-sm text-gray-500 mt-1">Built-in agent capabilities — enable or disable globally</p>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {!loading && allTools.length > 0 && (
        <div className="flex gap-1 mb-6 border-b border-gray-800 overflow-x-auto">
          <button
            onClick={() => setActiveType('all')}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              activeType === 'all'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            All ({allTools.length})
          </button>
          {ALL_TYPES.filter(t => typeCounts[t]! > 0).map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                activeType === t
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {TYPE_STYLES[t]!.label} ({typeCounts[t]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : allTools.length === 0 ? (
        <p className="text-sm text-gray-600">No tools registered.</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Sandboxed</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Timeout</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(tool => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  onToggle={handleToggle}
                  toggling={toggling === tool.name}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
