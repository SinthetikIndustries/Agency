// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { agents, profiles, type Profile } from '@/lib/api'

const LIFECYCLE_OPTIONS = [
  { value: 'always_on', label: 'Always-on',  desc: 'Starts with the gateway, always running' },
  { value: 'dormant',   label: 'Dormant',    desc: 'Spun up on demand, shuts down when idle' },
]
const WAKE_OPTIONS = [
  { value: 'auto',          label: 'Auto',          desc: 'Wake on any incoming message' },
  { value: 'high_priority', label: 'High priority', desc: 'Only wake on high-priority messages' },
  { value: 'explicit',      label: 'Explicit only',  desc: 'Never auto-wake; must be invoked directly' },
]
const SHELL_OPTIONS = [
  { value: 'none',                label: 'None',                   desc: 'No shell access' },
  { value: 'per_command',         label: 'Per-command approval',   desc: 'Each command requires user approval' },
  { value: 'session_only',        label: 'Session (safe)',         desc: 'Approved for session; no destructive commands' },
  { value: 'session_destructive', label: 'Session + destructive',  desc: 'Session approval including destructive commands' },
  { value: 'full',                label: 'Full',                   desc: 'Unrestricted shell access' },
]
const AGENT_MGMT_OPTIONS = [
  { value: 'approval_required', label: 'Approval required', desc: 'User must approve before spawning or deleting agents' },
  { value: 'autonomous',        label: 'Autonomous',        desc: 'Can create and manage agents without approval' },
]

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; desc: string }[]
  disabled?: boolean
}) {
  const selected = options.find(o => o.value === value)
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {selected && <p className="text-xs text-gray-600">{selected.desc}</p>}
    </div>
  )
}

export default function NewAgentPage() {
  const router = useRouter()

  const [profileList, setProfileList] = useState<Profile[]>([])
  const [name, setName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [lifecycleType, setLifecycleType] = useState('dormant')
  const [wakeMode, setWakeMode] = useState('auto')
  const [shellPermissionLevel, setShellPermissionLevel] = useState('none')
  const [agentManagementPermission, setAgentManagementPermission] = useState('approval_required')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    profiles.list()
      .then(r => {
        setProfileList(r.profiles)
        if (r.profiles.length > 0) setProfileSlug(r.profiles[0].slug)
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    setSubmitting(true)
    try {
      const result = await agents.create({
        name: name.trim(),
        ...(profileSlug ? { profileSlug } : {}),
        lifecycleType,
        wakeMode: lifecycleType === 'dormant' ? wakeMode : undefined,
        shellPermissionLevel,
        agentManagementPermission,
      })
      router.push(`/dashboard/agents/${result.agent.identity.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-6">
        <Link href="/dashboard/agents" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Agents
        </Link>
        <h1 className="text-xl font-bold text-white mt-3">New agent</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure and create a new agent</p>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-5">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Research Agent"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Profile */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Profile</label>
          <select
            value={profileSlug}
            onChange={e => setProfileSlug(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
          >
            {profileList.map(p => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-600">Determines the agent's personality, system prompt, and allowed tools</p>
        </div>

        <div className="border-t border-gray-800 pt-1" />

        {/* Lifecycle */}
        <SelectField
          label="Lifecycle type"
          value={lifecycleType}
          onChange={v => { setLifecycleType(v); if (v === 'always_on') setWakeMode('auto') }}
          options={LIFECYCLE_OPTIONS}
        />

        {/* Wake mode — only relevant for dormant */}
        <SelectField
          label="Wake mode"
          value={wakeMode}
          onChange={setWakeMode}
          options={WAKE_OPTIONS}
          disabled={lifecycleType === 'always_on'}
        />

        <div className="border-t border-gray-800 pt-1" />

        {/* Shell permission */}
        <SelectField
          label="Shell permission"
          value={shellPermissionLevel}
          onChange={setShellPermissionLevel}
          options={SHELL_OPTIONS}
        />

        {/* Agent management */}
        <SelectField
          label="Agent management"
          value={agentManagementPermission}
          onChange={setAgentManagementPermission}
          options={AGENT_MGMT_OPTIONS}
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{ background: '#2563eb', color: '#fff' }}
          >
            {submitting ? 'Creating…' : 'Create agent'}
          </button>
          <Link
            href="/dashboard/agents"
            className="px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
