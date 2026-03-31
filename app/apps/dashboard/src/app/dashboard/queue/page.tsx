// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import { queue, type QueueStat, type WorkerStatus } from '@/lib/api'

const QUEUE_LABELS: Record<string, string> = {
  'queue:shell':     'Shell',
  'queue:browser':   'Browser',
  'queue:code':      'Code',
  'queue:planner':   'Planner',
  'queue:ingestion': 'Ingestion',
}

const WORKER_LABELS: Record<string, string> = {
  'shell-worker':     'Shell',
  'code-worker':      'Code',
  'planner-worker':   'Planner',
  'browser-worker':   'Browser',
  'ingestion-worker': 'Ingestion',
}

function StatCell({ value, color }: { value: number; color: string }) {
  return (
    <td className="px-4 py-3 text-sm tabular-nums">
      <span className={value > 0 ? color : 'text-gray-600'}>{value}</span>
    </td>
  )
}

function TotalBar({ queues }: { queues: QueueStat[] }) {
  const total = (key: keyof Omit<QueueStat, 'name'>) =>
    queues.reduce((sum, q) => sum + q[key], 0)

  const items = [
    { label: 'Waiting',   value: total('waiting'),   color: 'text-yellow-400' },
    { label: 'Active',    value: total('active'),    color: 'text-blue-400'   },
    { label: 'Failed',    value: total('failed'),    color: 'text-red-400'    },
    { label: 'Delayed',   value: total('delayed'),   color: 'text-orange-400' },
    { label: 'Completed', value: total('completed'), color: 'text-green-400'  },
  ]

  return (
    <div className="grid grid-cols-5 gap-3">
      {items.map(({ label, value, color }) => (
        <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <p className={`text-2xl font-bold tabular-nums ${value > 0 ? color : 'text-gray-600'}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-1">{label}</p>
        </div>
      ))}
    </div>
  )
}

function WorkerDot({ status }: { status: WorkerStatus['status'] }) {
  if (status === 'running')    return <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
  if (status === 'restarting') return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
  return <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
}

function uptime(startedAt: string | null): string {
  if (!startedAt) return '—'
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function WorkersPanel({ workers }: { workers: WorkerStatus[] }) {
  const running = workers.filter(w => w.status === 'running').length

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Workers</h2>
        <span className="text-xs">
          <span className={running === workers.length ? 'text-green-400' : 'text-yellow-400'}>{running}</span>
          <span className="text-gray-600"> / {workers.length} online</span>
        </span>
      </div>
      <div className="divide-y divide-gray-800">
        {workers.map(w => (
          <div key={w.name} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <WorkerDot status={w.status} />
              <div>
                <p className="text-sm font-medium text-white">{WORKER_LABELS[w.name] ?? w.name}</p>
                <p className="text-xs text-gray-600 font-mono">{w.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-5 text-right">
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className={`text-xs font-medium capitalize ${
                  w.status === 'running'    ? 'text-green-400' :
                  w.status === 'restarting' ? 'text-yellow-400' : 'text-red-400'
                }`}>{w.status}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">PID</p>
                <p className="text-xs text-gray-300 font-mono">{w.pid ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Uptime</p>
                <p className="text-xs text-gray-300 font-mono">{w.status === 'running' ? uptime(w.startedAt) : '—'}</p>
              </div>
              {w.restartCount > 0 && (
                <div>
                  <p className="text-xs text-gray-500">Restarts</p>
                  <p className="text-xs text-yellow-400 font-mono">{w.restartCount}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QueuesPanel({ queues }: { queues: QueueStat[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-medium text-gray-300">Queues</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Queue</th>
            <th className="text-left px-4 py-3 text-yellow-500 font-medium text-xs">Waiting</th>
            <th className="text-left px-4 py-3 text-blue-500 font-medium text-xs">Active</th>
            <th className="text-left px-4 py-3 text-orange-500 font-medium text-xs">Delayed</th>
            <th className="text-left px-4 py-3 text-red-500 font-medium text-xs">Failed</th>
            <th className="text-left px-4 py-3 text-green-500 font-medium text-xs">Completed</th>
          </tr>
        </thead>
        <tbody>
          {queues.map(q => {
            const hasActivity = q.waiting + q.active + q.failed + q.delayed > 0
            return (
              <tr key={q.name} className={`border-b border-gray-800 last:border-0 ${hasActivity ? 'bg-gray-800/20' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      q.active > 0  ? 'bg-blue-400 animate-pulse' :
                      q.waiting > 0 ? 'bg-yellow-400' :
                      q.failed > 0  ? 'bg-red-400' :
                      'bg-gray-700'
                    }`} />
                    <span className="text-white font-medium text-sm">{QUEUE_LABELS[q.name] ?? q.name}</span>
                    <span className="text-gray-600 font-mono text-xs">{q.name}</span>
                  </div>
                </td>
                <StatCell value={q.waiting}   color="text-yellow-400" />
                <StatCell value={q.active}    color="text-blue-400"   />
                <StatCell value={q.delayed}   color="text-orange-400" />
                <StatCell value={q.failed}    color="text-red-400"    />
                <StatCell value={q.completed} color="text-green-400"  />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function QueuePage() {
  const [queues, setQueues]   = useState<QueueStat[]>([])
  const [workers, setWorkers] = useState<WorkerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const [statsRes, workersRes] = await Promise.all([queue.stats(), queue.workers()])
      setQueues(statsRes.queues)
      setWorkers(workersRes.workers)
      setLastUpdated(new Date())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => void load(), 3000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Queue Monitor</h1>
          <p className="text-sm text-gray-500 mt-1">
            BullMQ worker queues
            {lastUpdated && <span className="ml-2 text-gray-600">— updated {lastUpdated.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-blue-500"
            />
            Auto-refresh (3s)
          </label>
          <button
            onClick={() => void load()}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Stat cards — full width */}
          <TotalBar queues={queues} />

          {/* Workers + Queues — two columns */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <WorkersPanel workers={workers} />
            <QueuesPanel queues={queues} />
          </div>

          <p className="text-xs text-gray-600">
            Completed counts reflect jobs still in Redis (not yet removed). Failed jobs are retained for inspection.
          </p>
        </>
      )}
    </div>
  )
}
