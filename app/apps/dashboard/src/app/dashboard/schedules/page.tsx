// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import cronstrue from 'cronstrue'
import { schedules, agents, type ScheduledTask, type ScheduledRun, type Agent as ApiAgent } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentRow { slug: string; name: string; status: string }

// ─── New Schedule Form ────────────────────────────────────────────────────────

function NewScheduleForm({
  agentSlug,
  onCreated,
  onCancel,
}: {
  agentSlug: string
  onCreated: (task: ScheduledTask) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState('')
  const [schedulePreview, setSchedulePreview] = useState('')
  const [type, setType] = useState<'recurring' | 'once'>('recurring')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!label.trim() || !prompt.trim() || !schedule.trim()) {
      setError('All fields required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = await schedules.create({ agentSlug, label, prompt, schedule, type })
      onCreated(r.task)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: '12px',
    padding: '6px 10px', background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: '4px', color: 'var(--text-primary)', outline: 'none',
  }

  return (
    <div style={{ padding: '14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--red)' }}>{error}</p>}
      <input style={inputStyle} placeholder="Label (e.g. Weekly Report)" value={label} onChange={e => setLabel(e.target.value)} />
      <textarea style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }} placeholder="Prompt sent to agent" value={prompt} onChange={e => setPrompt(e.target.value)} />
      <div>
        <input style={inputStyle} placeholder='Schedule (e.g. "every monday at 5am" or "0 5 * * 1")' value={schedule} onChange={e => {
          const val = e.target.value
          setSchedule(val)
          const parts = val.trim().split(/\s+/)
          if (parts.length === 5) {
            try {
              setSchedulePreview(cronstrue.toString(val.trim()))
            } catch {
              setSchedulePreview('')
            }
          } else {
            setSchedulePreview('')
          }
        }} />
        {schedulePreview && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent)', marginTop: '4px' }}>{schedulePreview}</p>}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" value="recurring" checked={type === 'recurring'} onChange={() => setType('recurring')} style={{ accentColor: 'var(--accent)' }} />
          Recurring
        </label>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" value="once" checked={type === 'once'} onChange={() => setType('once')} style={{ accentColor: 'var(--accent)' }} />
          One-off
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} className="btn" style={{ fontSize: '12px', padding: '5px 12px' }}>Cancel</button>
        <button onClick={() => void handleSubmit()} disabled={saving} className="btn btn-primary" style={{ fontSize: '12px', padding: '5px 12px' }}>
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onUpdated, onDeleted }: {
  task: ScheduledTask
  onUpdated: (t: ScheduledTask) => void
  onDeleted: (id: string) => void
}) {
  const [runsOpen, setRunsOpen] = useState(false)
  const [runs, setRuns] = useState<ScheduledRun[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editPrompt, setEditPrompt] = useState(task.prompt)
  const [editLabel, setEditLabel] = useState(task.label)
  const [editSchedule, setEditSchedule] = useState(task.schedule)
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  async function toggleEnabled() {
    setToggling(true)
    try {
      const r = await schedules.update(task.id, { enabled: !task.enabled })
      onUpdated(r.task)
    } finally {
      setToggling(false)
    }
  }

  async function loadRuns() {
    setLoadingRuns(true)
    try {
      const r = await schedules.runs(task.id, 5)
      setRuns(r.runs)
    } finally {
      setLoadingRuns(false)
    }
  }

  function toggleRuns() {
    if (!runsOpen && runs.length === 0) void loadRuns()
    setRunsOpen(p => !p)
  }

  async function saveEdit() {
    setSaving(true)
    setEditError('')
    try {
      const r = await schedules.update(task.id, { label: editLabel, prompt: editPrompt, schedule: editSchedule })
      onUpdated(r.task)
      setEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.label}"?`)) return
    await schedules.delete(task.id)
    onDeleted(task.id)
  }

  const statusColor = (s: string) =>
    s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--text-muted)'

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {editError && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--red)' }}>{editError}</p>}
              <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none' }} />
              <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={3}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }} />
              <input value={editSchedule} onChange={e => setEditSchedule(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditing(false)} className="btn" style={{ fontSize: '11px', padding: '3px 10px' }}>Cancel</button>
                <button onClick={() => void saveEdit()} disabled={saving} className="btn btn-primary" style={{ fontSize: '11px', padding: '3px 10px' }}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>{task.label}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.prompt}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent)' }}>{task.humanReadableSchedule}</p>
              {task.lastRunAt && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Last run: {new Date(task.lastRunAt).toLocaleString()}
                  {task.nextRunAt && <> · Next: {new Date(task.nextRunAt).toLocaleString()}</>}
                </p>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button onClick={() => void toggleEnabled()} disabled={toggling}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px',
                color: task.enabled ? 'var(--green)' : 'var(--text-muted)', padding: '2px 6px',
                borderStyle: 'solid', borderWidth: '1px', borderColor: task.enabled ? 'var(--green)' : 'var(--border)', borderRadius: '3px' }}>
              {task.enabled ? 'Enabled' : 'Paused'}
            </button>
            <button onClick={() => setEditing(true)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 6px' }}>
              Edit
            </button>
            <button onClick={() => void handleDelete()}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--red)', padding: '2px 6px' }}>
              Delete
            </button>
          </div>
        )}
      </div>

      <button onClick={toggleRuns}
        style={{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border-dim)', cursor: 'pointer', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>{runsOpen ? '▲' : '▼'}</span>
        <span>Run history</span>
      </button>

      {runsOpen && (
        <div style={{ borderTop: '1px solid var(--border-dim)', background: 'var(--bg-base)' }}>
          {loadingRuns ? (
            <p style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</p>
          ) : runs.length === 0 ? (
            <p style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>No runs yet</p>
          ) : (
            runs.map(run => (
              <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 14px', borderBottom: '1px solid var(--border-dim)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: statusColor(run.status), minWidth: '60px' }}>{run.status}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', flex: 1 }}>
                  {new Date(run.startedAt).toLocaleString()}
                  {run.finishedAt && <> · {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s</>}
                </span>
                {run.error && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--red)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.error}</span>}
                {run.sessionId && (
                  <a href={`/dashboard/chat?session=${run.sessionId}`}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>
                    View →
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Agent Section ────────────────────────────────────────────────────────────

function AgentSection({ agent, tasks, onTaskCreated, onTaskUpdated, onTaskDeleted }: {
  agent: AgentRow
  tasks: ScheduledTask[]
  onTaskCreated: (t: ScheduledTask) => void
  onTaskUpdated: (t: ScheduledTask) => void
  onTaskDeleted: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showForm, setShowForm] = useState(false)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', cursor: 'pointer' }}
        onClick={() => setCollapsed(p => !p)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</span>
          <span className="badge badge-gray">{tasks.length}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-elevated)' }}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onUpdated={onTaskUpdated} onDeleted={onTaskDeleted} />
          ))}
          {showForm ? (
            <NewScheduleForm
              agentSlug={agent.slug}
              onCreated={t => { onTaskCreated(t); setShowForm(false) }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button onClick={() => setShowForm(true)} className="btn" style={{ alignSelf: 'flex-start', fontSize: '12px', padding: '5px 12px' }}>
              + New Schedule
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const [agentList, setAgentList] = useState<AgentRow[]>([])
  const [taskList, setTaskList] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([agents.list(), schedules.list()])
      .then(([agentsRes, schedulesRes]) => {
        const rows: AgentRow[] = (agentsRes.agents as ApiAgent[]).map(a => ({
          slug: a.identity.slug,
          name: a.identity.name,
          status: (a.identity as { status?: string }).status ?? 'unknown',
        }))
        const sorted = rows.sort((a, b) => a.name.localeCompare(b.name))
        setAgentList(sorted)
        setTaskList(schedulesRes.tasks)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(task: ScheduledTask) {
    setTaskList(prev => [task, ...prev])
  }
  function handleUpdated(task: ScheduledTask) {
    setTaskList(prev => prev.map(t => t.id === task.id ? task : t))
  }
  function handleDeleted(id: string) {
    setTaskList(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0, marginBottom: '4px' }}>Schedules</h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>Automated tasks per agent</p>
      </div>

      {error && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--red)', marginBottom: '16px' }}>{error}</p>}

      {loading ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' }}>
          {agentList.map(agent => (
            <AgentSection
              key={agent.slug}
              agent={agent}
              tasks={taskList.filter(t => t.agentSlug === agent.slug)}
              onTaskCreated={handleCreated}
              onTaskUpdated={handleUpdated}
              onTaskDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
