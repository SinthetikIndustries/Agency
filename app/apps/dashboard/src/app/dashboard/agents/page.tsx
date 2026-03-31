// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { agents, type Agent } from '@/lib/api'

const LIFECYCLE_LABELS: Record<string, string> = {
  always_on: 'Always-on',
  dormant: 'Dormant',
}
const LIFECYCLE_COLORS: Record<string, string> = {
  always_on: 'bg-blue-900/40 text-blue-300 border border-blue-800/50',
  dormant:   'bg-gray-800 text-gray-400 border border-gray-700',
}
const WAKE_LABELS: Record<string, string> = {
  auto:           'Auto',
  high_priority:  'High priority',
  explicit:       'Explicit only',
}
const SHELL_LABELS: Record<string, string> = {
  none:                 'None',
  per_command:          'Per-command',
  session_only:         'Session',
  session_destructive:  'Session + destructive',
  full:                 'Full',
}
const AGENT_MGMT_LABELS: Record<string, string> = {
  approval_required: 'Approval required',
  autonomous:        'Autonomous',
}

type SortCol = 'name' | 'profile' | 'lifecycle' | 'wake' | 'shell' | 'mgmt' | 'status'
type SortDir = 'asc' | 'desc'

function agentSortKey(agent: Agent, col: SortCol): string {
  switch (col) {
    case 'name':      return agent.identity.name.toLowerCase()
    case 'profile':   return (agent.profile?.name ?? '').toLowerCase()
    case 'lifecycle': return agent.identity.lifecycleType
    case 'wake':      return agent.identity.lifecycleType === 'always_on' ? '' : (WAKE_LABELS[agent.identity.wakeMode] ?? agent.identity.wakeMode)
    case 'shell':     return SHELL_LABELS[agent.identity.shellPermissionLevel] ?? agent.identity.shellPermissionLevel
    case 'mgmt':      return agent.identity.agentManagementPermission
    case 'status':    return agent.identity.status
  }
}

function sortAgents(list: Agent[], col: SortCol, dir: SortDir): Agent[] {
  const main = list.filter(a => a.identity.slug === 'main')
  const rest = list.filter(a => a.identity.slug !== 'main')
  const lifecycleSort = col === 'lifecycle' || col === 'wake'
  rest.sort((a, b) => {
    // Unless sorting by lifecycle/wake, always_on before dormant
    if (!lifecycleSort) {
      const aOn = a.identity.lifecycleType === 'always_on'
      const bOn = b.identity.lifecycleType === 'always_on'
      if (aOn !== bOn) return aOn ? -1 : 1
    }
    const ka = agentSortKey(a, col)
    const kb = agentSortKey(b, col)
    return dir === 'asc' ? ka.localeCompare(kb) : kb.localeCompare(ka)
  })
  return [...main, ...rest]
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
    </span>
  )
}

export default function AgentsPage() {
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const router = useRouter()

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    agents.list()
      .then(r => setAgentList(r.agents))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  async function toggle(agent: Agent) {
    const isActive = agent.identity.status === 'active'
    try {
      if (isActive) await agents.disable(agent.identity.slug)
      else await agents.enable(agent.identity.slug)
      setActionMsg(`${agent.identity.name} ${isActive ? 'disabled' : 'enabled'}`)
      setTimeout(() => setActionMsg(''), 2500)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = sortAgents(agentList, sortCol, sortDir)

  function Th({ col, label }: { col: SortCol; label: string }) {
    const active = sortCol === col
    return (
      <th
        className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors"
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon col={col} active={active} dir={sortDir} />
      </th>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registered agents and their configuration</p>
        </div>
        <Link
          href="/dashboard/agents/new"
          className="px-3 py-1.5 text-sm rounded-lg transition-colors"
          style={{ background: '#2563eb', color: '#fff' }}
        >
          + New agent
        </Link>
      </div>

      {error     && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {actionMsg && <p className="text-sm text-green-400 mb-4">{actionMsg}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : agentList.length === 0 ? (
        <p className="text-sm text-gray-600">No agents found.</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <Th col="name"      label="Agent" />
                <Th col="profile"   label="Profile" />
                <Th col="lifecycle" label="Lifecycle" />
                <Th col="wake"      label="Wake mode" />
                <Th col="shell"     label="Shell" />
                <Th col="mgmt"      label="Agent mgmt" />
                <Th col="status"    label="Status" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sorted.map(agent => (
                <tr
                  key={agent.identity.slug}
                  className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/agents/${agent.identity.slug}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/agents/${agent.identity.slug}`}
                        className="text-white font-medium hover:text-blue-400 transition-colors"
                      >
                        {agent.identity.name}
                      </Link>
                      {agent.identity.slug === 'main' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400 border border-indigo-800/50 font-medium">
                          default
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-gray-600 mt-0.5">{agent.identity.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{agent.profile?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LIFECYCLE_COLORS[agent.identity.lifecycleType] ?? 'text-gray-400'}`}>
                      {LIFECYCLE_LABELS[agent.identity.lifecycleType] ?? agent.identity.lifecycleType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {agent.identity.lifecycleType === 'always_on'
                      ? <span className="text-gray-600">N/A</span>
                      : (WAKE_LABELS[agent.identity.wakeMode] ?? agent.identity.wakeMode)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {SHELL_LABELS[agent.identity.shellPermissionLevel] ?? agent.identity.shellPermissionLevel}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {AGENT_MGMT_LABELS[agent.identity.agentManagementPermission] ?? agent.identity.agentManagementPermission}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      agent.identity.status === 'active'
                        ? 'bg-green-900/40 text-green-400 border border-green-800/50'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      {agent.identity.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/dashboard/agents/${agent.identity.slug}`}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Configure →
                      </Link>
                      {agent.identity.slug !== 'main' && (
                        <button
                          onClick={e => { e.stopPropagation(); void toggle(agent) }}
                          className={`text-xs transition-colors ${
                            agent.identity.status === 'active'
                              ? 'text-red-500 hover:text-red-400'
                              : 'text-blue-400 hover:text-blue-300'
                          }`}
                        >
                          {agent.identity.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
