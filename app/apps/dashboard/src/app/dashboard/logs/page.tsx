// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useRef, useState } from 'react'
import { PORTS } from '@/lib/ports'

interface LogLine {
  id: number
  ts: string
  service: string
  level: string
  msg: string
}

const GATEWAY_WS = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? `http://localhost:${PORTS.GATEWAY}`)
  .replace(/^http/, 'ws')

const SERVICES = ['all', 'gateway', 'orchestrator', 'worker']
const LEVELS = ['all', 'debug', 'info', 'warn', 'error']
const LEVEL_ORDER: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function levelColor(level: string) {
  switch (level) {
    case 'error': return 'text-red-400'
    case 'warn': return 'text-yellow-400'
    case 'debug': return 'text-gray-600'
    default: return 'text-gray-300'
  }
}

function levelBadge(level: string) {
  switch (level) {
    case 'error': return 'text-red-400 bg-red-900/30'
    case 'warn': return 'text-yellow-400 bg-yellow-900/30'
    case 'debug': return 'text-gray-600 bg-gray-800'
    default: return 'text-gray-500 bg-gray-800'
  }
}

export default function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [service, setService] = useState('gateway')
  const [levelFilter, setLevelFilter] = useState('all')
  const [textFilter, setTextFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const idRef = useRef(0)

  useEffect(() => {
    connect(service)
    return () => { wsRef.current?.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service])

  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, follow])

  function connect(svc: string) {
    wsRef.current?.close()
    setLines([])
    setError('')

    const ws = new WebSocket(`${GATEWAY_WS}/logs/${svc}/stream`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onmessage = (e) => {
      let raw: { ts?: string; service?: string; level?: string; msg?: string }
      try { raw = JSON.parse(e.data as string) as typeof raw } catch { return }
      const line: LogLine = {
        id: idRef.current++,
        ts: raw.ts ?? '',
        service: raw.service ?? svc,
        level: raw.level ?? 'info',
        msg: raw.msg ?? '',
      }
      setLines(prev => {
        const next = [...prev, line]
        return next.length > 5000 ? next.slice(-5000) : next
      })
    }

    ws.onclose = () => setConnected(false)
    ws.onerror = () => {
      setConnected(false)
      setError('Stream disconnected')
    }
  }

  const visible = lines.filter(l => {
    if (levelFilter !== 'all') {
      const lineOrder = LEVEL_ORDER[l.level] ?? 1
      const filterOrder = LEVEL_ORDER[levelFilter] ?? 0
      if (lineOrder < filterOrder) return false
    }
    if (textFilter && !l.msg.toLowerCase().includes(textFilter.toLowerCase())) return false
    return true
  })

  function formatTs(ts: string) {
    if (!ts) return ''
    try {
      return new Date(ts).toISOString().slice(11, 23) // HH:mm:ss.mmm
    } catch {
      return ts
    }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0 flex-wrap">
        <h1 className="text-sm font-bold text-white mr-1">Logs</h1>
        <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-600'}`} />

        {/* Service selector */}
        <select
          value={service}
          onChange={e => setService(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-xs text-white rounded px-2 py-1 focus:outline-none"
        >
          {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Level filter */}
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-xs text-white rounded px-2 py-1 focus:outline-none"
        >
          {LEVELS.map(l => <option key={l} value={l}>{l === 'all' ? 'all levels' : l}</option>)}
        </select>

        <input
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          placeholder="Filter text..."
          className="ml-auto bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none w-44"
        />

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={follow}
            onChange={e => setFollow(e.target.checked)}
            className="accent-blue-500"
          />
          Follow
        </label>

        <button
          onClick={() => connect(service)}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded transition-colors"
        >
          Reconnect
        </button>
        <button
          onClick={() => setLines([])}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Clear
        </button>
        <span className="text-xs text-gray-700 ml-1">{visible.length} lines</span>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto bg-gray-950 p-3 font-mono text-xs">
        {error && <p className="text-red-400 mb-2">{error}</p>}
        {visible.length === 0 && (
          <p className="text-gray-700">{connected ? 'Waiting for log output...' : 'Not connected'}</p>
        )}
        {visible.map(line => (
          <div key={line.id} className="flex gap-2 leading-5 hover:bg-gray-900/50">
            <span className="text-gray-700 shrink-0 select-none">{formatTs(line.ts)}</span>
            {service === 'all' && (
              <span className="text-gray-600 shrink-0 w-14 truncate">{line.service}</span>
            )}
            <span className={`text-xs px-1 rounded shrink-0 uppercase ${levelBadge(line.level)}`}>
              {line.level.slice(0, 4)}
            </span>
            <span className={`whitespace-pre-wrap break-all ${levelColor(line.level)}`}>
              {line.msg}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
