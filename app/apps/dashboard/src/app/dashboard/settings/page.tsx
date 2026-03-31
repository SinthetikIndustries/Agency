// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { models } from '@/lib/api'
import { useTheme } from '@/components/ThemeProvider'
import { THEMES, type ThemeKey, getThemeMeta } from '@/lib/themes'
import { RoutingProfileEditor } from './RoutingProfileEditor'

interface ModelInfo {
  name: string
  tier?: string
  provider: string
  isDefault: boolean
}

// ─── Theme Selector ───────────────────────────────────────────────────────────

const GROUPS = [
  'Base', 'Ocean', 'Forest', 'Dusk', 'Ember', 'Rose',
  'Arctic', 'Noir', 'Slate', 'Copper', 'Neon',
  'Tokyo Night', 'Solarized', 'Catppuccin', 'Gruvbox', 'Dracula', 'Nord',
]

function ThemeCard({ themeKey, current, onClick }: {
  themeKey: ThemeKey
  current: boolean
  onClick: () => void
}) {
  const meta = getThemeMeta(themeKey)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px',
        borderRadius: '6px',
        border: `2px solid ${current ? meta.preview.accent : 'var(--border)'}`,
        background: current ? 'var(--accent-dim)' : 'var(--bg-elevated)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        textAlign: 'left',
      }}
      onMouseEnter={e => {
        if (!current) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-muted)'
      }}
      onMouseLeave={e => {
        if (!current) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
      }}
    >
      {/* Color preview strip */}
      <div style={{ display: 'flex', gap: '3px', height: '32px', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ flex: 2, background: meta.preview.bg }} />
        <div style={{ flex: 2, background: meta.preview.surface }} />
        <div style={{ flex: 1, background: meta.preview.accent }} />
      </div>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          fontWeight: 500,
          color: current ? 'var(--accent)' : 'var(--text-primary)',
        }}>
          {meta.label}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: current ? 'var(--accent)' : 'var(--text-secondary)',
          padding: '1px 5px',
          borderRadius: '3px',
          background: meta.mode === 'dark' ? '#ffffff08' : '#00000008',
          border: `1px solid ${current ? 'var(--border-accent)' : 'var(--border-dim)'}`,
        }}>
          {meta.mode}
        </span>
      </div>
    </button>
  )
}

function ThemePanel() {
  const { theme, setTheme } = useTheme()

  // Split groups into three columns
  const col1 = GROUPS.filter((_, i) => i % 3 === 0)
  const col2 = GROUPS.filter((_, i) => i % 3 === 1)
  const col3 = GROUPS.filter((_, i) => i % 3 === 2)

  function renderGroup(group: string) {
    const groupThemes = THEMES.filter(t => t.group === group)
    return (
      <div key={group} style={{ marginBottom: '20px' }}>
        <p className="section-label" style={{ marginBottom: '10px' }}>{group}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
          {groupThemes.map(t => (
            <ThemeCard key={t.key} themeKey={t.key} current={theme === t.key} onClick={() => setTheme(t.key)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Current: <span style={{ color: 'var(--accent)' }}>{theme}</span>
        &nbsp;&nbsp;·&nbsp;&nbsp;Saved to browser storage
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 28px', alignItems: 'start' }}>
        <div>{col1.map(renderGroup)}</div>
        <div>{col2.map(renderGroup)}</div>
        <div>{col3.map(renderGroup)}</div>
      </div>
    </div>
  )
}

// ─── General Settings Panel ───────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  ollama: 'Ollama (local)',
  openrouter: 'OpenRouter',
}

function GeneralPanel() {
  const [modelList, setModelList] = useState<ModelInfo[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [error, setError] = useState('')
  const [hasOllama, setHasOllama] = useState(false)

  // Pull model state
  const [pullModel, setPullModel] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullLog, setPullLog] = useState<string[]>([])
  const pullLogRef = useRef<HTMLDivElement>(null)

  function loadModels() {
    setLoading(true)
    models.list()
      .then(r => {
        setModelList(r.models)
        setHasOllama(r.models.some(m => m.provider === 'ollama'))
        const def = r.models.find(m => m.isDefault) ?? r.models[0]
        if (def) setDefaultModel(def.name)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load models'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadModels() }, [])

  async function saveDefaultModel() {
    if (!defaultModel) return
    setSaving(true)
    setError('')
    try {
      await models.setDefault(defaultModel)
      setActionMsg('Default model updated')
      setTimeout(() => setActionMsg(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handlePull() {
    if (!pullModel.trim()) return
    setPulling(true)
    setPullLog([`Pulling ${pullModel}…`])
    try {
      const res = await models.pull(pullModel.trim())
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line) as { status?: string; error?: string; completed?: number; total?: number }
            const msg = obj.error ? `Error: ${obj.error}`
              : obj.total ? `${obj.status ?? ''} ${Math.round((obj.completed ?? 0) / obj.total * 100)}%`
              : (obj.status ?? line)
            setPullLog(prev => {
              const last = prev[prev.length - 1]
              // Replace progress lines in-place
              if (last?.startsWith(obj.status ?? '__') && obj.total) return [...prev.slice(0, -1), msg]
              return [...prev, msg]
            })
          } catch {
            setPullLog(prev => [...prev, line])
          }
        }
        if (pullLogRef.current) pullLogRef.current.scrollTop = pullLogRef.current.scrollHeight
      }
      setPullLog(prev => [...prev, 'Done.'])
      setPullModel('')
      loadModels()
    } catch (err) {
      setPullLog(prev => [...prev, `Failed: ${String(err)}`])
    } finally {
      setPulling(false)
    }
  }

  const providers = ['anthropic', 'openai', 'openrouter', 'ollama'].filter(p => modelList.some(m => m.provider === p))

  return (
    <div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--red)' }}>
          {error}
        </div>
      )}
      {actionMsg && (
        <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--green)' }}>
          {actionMsg}
        </div>
      )}

      {/* Default model */}
      <div className="card" style={{ padding: '16px' }}>
        <p style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>Default model</p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Used by new agents unless overridden by their profile or model config.
        </p>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>Loading models...</p>
        ) : modelList.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>No models available. Check provider config.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {providers.map(provider => (
              <div key={provider}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {PROVIDER_LABELS[provider] ?? provider}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {modelList.filter(m => m.provider === provider).map(m => (
                    <label key={m.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="model"
                        value={m.name}
                        checked={defaultModel === m.name}
                        onChange={() => setDefaultModel(m.name)}
                        style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {m.name}
                      </span>
                      {m.tier && <span className="badge badge-gray">{m.tier}</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => void saveDefaultModel()} disabled={saving || !defaultModel} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Pull Ollama model */}
      {hasOllama && (
        <div className="card" style={{ padding: '16px' }}>
          <p style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>Pull Ollama model</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Download a model from the Ollama registry. Browse available models at{' '}
            <span style={{ color: 'var(--accent)' }}>ollama.com/library</span>.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: pullLog.length > 0 ? '10px' : 0 }}>
            <input
              type="text"
              value={pullModel}
              onChange={e => setPullModel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handlePull() }}
              placeholder="e.g. llama3.2, mistral, phi3"
              disabled={pulling}
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                padding: '7px 10px',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button onClick={() => void handlePull()} disabled={pulling || !pullModel.trim()} className="btn btn-primary">
              {pulling ? 'Pulling…' : 'Pull'}
            </button>
          </div>
          {pullLog.length > 0 && (
            <div
              ref={pullLogRef}
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '8px 10px',
                maxHeight: '140px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {pullLog.map((line, i) => (
                <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ─── CLI Reference Panel ──────────────────────────────────────────────────────

const CLI_SECTIONS = [
  {
    label: 'System',
    commands: [
      { cmd: 'agency start',            desc: 'Start all Agency services'                },
      { cmd: 'agency stop',             desc: 'Stop all Agency services'                 },
      { cmd: 'agency restart',          desc: 'Restart all Agency services'              },
      { cmd: 'agency status',           desc: 'Show service status and health'           },
      { cmd: 'agency doctor',           desc: 'Diagnose configuration and connectivity'  },
      { cmd: 'agency repair',           desc: 'Re-run failed install steps'              },
      { cmd: 'agency update',           desc: 'Update Agency to the latest version'      },
      { cmd: 'agency uninstall',        desc: 'Remove Agency and clean up'               },
    ],
  },
  {
    label: 'Configuration',
    commands: [
      { cmd: 'agency config get <key>',         desc: 'Get a config value'                      },
      { cmd: 'agency config set <key> <value>',  desc: 'Set a config value'                      },
      { cmd: 'agency config edit',               desc: 'Open config file in your editor'         },
    ],
  },
  {
    label: 'Agents',
    commands: [
      { cmd: 'agency agents list',                       desc: 'List all agents'                         },
      { cmd: 'agency agents show <slug>',                desc: 'Show agent details'                      },
      { cmd: 'agency agents enable <slug>',              desc: 'Enable an agent'                         },
      { cmd: 'agency agents disable <slug>',             desc: 'Disable an agent'                        },
      { cmd: 'agency agents create',                     desc: 'Create a new agent'                      },
      { cmd: 'agency agents update <slug>',              desc: 'Update agent settings'                   },
      { cmd: 'agency agents model-config <slug>',        desc: 'Set agent model routing config'          },
      { cmd: 'agency agents workspace <slug>',           desc: 'List agent workspace files'              },
      { cmd: 'agency agents workspace get <slug>',       desc: 'Read a file from agent workspace'        },
      { cmd: 'agency agents workspace set <slug>',       desc: 'Write a file to agent workspace'         },
      { cmd: 'agency agents profile list',               desc: 'List available profiles'                 },
      { cmd: 'agency agents profile create',             desc: 'Create a new agent profile'              },
      { cmd: 'agency agents profile attach <a> <p>',     desc: 'Attach a profile to an agent'            },
    ],
  },
  {
    label: 'Skills',
    commands: [
      { cmd: 'agency skills list',           desc: 'List installed skills'                   },
      { cmd: 'agency skills install <name>', desc: 'Install a skill from registry or path'   },
      { cmd: 'agency skills remove <name>',  desc: 'Remove an installed skill'               },
      { cmd: 'agency skills update <name>',  desc: 'Update a skill to the latest version'    },
    ],
  },
  {
    label: 'Sessions',
    commands: [
      { cmd: 'agency chat',                          desc: 'Start an interactive chat session'         },
      { cmd: 'agency sessions list',                 desc: 'List active sessions'                      },
      { cmd: 'agency sessions list --client cli',    desc: 'List CLI sessions (default)'               },
      { cmd: 'agency sessions info <id>',            desc: 'Show session details'                      },
      { cmd: 'agency sessions messages <id>',        desc: 'Show messages in a session'                },
      { cmd: 'agency sessions send <id> <message>',  desc: 'Send a message to a session'               },
      { cmd: 'agency sessions rename <id> <name>',   desc: 'Rename a session'                          },
      { cmd: 'agency sessions pin <id>',             desc: 'Pin a session to the top of the list'      },
      { cmd: 'agency sessions unpin <id>',           desc: 'Unpin a session'                           },
      { cmd: 'agency sessions delete <id>',          desc: 'Delete a session'                          },
    ],
  },
  {
    label: 'Schedules',
    commands: [
      { cmd: 'agency schedules list',                       desc: 'List all scheduled tasks'              },
      { cmd: 'agency schedules list --agent <slug>',        desc: 'Filter by agent'                       },
      { cmd: 'agency schedules create --agent <slug> …',   desc: 'Create a scheduled task'               },
      { cmd: 'agency schedules enable <id>',                desc: 'Enable a paused schedule'              },
      { cmd: 'agency schedules disable <id>',               desc: 'Pause a schedule'                      },
      { cmd: 'agency schedules delete <id>',                desc: 'Delete a schedule'                     },
      { cmd: 'agency schedules runs <id>',                  desc: 'View run history for a schedule'       },
    ],
  },
  {
    label: 'Models',
    commands: [
      { cmd: 'agency models list',              desc: 'List available models'                    },
      { cmd: 'agency models set-default <m>',   desc: 'Set the default model'                    },
      { cmd: 'agency models test',              desc: 'Test model connectivity'                  },
      { cmd: 'agency models pull <name>',       desc: 'Pull an Ollama model'                     },
    ],
  },
  {
    label: 'Vault',
    commands: [
      { cmd: 'agency vault init',              desc: 'Initialize vault sync'                     },
      { cmd: 'agency vault sync',              desc: 'Trigger a manual vault sync'               },
      { cmd: 'agency vault status',            desc: 'Show vault sync status'                    },
      { cmd: 'agency vault validate',          desc: 'Validate vault documents'                  },
      { cmd: 'agency vault graph-status',      desc: 'Show knowledge graph stats'                },
      { cmd: 'agency vault search <query>',    desc: 'Search vault documents'                    },
      { cmd: 'agency vault related <slug>',    desc: 'Show documents related to a slug'          },
    ],
  },
  {
    label: 'Approvals',
    commands: [
      { cmd: 'agency approvals list',            desc: 'List pending tool approvals'             },
      { cmd: 'agency approvals approve <id>',    desc: 'Approve a pending action'                },
      { cmd: 'agency approvals reject <id>',     desc: 'Reject a pending action'                 },
    ],
  },
  {
    label: 'Connectors',
    commands: [
      { cmd: 'agency connectors list',                  desc: 'List configured connectors'              },
      { cmd: 'agency connectors enable <name>',         desc: 'Enable a connector'                      },
      { cmd: 'agency connectors disable <name>',        desc: 'Disable a connector'                     },
      { cmd: 'agency connectors discord agents',        desc: 'List Discord agent bot connections'      },
    ],
  },
  {
    label: 'MCP',
    commands: [
      { cmd: 'agency mcp connections',           desc: 'List MCP server connections'             },
      { cmd: 'agency mcp reconnect <name>',      desc: 'Reconnect an MCP server connection'      },
    ],
  },
  {
    label: 'Queue',
    commands: [
      { cmd: 'agency queue stats',    desc: 'Show messaging queue statistics'           },
      { cmd: 'agency queue workers',  desc: 'Show active queue workers'                 },
    ],
  },
  {
    label: 'Auth',
    commands: [
      { cmd: 'agency auth login',   desc: 'Log in and store a session token'            },
      { cmd: 'agency auth logout',  desc: 'Invalidate the current session token'        },
      { cmd: 'agency auth me',      desc: 'Show current authenticated user'             },
    ],
  },
  {
    label: 'Audit & Logs',
    commands: [
      { cmd: 'agency audit list',          desc: 'View recent audit log entries'             },
      { cmd: 'agency logs',                desc: 'Stream live service logs'                  },
      { cmd: 'agency messaging status',    desc: 'Show agent messaging queue depths'         },
    ],
  },
  {
    label: 'Observability',
    commands: [
      { cmd: 'agency diagnostics',               desc: 'Show full system diagnostics report'       },
      { cmd: 'agency metrics',                   desc: 'Print Prometheus metrics from the gateway' },
      { cmd: 'agency health service <service>',  desc: 'Check health of a specific service'        },
    ],
  },
]

function CliPanel() {
  const [search, setSearch] = useState('')
  const q = search.toLowerCase().trim()

  const filtered = CLI_SECTIONS.map(section => ({
    ...section,
    commands: section.commands.filter(c =>
      !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    ),
  })).filter(s => s.commands.length > 0)

  return (
    <div style={{ maxWidth: '760px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Full reference for the <span style={{ color: 'var(--accent)' }}>agency</span> CLI.
        Run <span style={{ color: 'var(--text-secondary)' }}>agency &lt;command&gt; --help</span> for options.
      </p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter commands…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          padding: '7px 10px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          color: 'var(--text-primary)',
          outline: 'none',
          marginBottom: '20px',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {filtered.map(section => (
          <div key={section.label}>
            <p className="section-label" style={{ marginBottom: '8px' }}>{section.label}</p>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}>
              {section.commands.map((c, i) => (
                <div key={c.cmd} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  padding: '9px 14px',
                  borderBottom: i < section.commands.length - 1 ? '1px solid var(--border-dim)' : 'none',
                  alignItems: 'center',
                }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                    {c.cmd}
                  </code>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {c.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No commands match &ldquo;{search}&rdquo;</p>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'general' | 'theme' | 'routing' | 'cli'

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = (searchParams.get('tab') ?? 'general') as Tab
  function setTab(t: Tab) {
    router.push(`/dashboard/settings?tab=${t}`, { scroll: false })
  }

  const TAB_LABELS: Record<Tab, string> = {
    general: 'General',
    theme: 'Theme',
    routing: 'Routing',
    cli: 'CLI Reference',
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0, marginBottom: '4px' }}>
          Settings
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Platform configuration
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '2px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '24px',
      }}>
        {(['general', 'theme', 'routing', 'cli'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              padding: '8px 16px',
              marginBottom: '-1px',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: tab === t ? 500 : 400,
              color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'color 0.1s',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Panel */}
      {tab === 'general' && <GeneralPanel />}
      {tab === 'theme' && <ThemePanel />}
      {tab === 'routing' && (
        <section>
          <h2 className="text-sm font-medium text-white mb-1">Routing Profiles</h2>
          <p className="text-xs text-gray-500 mb-4">
            Define named fallback chains. When an agent uses auto-router mode, it tries each model in order on error or rate limit.
          </p>
          <RoutingProfileEditor />
        </section>
      )}
      {tab === 'cli' && <CliPanel />}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  )
}
