// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, Fragment } from 'react'
import { hooks, type Hook } from '@/lib/api'

// ─── Event Catalogue (mirrors hooks-manager.ts) ───────────────────────────────

interface EventDef { event: string; description: string; blocker: boolean; category: string }

const HOOK_EVENTS: EventDef[] = [
  // Session
  { event: 'session.created',              description: 'New session created',                              blocker: false, category: 'session'    },
  { event: 'session.message',              description: 'User message received',                            blocker: true,  category: 'session'    },
  { event: 'session.complete',             description: 'Session turn completed',                           blocker: false, category: 'session'    },
  { event: 'session.error',               description: 'Session encountered an error',                      blocker: false, category: 'session'    },
  { event: 'session.timeout',             description: 'Session timed out',                                blocker: false, category: 'session'    },
  { event: 'session.deleted',             description: 'Session deleted',                                  blocker: false, category: 'session'    },
  // Agent
  { event: 'agent.created',               description: 'New agent created',                                blocker: false, category: 'agent'      },
  { event: 'agent.deleted',               description: 'Agent deleted',                                    blocker: false, category: 'agent'      },
  { event: 'agent.enabled',               description: 'Agent enabled',                                    blocker: false, category: 'agent'      },
  { event: 'agent.disabled',              description: 'Agent disabled',                                   blocker: false, category: 'agent'      },
  { event: 'agent.wake',                  description: 'Dormant agent woke up',                            blocker: false, category: 'agent'      },
  { event: 'agent.sleep',                 description: 'Agent went dormant',                               blocker: false, category: 'agent'      },
  { event: 'agent.profile.changed',       description: 'Agent profile switched',                           blocker: false, category: 'agent'      },
  { event: 'agent.spawned',               description: 'New agent spawned by another agent',               blocker: false, category: 'agent'      },
  { event: 'agent.error',                 description: 'Agent encountered an error',                       blocker: false, category: 'agent'      },
  { event: 'agent.context.compact',       description: 'Agent context window compacted',                   blocker: false, category: 'agent'      },
  { event: 'agent.message.sent',          description: 'Agent sent a message to another agent',            blocker: false, category: 'agent'      },
  { event: 'agent.message.received',      description: 'Agent received an inter-agent message',            blocker: true,  category: 'agent'      },
  // Tool — generic
  { event: 'tool.before',                 description: 'Before any tool dispatch',                         blocker: true,  category: 'tool'       },
  { event: 'tool.after',                  description: 'After any tool completes',                         blocker: false, category: 'tool'       },
  { event: 'tool.error',                  description: 'Tool dispatch failed',                             blocker: false, category: 'tool'       },
  // Tool — file
  { event: 'tool.file.before',            description: 'Before file tool dispatch',                        blocker: true,  category: 'tool'       },
  { event: 'tool.file.after',             description: 'After file tool completes',                        blocker: false, category: 'tool'       },
  { event: 'tool.file.error',             description: 'File tool failed',                                 blocker: false, category: 'tool'       },
  // Tool — shell
  { event: 'tool.shell.before',           description: 'Before shell tool dispatch',                       blocker: true,  category: 'tool'       },
  { event: 'tool.shell.after',            description: 'After shell tool completes',                       blocker: false, category: 'tool'       },
  { event: 'tool.shell.error',            description: 'Shell tool failed',                                blocker: false, category: 'tool'       },
  // Tool — browser
  { event: 'tool.browser.before',         description: 'Before browser tool dispatch',                     blocker: true,  category: 'tool'       },
  { event: 'tool.browser.after',          description: 'After browser tool completes',                     blocker: false, category: 'tool'       },
  { event: 'tool.browser.error',          description: 'Browser tool failed',                              blocker: false, category: 'tool'       },
  // Tool — http
  { event: 'tool.http.before',            description: 'Before HTTP tool dispatch',                        blocker: true,  category: 'tool'       },
  { event: 'tool.http.after',             description: 'After HTTP tool completes',                        blocker: false, category: 'tool'       },
  { event: 'tool.http.error',             description: 'HTTP tool failed',                                 blocker: false, category: 'tool'       },
  // Tool — code
  { event: 'tool.code.before',            description: 'Before code execution tool dispatch',              blocker: true,  category: 'tool'       },
  { event: 'tool.code.after',             description: 'After code execution tool completes',              blocker: false, category: 'tool'       },
  { event: 'tool.code.error',             description: 'Code execution tool failed',                       blocker: false, category: 'tool'       },
  // Tool — memory
  { event: 'tool.memory.before',          description: 'Before memory tool dispatch',                      blocker: true,  category: 'tool'       },
  { event: 'tool.memory.after',           description: 'After memory tool completes',                      blocker: false, category: 'tool'       },
  { event: 'tool.memory.error',           description: 'Memory tool failed',                               blocker: false, category: 'tool'       },
  // Tool — vault
  { event: 'tool.vault.before',           description: 'Before vault tool dispatch',                       blocker: true,  category: 'tool'       },
  { event: 'tool.vault.after',            description: 'After vault tool completes',                       blocker: false, category: 'tool'       },
  { event: 'tool.vault.error',            description: 'Vault tool failed',                                blocker: false, category: 'tool'       },
  // Tool — messaging
  { event: 'tool.messaging.before',       description: 'Before messaging tool dispatch',                   blocker: true,  category: 'tool'       },
  { event: 'tool.messaging.after',        description: 'After messaging tool completes',                   blocker: false, category: 'tool'       },
  { event: 'tool.messaging.error',        description: 'Messaging tool failed',                            blocker: false, category: 'tool'       },
  // Tool — agent_management
  { event: 'tool.agent_management.before', description: 'Before agent management tool dispatch',           blocker: true,  category: 'tool'       },
  { event: 'tool.agent_management.after',  description: 'After agent management tool completes',           blocker: false, category: 'tool'       },
  { event: 'tool.agent_management.error',  description: 'Agent management tool failed',                   blocker: false, category: 'tool'       },
  // Model
  { event: 'model.before',                description: 'Before LLM completion request',                    blocker: true,  category: 'model'      },
  { event: 'model.after',                 description: 'After LLM response received',                      blocker: false, category: 'model'      },
  { event: 'model.error',                 description: 'LLM call failed',                                  blocker: false, category: 'model'      },
  { event: 'model.context.compact',       description: 'Context window compaction triggered',              blocker: false, category: 'model'      },
  { event: 'model.stream.start',          description: 'LLM response streaming started',                   blocker: false, category: 'model'      },
  { event: 'model.stream.end',            description: 'LLM response streaming ended',                     blocker: false, category: 'model'      },
  { event: 'model.fallback',              description: 'Model fallback triggered',                         blocker: false, category: 'model'      },
  // Approval
  { event: 'approval.requested',          description: 'Tool approval requested',                          blocker: false, category: 'approval'   },
  { event: 'approval.approved',           description: 'Approval granted',                                 blocker: false, category: 'approval'   },
  { event: 'approval.rejected',           description: 'Approval denied',                                  blocker: false, category: 'approval'   },
  { event: 'approval.timeout',            description: 'Approval timed out',                               blocker: false, category: 'approval'   },
  { event: 'approval.expired',            description: 'Approval expired without action',                  blocker: false, category: 'approval'   },
  // Skills
  { event: 'skill.installed',             description: 'Skill installed',                                  blocker: false, category: 'skills'     },
  { event: 'skill.removed',               description: 'Skill removed',                                    blocker: false, category: 'skills'     },
  { event: 'skill.activated',             description: 'Skill activated',                                  blocker: false, category: 'skills'     },
  { event: 'skill.deactivated',           description: 'Skill deactivated',                               blocker: false, category: 'skills'     },
  { event: 'skill.error',                 description: 'Skill error',                                      blocker: false, category: 'skills'     },
  // Vault
  { event: 'vault.document.created',      description: 'Vault document created',                           blocker: false, category: 'vault'      },
  { event: 'vault.document.updated',      description: 'Vault document updated',                           blocker: false, category: 'vault'      },
  { event: 'vault.document.deleted',      description: 'Vault document deleted',                           blocker: false, category: 'vault'      },
  { event: 'vault.sync.start',            description: 'Vault sync started',                               blocker: false, category: 'vault'      },
  { event: 'vault.sync.complete',         description: 'Vault sync completed',                             blocker: false, category: 'vault'      },
  { event: 'vault.sync.failed',           description: 'Vault sync failed',                                blocker: false, category: 'vault'      },
  { event: 'vault.proposal.created',      description: 'Vault proposal created by agent',                  blocker: false, category: 'vault'      },
  { event: 'vault.proposal.approved',     description: 'Vault proposal approved',                          blocker: false, category: 'vault'      },
  // Scheduler
  { event: 'schedule.created',            description: 'Schedule created',                                 blocker: false, category: 'scheduler'  },
  { event: 'schedule.deleted',            description: 'Schedule deleted',                                 blocker: false, category: 'scheduler'  },
  { event: 'schedule.paused',             description: 'Schedule paused',                                  blocker: false, category: 'scheduler'  },
  { event: 'schedule.resumed',            description: 'Schedule resumed',                                 blocker: false, category: 'scheduler'  },
  { event: 'schedule.fired',              description: 'Scheduled job fired',                              blocker: false, category: 'scheduler'  },
  { event: 'schedule.complete',           description: 'Scheduled job completed',                          blocker: false, category: 'scheduler'  },
  { event: 'schedule.failed',             description: 'Scheduled job failed',                             blocker: false, category: 'scheduler'  },
  // MCP
  { event: 'mcp.connected',               description: 'MCP server connected',                             blocker: false, category: 'mcp'        },
  { event: 'mcp.disconnected',            description: 'MCP server disconnected',                          blocker: false, category: 'mcp'        },
  { event: 'mcp.error',                   description: 'MCP server error',                                 blocker: false, category: 'mcp'        },
  { event: 'mcp.tool.called',             description: 'MCP tool called',                                  blocker: false, category: 'mcp'        },
  { event: 'mcp.reconnecting',            description: 'MCP server reconnecting',                          blocker: false, category: 'mcp'        },
  // Connectors
  { event: 'connector.message.received',  description: 'Message received from connector (Discord)',        blocker: true,  category: 'connectors' },
  { event: 'connector.message.sent',      description: 'Message sent via connector',                       blocker: false, category: 'connectors' },
  { event: 'connector.connected',         description: 'Connector connected',                              blocker: false, category: 'connectors' },
  { event: 'connector.disconnected',      description: 'Connector disconnected',                           blocker: false, category: 'connectors' },
  { event: 'connector.error',             description: 'Connector error',                                  blocker: false, category: 'connectors' },
  { event: 'connector.reconnecting',      description: 'Connector reconnecting',                           blocker: false, category: 'connectors' },
  // Workers
  { event: 'worker.started',              description: 'Worker process started',                           blocker: false, category: 'workers'    },
  { event: 'worker.stopped',              description: 'Worker process stopped',                           blocker: false, category: 'workers'    },
  { event: 'worker.job.started',          description: 'Queue job started',                                blocker: false, category: 'workers'    },
  { event: 'worker.job.completed',        description: 'Queue job completed',                              blocker: false, category: 'workers'    },
  { event: 'worker.job.failed',           description: 'Queue job failed',                                 blocker: false, category: 'workers'    },
  { event: 'worker.job.retrying',         description: 'Queue job retrying after failure',                 blocker: false, category: 'workers'    },
  { event: 'queue.stalled',               description: 'Queue stalled',                                    blocker: false, category: 'workers'    },
  // Auth
  { event: 'auth.login',                  description: 'User logged in to dashboard',                      blocker: false, category: 'auth'       },
  { event: 'auth.logout',                 description: 'User logged out',                                  blocker: false, category: 'auth'       },
  { event: 'auth.failed',                 description: 'Authentication failed',                            blocker: false, category: 'auth'       },
  { event: 'auth.token.expired',          description: 'Auth token expired',                               blocker: false, category: 'auth'       },
  // System
  { event: 'gateway.start',               description: 'Gateway starting up',                              blocker: false, category: 'system'     },
  { event: 'gateway.stop',                description: 'Gateway shutting down',                            blocker: false, category: 'system'     },
  { event: 'gateway.ready',               description: 'Gateway ready to accept connections',              blocker: false, category: 'system'     },
  { event: 'gateway.error',               description: 'Gateway error',                                    blocker: false, category: 'system'     },
  { event: 'config.reloaded',             description: 'Configuration reloaded',                           blocker: false, category: 'system'     },
  { event: 'config.changed',              description: 'Configuration changed',                            blocker: false, category: 'system'     },
]

const EVENT_MAP = new Map(HOOK_EVENTS.map(e => [e.event, e]))
const CATEGORIES = ['session', 'agent', 'tool', 'model', 'approval', 'skills', 'vault', 'scheduler', 'mcp', 'connectors', 'workers', 'auth', 'system'] as const

const CATEGORY_STYLES: Record<string, string> = {
  session:    'bg-blue-900/40 text-blue-300 border border-blue-800/50',
  agent:      'bg-purple-900/40 text-purple-300 border border-purple-800/50',
  tool:       'bg-amber-900/40 text-amber-300 border border-amber-800/50',
  model:      'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50',
  approval:   'bg-orange-900/40 text-orange-300 border border-orange-800/50',
  skills:     'bg-green-900/40 text-green-300 border border-green-800/50',
  vault:      'bg-indigo-900/40 text-indigo-300 border border-indigo-800/50',
  scheduler:  'bg-teal-900/40 text-teal-300 border border-teal-800/50',
  mcp:        'bg-pink-900/40 text-pink-300 border border-pink-800/50',
  connectors: 'bg-rose-900/40 text-rose-300 border border-rose-800/50',
  workers:    'bg-gray-800 text-gray-400 border border-gray-700',
  auth:       'bg-yellow-900/40 text-yellow-300 border border-yellow-800/50',
  system:     'bg-red-900/30 text-red-300 border border-red-800/40',
}

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  name: string
  event: string
  command: string
  matcher: string
  enabled: boolean
}

const EMPTY_FORM: FormState = { name: '', event: '', command: '', matcher: '', enabled: true }

function HookForm({
  initial,
  lockEvent,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: FormState
  lockEvent?: boolean
  onSave: (f: FormState) => void
  onCancel: () => void
  saving: boolean
  error: string
}) {
  const [form, setForm] = useState<FormState>(initial)
  const selectedDef = EVENT_MAP.get(form.event)

  function set(key: keyof FormState, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Log shell commands"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-end gap-2 pb-0.5">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => set('enabled', e.target.checked)}
              className="accent-blue-500"
            />
            Enabled
          </label>
        </div>
      </div>

      {!lockEvent && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Event</label>
          <select
            value={form.event}
            onChange={e => set('event', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">— select event —</option>
            {CATEGORIES.map(cat => (
              <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                {HOOK_EVENTS.filter(e => e.category === cat).map(e => (
                  <option key={e.event} value={e.event}>{e.event}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {selectedDef && (
        <p className="text-xs text-gray-500 -mt-1">
          {selectedDef.description}
          {selectedDef.blocker && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400">blocker — non-zero exit blocks event</span>
          )}
        </p>
      )}

      <div>
        <label className="block text-xs text-gray-400 mb-1">Command <span className="text-gray-600">(shell, runs via bash -c)</span></label>
        <textarea
          value={form.command}
          onChange={e => set('command', e.target.value)}
          rows={3}
          placeholder={'echo "AGENCY_EVENT=$AGENCY_EVENT" >> /tmp/agency-hooks.log'}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
        <p className="text-xs text-gray-600 mt-1">Event context available as <code className="text-gray-500">AGENCY_*</code> env vars</p>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Matcher <span className="text-gray-600">(optional JSON filter on context)</span></label>
        <textarea
          value={form.matcher}
          onChange={e => set('matcher', e.target.value)}
          rows={2}
          placeholder={'{"toolName": "shell_run"}'}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim() || !form.event || !form.command.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
        >
          {saving ? 'Saving…' : 'Save hook'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HooksPage() {
  const [allHooks, setAllHooks] = useState<Hook[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [addingForEvent, setAddingForEvent] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    hooks.list()
      .then(r => setAllHooks(r.hooks))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  function parseMatcher(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed) as Record<string, unknown>
  }

  async function handleCreate(form: FormState) {
    setFormError('')
    setSaving(true)
    try {
      await hooks.create({
        name: form.name.trim(),
        event: form.event,
        command: form.command.trim(),
        matcher: parseMatcher(form.matcher),
        enabled: form.enabled,
      })
      setCreating(false)
      setAddingForEvent(null)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create hook')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: string, form: FormState) {
    setFormError('')
    setSaving(true)
    try {
      await hooks.update(id, {
        name: form.name.trim(),
        command: form.command.trim(),
        matcher: parseMatcher(form.matcher),
        enabled: form.enabled,
      })
      setEditingId(null)
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update hook')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await hooks.remove(id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete hook')
    }
  }

  async function handleToggle(hook: Hook) {
    try {
      await hooks.update(hook.id, { enabled: !hook.enabled })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update hook')
    }
  }

  // Group custom hooks by event
  const hooksByEvent = allHooks.reduce<Record<string, Hook[]>>((acc, h) => {
    ;(acc[h.event] ??= []).push(h)
    return acc
  }, {})

  const customCount = allHooks.length
  const configuredEvents = new Set(allHooks.map(h => h.event))

  const visibleEvents = activeCategory === 'all'
    ? HOOK_EVENTS
    : HOOK_EVENTS.filter(e => e.category === activeCategory)

  const categoryCounts = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = HOOK_EVENTS.filter(e => e.category === cat).length
    return acc
  }, {})

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Hooks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Shell commands that run in response to agent lifecycle events
            {customCount > 0 && <span className="ml-2 text-gray-600">· {customCount} custom {customCount === 1 ? 'hook' : 'hooks'} configured</span>}
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setAddingForEvent(null); setEditingId(null); setFormError('') }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            New Hook
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {creating && (
        <div className="mb-6">
          <HookForm
            initial={EMPTY_FORM}
            onSave={handleCreate}
            onCancel={() => { setCreating(false); setFormError('') }}
            saving={saving}
            error={formError}
          />
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-800">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${activeCategory === 'all' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
        >
          All ({HOOK_EVENTS.length})
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 text-sm whitespace-nowrap capitalize transition-colors ${activeCategory === c ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {c} ({categoryCounts[c]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Event</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Description</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Hooks</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map(def => {
                const eventHooks = hooksByEvent[def.event] ?? []
                const hasHooks = eventHooks.length > 0
                const isAddingHere = addingForEvent === def.event

                return (
                  <Fragment key={def.event}>
                    {/* System event row */}
                    <tr
                      key={def.event}
                      className={`border-b border-gray-800/60 ${hasHooks ? 'bg-gray-900' : 'hover:bg-gray-800/20'} transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-300">{def.event}</span>
                          {def.blocker && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 border border-orange-800/40">blocker</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{def.description}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_STYLES[def.category] ?? 'bg-gray-800 text-gray-400'}`}>
                          {def.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {hasHooks ? (
                          <span className="text-xs text-gray-400">{eventHooks.length} configured</span>
                        ) : (
                          <span className="text-xs text-gray-700">none</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setAddingForEvent(isAddingHere ? null : def.event)
                            setCreating(false)
                            setEditingId(null)
                            setFormError('')
                          }}
                          className="text-xs text-blue-500 hover:text-blue-400 transition-colors whitespace-nowrap"
                        >
                          {isAddingHere ? 'cancel' : '+ add hook'}
                        </button>
                      </td>
                    </tr>

                    {/* Inline add form */}
                    {isAddingHere && (
                      <tr key={`${def.event}-add`} className="border-b border-gray-800">
                        <td colSpan={5} className="px-4 py-4 bg-gray-950/60">
                          <HookForm
                            initial={{ ...EMPTY_FORM, event: def.event }}
                            lockEvent
                            onSave={handleCreate}
                            onCancel={() => { setAddingForEvent(null); setFormError('') }}
                            saving={saving}
                            error={formError}
                          />
                        </td>
                      </tr>
                    )}

                    {/* Custom hook rows */}
                    {eventHooks.map(hook => {
                      const isEditing = editingId === hook.id
                      return (
                        <Fragment key={hook.id}>
                          <tr
                            className={`border-b border-gray-800/40 bg-gray-800/20 ${isEditing ? '' : 'hover:bg-gray-800/40'} transition-colors`}
                          >
                            <td className="pl-8 pr-4 py-2.5" colSpan={1}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300 border border-violet-700/50 font-medium">custom</span>
                                <span className="text-white text-sm font-medium">{hook.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-400 max-w-xs truncate" title={hook.command} colSpan={2}>
                              {hook.command}
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => void handleToggle(hook)}
                                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                                  hook.enabled
                                    ? 'bg-green-900/50 text-green-400 hover:bg-green-900/70'
                                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                                }`}
                              >
                                {hook.enabled ? 'active' : 'disabled'}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  onClick={() => { setEditingId(isEditing ? null : hook.id); setAddingForEvent(null); setCreating(false); setFormError('') }}
                                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                  {isEditing ? 'cancel' : 'edit'}
                                </button>
                                <button
                                  onClick={() => void handleDelete(hook.id)}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                  delete
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isEditing && (
                            <tr className="border-b border-gray-800">
                              <td colSpan={5} className="px-4 py-4 bg-gray-950/60">
                                <HookForm
                                  initial={{
                                    name: hook.name,
                                    event: hook.event,
                                    command: hook.command,
                                    matcher: hook.matcher ? JSON.stringify(hook.matcher, null, 2) : '',
                                    enabled: hook.enabled,
                                  }}
                                  lockEvent
                                  onSave={form => void handleUpdate(hook.id, form)}
                                  onCancel={() => { setEditingId(null); setFormError('') }}
                                  saving={saving}
                                  error={formError}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
