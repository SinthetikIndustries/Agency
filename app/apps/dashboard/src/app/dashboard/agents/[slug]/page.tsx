// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { agents, workspace, models, routingProfiles, skills, agentSkills, tools, mcp, agentMcp, type Agent, type WorkspaceFile, type AgentModelConfig, type RoutingProfile, type Skill, type AgentSkill, type Tool, type McpServer, type AgentMcpServer } from '@/lib/api'

type Tab = 'overview' | 'model' | 'files' | 'tools' | 'skills' | 'mcp'
const CONTEXT_FILES = ['config/identity.md', 'config/soul.md', 'config/user.md', 'config/heartbeat.md', 'config/capabilities.md', 'config/scratch.md']

function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Option maps ──────────────────────────────────────────────────────────────

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
  { value: 'none',                 label: 'None',                    desc: 'No shell access' },
  { value: 'per_command',          label: 'Per-command approval',    desc: 'Each command requires user approval' },
  { value: 'session_only',         label: 'Session (safe)',          desc: 'Approved for session; no destructive commands' },
  { value: 'session_destructive',  label: 'Session + destructive',   desc: 'Session approval including destructive commands' },
  { value: 'full',                 label: 'Full',                    desc: 'Unrestricted shell access' },
]
const AGENT_MGMT_OPTIONS = [
  { value: 'approval_required', label: 'Approval required', desc: 'User must approve before spawning or deleting agents' },
  { value: 'autonomous',        label: 'Autonomous',        desc: 'Can create and manage agents without approval' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = (searchParams.get('tab') ?? 'overview') as Tab

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function reload() {
    agents.get(slug).then(r => setAgent(r.agent)).catch(() => {})
  }

  useEffect(() => {
    agents.get(slug)
      .then(r => setAgent(r.agent))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [slug])

  function setTab(t: Tab) {
    router.push(`/dashboard/agents/${slug}?tab=${t}`, { scroll: false })
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'model',    label: 'Model' },
    { key: 'files',    label: 'Files' },
    { key: 'tools',    label: 'Tools' },
    { key: 'skills',   label: 'Skills' },
    { key: 'mcp',      label: 'MCP' },
  ]

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/dashboard/agents" className="text-gray-500 hover:text-gray-300 transition-colors">Agents</Link>
        <span className="text-gray-700">/</span>
        <span className="text-white font-medium">{agent?.identity.name ?? slug}</span>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          {tab === 'overview' && agent && <OverviewTab agent={agent} slug={slug} onReload={reload} />}
          {tab === 'model'    && agent && <ModelTab slug={slug} agent={agent} />}
          {tab === 'files'    && <FilesTab slug={slug} agent={agent} />}
          {tab === 'tools'    && <ToolsTab />}
          {tab === 'skills'   && <SkillsTab slug={slug} />}
          {tab === 'mcp'      && <McpTab slug={slug} />}
        </>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-800/40">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-gray-800">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-8">
      <span className="text-sm text-gray-400 shrink-0 w-44">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  )
}

function SelectRow({ label, value, options, onChange, disabled }: {
  label: string
  value: string
  options: { value: string; label: string; desc?: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <Row label={label}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 disabled:opacity-40 disabled:cursor-not-allowed min-w-[220px]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}{o.desc ? ` — ${o.desc}` : ''}</option>
        ))}
      </select>
    </Row>
  )
}

// ─── Workspace Section ────────────────────────────────────────────────────────

function WorkspaceSection({ agent, slug, onReload }: { agent: Agent; slug: string; onReload: () => void }) {
  const [newPath, setNewPath] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function handleAdd() {
    const path = newPath.trim()
    if (!path) return
    setAdding(true); setErr(''); setMsg('')
    try {
      await agents.addWorkspace(slug, path)
      setNewPath('')
      setMsg('Workspace added')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add workspace')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(path: string) {
    if (removing.has(path)) return
    setRemoving(prev => new Set(prev).add(path))
    setErr(''); setMsg('')
    try {
      await agents.removeWorkspace(slug, path)
      setMsg('Workspace removed')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to remove workspace')
    } finally {
      setRemoving(prev => { const s = new Set(prev); s.delete(path); return s })
    }
  }

  const locked = new Set(agent.lockedWorkspacePaths ?? [])
  const additional = agent.identity.additionalWorkspacePaths ?? []

  return (
    <Section title="Workspace">
      {/* Primary workspace */}
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        <span className="text-sm text-gray-400 shrink-0 w-44">Primary</span>
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="font-mono text-xs text-gray-400 truncate">{agent.identity.workspacePath}</span>
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/40">primary</span>
        </div>
      </div>

      {/* Additional workspaces */}
      {additional.map(path => (
        <div key={path} className="flex items-center justify-between px-4 py-2.5 gap-4">
          <span className="font-mono text-xs text-gray-400 flex-1 truncate">{path}</span>
          <div className="shrink-0 flex items-center gap-2">
            {locked.has(path) ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">locked</span>
            ) : (
              <button
                onClick={() => void handleRemove(path)}
                disabled={removing.has(path)}
                className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-40"
                title="Remove workspace"
              >
                {removing.has(path) ? '…' : '✕'}
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add row */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800">
        <input
          value={newPath}
          onChange={e => setNewPath(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleAdd() }}
          placeholder="/absolute/path/to/workspace"
          className="flex-1 bg-gray-800 border border-gray-700 text-xs text-gray-200 font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 placeholder:text-gray-600"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={adding || !newPath.trim()}
          style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
          className="text-xs px-3 py-1.5 rounded disabled:opacity-40 transition-opacity hover:opacity-90 shrink-0"
        >
          {adding ? '…' : '+ Add'}
        </button>
      </div>

      {(msg || err) && (
        <div className="px-4 pb-2">
          {msg && <span className="text-xs text-green-400">{msg}</span>}
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      )}
    </Section>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ agent, slug, onReload }: { agent: Agent; slug: string; onReload: () => void }) {
  const isMain = slug === 'main'
  const isOrchestrator = slug === 'orchestrator'
  const isBuiltIn = slug === 'orchestrator' || slug === 'main'
  const { profiles } = useProfiles()
  const router = useRouter()

  const [name, setName] = useState(agent.identity.name)
  const [lifecycleType, setLifecycleType] = useState(agent.identity.lifecycleType)
  const [wakeMode, setWakeMode] = useState(agent.identity.wakeMode)
  const [shellPermission, setShellPermission] = useState(agent.identity.shellPermissionLevel)
  const [agentMgmt, setAgentMgmt] = useState(agent.identity.agentManagementPermission)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr(''); setMsg('')
    try {
      await agents.update(slug, { name, lifecycleType, wakeMode, shellPermissionLevel: shellPermission, agentManagementPermission: agentMgmt })
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  async function switchProfile(profileSlug: string) {
    try {
      const { profiles: profilesApi } = await import('@/lib/api')
      await profilesApi.attach(slug, profileSlug)
      setMsg('Profile updated')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
  }

  async function toggleStatus() {
    const isActive = agent.identity.status === 'active'
    try {
      if (isActive) await agents.disable(slug)
      else await agents.enable(slug)
      setMsg(isActive ? 'Agent disabled' : 'Agent enabled')
      setTimeout(() => setMsg(''), 2000)
      onReload()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-green-400">{msg}</p>}

      {/* Identity */}
      <Section title="Identity">
        <Row label="Name">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm text-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 min-w-[220px]"
          />
        </Row>
        <Row label="Slug">
          <span className="font-mono text-sm text-gray-500">{agent.identity.slug}</span>
        </Row>

        <Row label="Created by">
          <span className="text-sm text-gray-500">{agent.identity.createdBy}</span>
        </Row>
      </Section>

      {/* Profile */}
      <Section title="Profile">
        <Row label="Active profile">
          {profiles.length > 0 ? (
            <select
              defaultValue={agent.profile?.slug ?? ''}
              onChange={e => void switchProfile(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-600 min-w-[220px]"
            >
              {profiles.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          ) : (
            <span className="text-sm text-gray-400">{agent.profile?.name ?? '—'}</span>
          )}
        </Row>
      </Section>

      {/* Lifecycle */}
      <Section title="Lifecycle">
        {isBuiltIn ? (
          <Row label="Lifecycle type">
            <div className="flex items-center gap-2 min-w-[220px]">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/50">Always-on</span>
              <span className="text-xs text-gray-600">(locked — {isOrchestrator ? 'orchestrator' : 'main'} agent)</span>
            </div>
          </Row>
        ) : (
          <SelectRow
            label="Lifecycle type"
            value={lifecycleType}
            options={LIFECYCLE_OPTIONS}
            onChange={v => setLifecycleType(v as typeof lifecycleType)}
          />
        )}
        {isOrchestrator ? (
          <Row label="Wake mode">
            <span className="text-sm text-gray-400 min-w-[220px]">{WAKE_OPTIONS.find(o => o.value === wakeMode)?.label ?? wakeMode}</span>
          </Row>
        ) : (
          <SelectRow
            label="Wake mode"
            value={wakeMode}
            options={WAKE_OPTIONS}
            onChange={v => setWakeMode(v as typeof wakeMode)}
            disabled={lifecycleType === 'always_on' || isMain}
          />
        )}
      </Section>

      {/* Workspace */}
      <WorkspaceSection agent={agent} slug={slug} onReload={onReload} />

      {/* Permissions */}
      <Section title="Permissions">
        <SelectRow
          label="Shell access"
          value={shellPermission}
          options={SHELL_OPTIONS}
          onChange={v => setShellPermission(v as typeof shellPermission)}
        />
        {isOrchestrator ? (
          <Row label="Agent management">
            <span className="text-sm text-gray-400 min-w-[220px]">{AGENT_MGMT_OPTIONS.find(o => o.value === agentMgmt)?.label ?? agentMgmt}</span>
          </Row>
        ) : (
          <SelectRow
            label="Agent management"
            value={agentMgmt}
            options={AGENT_MGMT_OPTIONS}
            onChange={v => setAgentMgmt(v as typeof agentMgmt)}
          />
        )}
      </Section>

      {/* Autonomous Mode */}
      <Section title="Autonomous Mode">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">
              {agent.identity.autonomousMode ? 'Autonomous' : 'Supervised'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {agent.identity.autonomousMode
                ? 'Request-level operations auto-approve and execute immediately (logged to audit).'
                : 'Request-level operations require human approval before executing.'}
            </p>
          </div>
          <button
            onClick={async () => {
              await agents.update(slug, { autonomousMode: !agent.identity.autonomousMode })
              router.refresh()
              onReload()
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              agent.identity.autonomousMode ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              agent.identity.autonomousMode ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </Section>

      {/* Agency Permissions */}
      {agent.identity.agencyPermissions && Object.keys(agent.identity.agencyPermissions).filter(k => !['allowRules', 'denyRules'].includes(k)).length > 0 && (
        <Section title="Agency Permissions">
          {Object.entries(agent.identity.agencyPermissions)
            .filter(([key]) => !['allowRules', 'denyRules'].includes(key))
            .map(([key, value]) => (
              <div key={key} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-gray-300 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                {isOrchestrator ? (
                  <select
                    className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                    defaultValue={value}
                    onChange={async (e) => {
                      const newPerms = { ...agent.identity.agencyPermissions, [key]: e.target.value }
                      await agents.update(slug, { agencyPermissions: newPerms })
                    }}
                  >
                    <option value="deny">Deny</option>
                    <option value="request">Request</option>
                    <option value="autonomous">Autonomous</option>
                  </select>
                ) : (
                  <span className={`text-xs px-2 py-1 rounded font-mono ${
                    value === 'autonomous' ? 'bg-green-900 text-green-300' :
                    value === 'request' ? 'bg-yellow-900 text-yellow-300' :
                    'bg-red-900 text-red-300'
                  }`}>{value}</span>
                )}
              </div>
            ))
          }
        </Section>
      )}

      {/* Status */}
      <Section title="Status">
        <Row label="Current status">
          <div className="flex items-center gap-3 min-w-[220px]">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              agent.identity.status === 'active'
                ? 'bg-green-900/40 text-green-400 border border-green-800/50'
                : 'bg-gray-800 text-gray-500 border border-gray-700'
            }`}>
              {agent.identity.status}
            </span>
            {!isBuiltIn && (
              <button
                onClick={() => void toggleStatus()}
                className={`text-xs transition-colors ${
                  agent.identity.status === 'active'
                    ? 'text-red-500 hover:text-red-400'
                    : 'text-blue-400 hover:text-blue-300'
                }`}
              >
                {agent.identity.status === 'active' ? 'Disable' : 'Enable'}
              </button>
            )}
            {isBuiltIn && <span className="text-xs text-gray-600">(cannot be disabled)</span>}
          </div>
        </Row>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
          className="text-sm px-5 py-2 rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90 font-medium"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {msg && <span className="text-sm text-green-400">{msg}</span>}
        {err && <span className="text-sm text-red-400">{err}</span>}
      </div>
    </div>
  )
}

// ─── Model Tab ────────────────────────────────────────────────────────────────

function ModelTab({ slug, agent }: { slug: string; agent: Agent }) {
  const [config, setConfig] = useState<AgentModelConfig>(
    agent.identity.modelConfig ?? { mode: 'inherit' }
  )
  const [allProfiles, setAllProfiles] = useState<RoutingProfile[]>([])
  const [modelList, setModelList] = useState<Array<{ name: string; provider: string }>>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    routingProfiles.list().then(r => setAllProfiles(r.profiles)).catch(() => {})
    models.list().then(r => setModelList(r.models)).catch(() => {})
  }, [])

  async function save() {
    setSaving(true); setErr(''); setMsg('')
    try {
      await agents.setModelConfig(slug, config)
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const providers = [...new Set(modelList.map(m => m.provider))]

  return (
    <div className="max-w-lg space-y-6">
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Model source</p>
        {(['inherit', 'specific', 'auto_router'] as const).map(mode => (
          <label key={mode} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value={mode}
              checked={config.mode === mode}
              onChange={() => setConfig(c => ({ ...c, mode }))}
              className="accent-blue-500"
            />
            <span className="text-sm text-gray-300">
              {mode === 'inherit'    && 'Inherit from profile'}
              {mode === 'specific'   && 'Specific model'}
              {mode === 'auto_router'&& 'Auto-router profile'}
            </span>
          </label>
        ))}
      </div>

      {config.mode === 'inherit' && (
        <div className="bg-gray-900 border border-gray-800 rounded p-3 text-xs text-gray-500">
          Uses profile default: <span className="text-gray-300">{agent.profile?.modelTier ?? 'strong'}</span> tier
        </div>
      )}

      {config.mode === 'specific' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Provider</label>
            <select
              value={config.specific?.provider ?? ''}
              onChange={e => setConfig(c => ({ ...c, specific: { model: c.specific?.model ?? '', provider: e.target.value } }))}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-2 py-1.5 focus:outline-none w-full"
            >
              <option value="">Select provider…</option>
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Model</label>
            <select
              value={config.specific?.model ?? ''}
              onChange={e => setConfig(c => ({ ...c, specific: { provider: c.specific?.provider ?? '', model: e.target.value } }))}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-2 py-1.5 focus:outline-none w-full"
            >
              <option value="">Select model…</option>
              {modelList
                .filter(m => !config.specific?.provider || m.provider === config.specific.provider)
                .map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {config.mode === 'auto_router' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Routing profile</label>
            <select
              value={config.routingProfileId ?? ''}
              onChange={e => setConfig(c => ({ ...c, routingProfileId: e.target.value }))}
              className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded px-2 py-1.5 focus:outline-none w-full"
            >
              <option value="">Select routing profile…</option>
              {allProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {config.routingProfileId && (() => {
            const rp = allProfiles.find(p => p.id === config.routingProfileId)
            if (!rp) return null
            return (
              <div className="bg-gray-900 border border-gray-800 rounded p-3 space-y-1">
                {rp.chain.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600">#{i + 1}</span>
                    <span className="text-gray-400">{step.provider}</span>
                    <span className="text-gray-300 font-mono">{step.model}</span>
                    {step.label && <span className="text-gray-600 italic">{step.label}</span>}
                  </div>
                ))}
              </div>
            )
          })()}
          <p className="text-xs text-gray-600">
            Manage routing profiles in{' '}
            <a href="/dashboard/settings?tab=routing" className="text-blue-400 hover:underline">Settings → Routing</a>
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
          className="text-sm px-4 py-1.5 rounded disabled:opacity-50 transition-opacity hover:opacity-90"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="text-xs text-green-400">{msg}</span>}
      </div>
    </div>
  )
}

// ─── Files Tab ────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string
  type: 'file' | 'dir'
  path: string       // relative to root
  root: string       // absolute workspace root path (primary or additional)
  children?: TreeNode[]
  expanded: boolean
  loading: boolean
}

const FILE_ICONS: Record<string, string> = {
  md: '📝', ts: '📘', tsx: '📘', js: '📙', jsx: '📙',
  json: '📋', py: '🐍', sh: '⚙️', yml: '📄', yaml: '📄',
  html: '🌐', css: '🎨', txt: '📄', env: '🔒',
}
function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_ICONS[ext] ?? '📄'
}

function FilesTab({ slug, agent }: { slug: string; agent: Agent | null }) {
  const [roots, setRoots] = useState<TreeNode[]>([])
  const [activeFile, setActiveFile] = useState<{ path: string; root: string } | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [err, setErr] = useState('')
  const isDirty = editing && editContent !== fileContent

  // Build one root TreeNode per workspace and load its children
  useEffect(() => {
    if (!agent) return
    const allRoots: Array<{ label: string; root: string }> = [
      { label: agent.identity.workspacePath.split('/').pop() ?? 'workspace', root: agent.identity.workspacePath },
      ...(agent.identity.additionalWorkspacePaths ?? []).map(p => ({
        label: p.split('/').pop() ?? p,
        root: p,
      })),
    ]
    const initial: TreeNode[] = allRoots.map(r => ({
      name: r.label,
      type: 'dir',
      path: '',
      root: r.root,
      children: undefined,
      expanded: false,
      loading: false,
    }))
    setRoots(initial)
    // Auto-expand the primary workspace root
    loadDir(initial[0]!, setRoots)
  }, [agent, slug])

  function loadDir(node: TreeNode, setter: React.Dispatch<React.SetStateAction<TreeNode[]>>) {
    const isAdditional = agent && node.root !== agent.identity.workspacePath
    const rootParam = isAdditional ? node.root : undefined
    workspace.list(slug, node.path || undefined, rootParam)
      .then(r => {
        const children: TreeNode[] = r.files
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          .map(f => ({
            name: f.name,
            type: f.type as 'file' | 'dir',
            path: node.path ? `${node.path}/${f.name}` : f.name,
            root: node.root,
            children: undefined,
            expanded: false,
            loading: false,
          }))
        setter(prev => updateNode(prev, node.root, node.path, n => ({ ...n, children, expanded: true, loading: false })))
      })
      .catch(() => {
        setter(prev => updateNode(prev, node.root, node.path, n => ({ ...n, loading: false })))
      })
  }

  function updateNode(
    nodes: TreeNode[],
    root: string,
    path: string,
    fn: (n: TreeNode) => TreeNode,
  ): TreeNode[] {
    return nodes.map(n => {
      if (n.root === root && n.path === path) return fn(n)
      if (n.children) return { ...n, children: updateNode(n.children, root, path, fn) }
      return n
    })
  }

  function toggleDir(node: TreeNode) {
    if (node.expanded) {
      setRoots(prev => updateNode(prev, node.root, node.path, n => ({ ...n, expanded: false })))
    } else if (node.children) {
      setRoots(prev => updateNode(prev, node.root, node.path, n => ({ ...n, expanded: true })))
    } else {
      setRoots(prev => updateNode(prev, node.root, node.path, n => ({ ...n, loading: true })))
      loadDir(node, setRoots)
    }
  }

  async function openFile(node: TreeNode) {
    if (isDirty) {
      const action = window.confirm('You have unsaved changes. Save before switching files?')
      if (action) {
        await saveFile()
      } else {
        // discard
        setEditing(false)
      }
    }
    setActiveFile({ path: node.path, root: node.root })
    setEditing(false); setSaveMsg(''); setErr('')
    const isAdditional = agent && node.root !== agent.identity.workspacePath
    try {
      const res = await workspace.readFile(slug, node.path, isAdditional ? node.root : undefined)
      setFileContent(res.content); setEditContent(res.content)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to read file') }
  }

  async function saveFile() {
    if (!activeFile) return
    setSaving(true); setErr('')
    const isAdditional = agent && activeFile.root !== agent.identity.workspacePath
    try {
      await workspace.writeFile(slug, activeFile.path, editContent, isAdditional ? activeFile.root : undefined)
      setFileContent(editContent); setEditing(false)
      setSaveMsg('Saved'); setTimeout(() => setSaveMsg(''), 2000)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  const isEditable = activeFile
    ? (CONTEXT_FILES.includes(activeFile.path) && activeFile.path !== 'config/capabilities.md') ||
      !CONTEXT_FILES.includes(activeFile.path)
    : false
  const isReadOnly = activeFile?.path === 'config/capabilities.md'

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const indent = depth * 14
    const isActive = activeFile?.path === node.path && activeFile?.root === node.root
    if (node.type === 'dir') {
      return (
        <div key={`${node.root}:${node.path}`}>
          <button
            onClick={() => toggleDir(node)}
            style={{ paddingLeft: 8 + indent }}
            className="w-full flex items-center gap-1.5 py-[3px] pr-2 text-left hover:bg-white/5 rounded text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className="shrink-0 text-gray-600 w-3 text-center">{node.loading ? '…' : node.expanded ? '▾' : '▸'}</span>
            <span className="shrink-0">📁</span>
            <span className="truncate">{node.name}</span>
          </button>
          {node.expanded && node.children && (
            <div>{node.children.map(c => renderNode(c, depth + 1))}</div>
          )}
        </div>
      )
    }
    return (
      <button
        key={`${node.root}:${node.path}`}
        onClick={() => void openFile(node)}
        style={{ paddingLeft: 8 + indent }}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-2 text-left rounded text-xs transition-colors ${
          isActive
            ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
      >
        <span className="shrink-0 w-3" />
        <span className="shrink-0">{fileIcon(node.name)}</span>
        <span className="truncate font-mono">{node.name}</span>
      </button>
    )
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] gap-0 border border-gray-800 rounded-lg overflow-hidden">
      {/* Tree panel */}
      <div className="w-64 shrink-0 border-r border-gray-800 flex flex-col bg-gray-900 overflow-y-auto">
        <div className="px-3 py-2 border-b border-gray-800 shrink-0">
          <span className="text-xs text-gray-600 uppercase tracking-wider font-semibold">Files</span>
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {roots.map(r => renderNode(r, 0))}
        </div>
      </div>

      {/* Viewer / editor panel */}
      <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
        {activeFile ? (
          <>
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 shrink-0 bg-gray-900">
              <span className="font-mono text-xs text-gray-400 truncate">{activeFile.path}</span>
              {isReadOnly && <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">read-only</span>}
              {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
              {err && <span className="text-xs text-red-400 truncate">{err}</span>}
              <div className="ml-auto flex gap-2 shrink-0">
                {isEditable && !isReadOnly && !editing && (
                  <button onClick={() => setEditing(true)} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1 rounded transition-colors">Edit</button>
                )}
                {editing && (
                  <>
                    <button onClick={() => { setEditing(false); setEditContent(fileContent) }} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition-colors">Cancel</button>
                    <button onClick={() => void saveFile()} disabled={saving} className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {editing
              ? <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="flex-1 bg-gray-950 text-gray-200 font-mono text-xs p-4 resize-none focus:outline-none" spellCheck={false} />
              : <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">{fileContent || <span className="text-gray-700">(empty file)</span>}</pre>
            }
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-700 text-sm">Select a file to view</div>
        )}
      </div>
    </div>
  )
}

// ─── Tools Tab ────────────────────────────────────────────────────────────────

function ToolsTab() {
  const [allTools, setAllTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    tools.list()
      .then(r => setAllTools(r.tools))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>
  if (error) return <p className="text-sm text-red-400">{error}</p>

  return (
    <div className="max-w-2xl">
      <p className="text-xs text-gray-500 mb-4">All registered tools and their global enabled state. Per-agent tool overrides are not yet supported.</p>
      {allTools.length === 0 ? (
        <p className="text-sm text-gray-600">No tools registered.</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Description</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {allTools.map(tool => (
                <tr key={tool.name} className={`border-b border-gray-800 last:border-0 ${!tool.enabled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-white">{tool.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">{tool.description || '—'}</td>
                  <td className="px-4 py-2.5">
                    {tool.enabled ? (
                      <span className="text-xs text-green-400">enabled</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">globally disabled</span>
                    )}
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

// ─── Skills Tab ────────────────────────────────────────────────────────────────

function SkillsTab({ slug }: { slug: string }) {
  const [installed, setInstalled] = useState<Skill[]>([])
  const [agentEnabled, setAgentEnabled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      skills.list(),
      agentSkills.list(slug),
    ])
      .then(([allRes, agentRes]) => {
        setInstalled(allRes.skills)
        setAgentEnabled(new Set(agentRes.skills.map((s: AgentSkill) => s.name)))
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [slug])

  async function handleToggle(skillName: string, enable: boolean) {
    setToggling(skillName)
    try {
      if (enable) {
        await agentSkills.enable(slug, skillName)
        setAgentEnabled(prev => new Set([...prev, skillName]))
      } else {
        await agentSkills.disable(slug, skillName)
        setAgentEnabled(prev => { const s = new Set(prev); s.delete(skillName); return s })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>
  if (error) return <p className="text-sm text-red-400">{error}</p>

  if (installed.length === 0) {
    return <p className="text-sm text-gray-600">No skills installed.</p>
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Skill</th>
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Global</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {installed.map(skill => {
              const globallyDisabled = skill.status === 'disabled'
              const isEnabled = agentEnabled.has(skill.name)
              return (
                <tr key={skill.id} className={`border-b border-gray-800 last:border-0 ${globallyDisabled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-white">
                    {skill.name}
                    <span className="ml-2 text-gray-600 text-[10px]">v{skill.version}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">
                    {skill.manifest.description ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      skill.status === 'active'
                        ? 'bg-green-900/50 text-green-400'
                        : skill.status === 'pending_restart'
                        ? 'bg-yellow-900/50 text-yellow-400'
                        : 'bg-gray-800 text-gray-500'
                    }`}>
                      {skill.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {globallyDisabled ? (
                      <span className="text-xs text-gray-600">globally disabled</span>
                    ) : (
                      <button
                        onClick={() => void handleToggle(skill.name, !isEnabled)}
                        disabled={toggling === skill.name}
                        className={`text-xs transition-colors disabled:opacity-50 ${
                          isEnabled
                            ? 'text-yellow-400 hover:text-yellow-300'
                            : 'text-green-400 hover:text-green-300'
                        }`}
                      >
                        {toggling === skill.name ? '…' : isEnabled ? 'Disable for agent' : 'Enable for agent'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── MCP Tab ──────────────────────────────────────────────────────────────────

function McpTab({ slug }: { slug: string }) {
  const [servers, setServers] = useState<AgentMcpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  function load() {
    setLoading(true)
    agentMcp.list(slug)
      .then(r => setServers(r.servers))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [slug])

  async function handleToggle(name: string, enable: boolean) {
    setToggling(name)
    try {
      if (enable) {
        await agentMcp.enable(slug, name)
        setServers(prev => prev.map(s => s.name === name ? { ...s, agentEnabled: true } : s))
      } else {
        await agentMcp.disable(slug, name)
        setServers(prev => prev.map(s => s.name === name ? { ...s, agentEnabled: false } : s))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  const STATUS_DOT: Record<string, string> = {
    connected:       'bg-green-400',
    connecting:      'bg-yellow-400 animate-pulse',
    pending_restart: 'bg-yellow-400',
    error:           'bg-red-400',
    disconnected:    'bg-gray-600',
  }

  if (loading) return <p className="text-sm text-gray-500">Loading...</p>
  if (error) return <p className="text-sm text-red-400">{error}</p>

  if (servers.length === 0) {
    return (
      <div>
        <p className="text-sm text-gray-600">No MCP servers configured.</p>
        <p className="text-xs text-gray-700 mt-1">
          Add servers on the <a href="/dashboard/mcp" className="text-blue-400 hover:underline">MCP page</a>.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Server</th>
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider">Global</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {servers.map(server => {
              const globallyDisabled = !server.globallyEnabled
              return (
                <tr key={server.name} className={`border-b border-gray-800 last:border-0 ${globallyDisabled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-sm text-white">{server.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[server.status] ?? 'bg-gray-600'}`} />
                      <span className="text-xs text-gray-400">{server.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {globallyDisabled ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">globally disabled</span>
                    ) : (
                      <span className="text-xs text-green-400">enabled</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {globallyDisabled ? (
                      <span className="text-xs text-gray-600">globally disabled</span>
                    ) : (
                      <button
                        onClick={() => void handleToggle(server.name, !server.agentEnabled)}
                        disabled={toggling === server.name}
                        className={`text-xs transition-colors disabled:opacity-50 ${
                          server.agentEnabled
                            ? 'text-yellow-400 hover:text-yellow-300'
                            : 'text-green-400 hover:text-green-300'
                        }`}
                      >
                        {toggling === server.name ? '…' : server.agentEnabled ? 'Disable for agent' : 'Enable for agent'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Shared hook ─────────────────────────────────────────────────────────────

function useProfiles() {
  const [profileList, setProfileList] = useState<Array<{ slug: string; name: string }>>([])
  useEffect(() => {
    import('@/lib/api').then(({ profiles }) => profiles.list().then(r => setProfileList(r.profiles)).catch(() => {}))
  }, [])
  return { profiles: profileList }
}
