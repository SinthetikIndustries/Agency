// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '@agency/orchestrator/db'

// ─── Event Catalogue ──────────────────────────────────────────────────────────

export interface HookEventDef {
  event: string
  description: string
  blocker: boolean
  category: string
}

export const HOOK_EVENTS: HookEventDef[] = [
  // Session
  { event: 'session.created',           description: 'New session created',                          blocker: false, category: 'session'    },
  { event: 'session.message',           description: 'User message received',                        blocker: true,  category: 'session'    },
  { event: 'session.complete',          description: 'Session turn completed',                       blocker: false, category: 'session'    },
  { event: 'session.error',             description: 'Session encountered an error',                  blocker: false, category: 'session'    },
  { event: 'session.timeout',           description: 'Session timed out',                            blocker: false, category: 'session'    },
  { event: 'session.deleted',           description: 'Session deleted',                              blocker: false, category: 'session'    },

  // Agent
  { event: 'agent.created',             description: 'New agent created',                            blocker: false, category: 'agent'      },
  { event: 'agent.deleted',             description: 'Agent deleted',                                blocker: false, category: 'agent'      },
  { event: 'agent.enabled',             description: 'Agent enabled',                                blocker: false, category: 'agent'      },
  { event: 'agent.disabled',            description: 'Agent disabled',                               blocker: false, category: 'agent'      },
  { event: 'agent.wake',                description: 'Dormant agent woke up',                        blocker: false, category: 'agent'      },
  { event: 'agent.sleep',               description: 'Agent went dormant',                           blocker: false, category: 'agent'      },
  { event: 'agent.profile.changed',     description: 'Agent profile switched',                       blocker: false, category: 'agent'      },
  { event: 'agent.spawned',             description: 'New agent spawned by another agent',           blocker: false, category: 'agent'      },
  { event: 'agent.error',               description: 'Agent encountered an error',                   blocker: false, category: 'agent'      },
  { event: 'agent.context.compact',     description: 'Agent context window compacted',               blocker: false, category: 'agent'      },
  { event: 'agent.message.sent',        description: 'Agent sent a message to another agent',        blocker: false, category: 'agent'      },
  { event: 'agent.message.received',    description: 'Agent received an inter-agent message',        blocker: true,  category: 'agent'      },

  // Tool — generic
  { event: 'tool.before',               description: 'Before any tool dispatch',                     blocker: true,  category: 'tool'       },
  { event: 'tool.after',                description: 'After any tool completes',                     blocker: false, category: 'tool'       },
  { event: 'tool.error',                description: 'Tool dispatch failed',                         blocker: false, category: 'tool'       },

  // Tool — file
  { event: 'tool.file.before',          description: 'Before file tool dispatch',                    blocker: true,  category: 'tool'       },
  { event: 'tool.file.after',           description: 'After file tool completes',                    blocker: false, category: 'tool'       },
  { event: 'tool.file.error',           description: 'File tool failed',                             blocker: false, category: 'tool'       },

  // Tool — shell
  { event: 'tool.shell.before',         description: 'Before shell tool dispatch',                   blocker: true,  category: 'tool'       },
  { event: 'tool.shell.after',          description: 'After shell tool completes',                   blocker: false, category: 'tool'       },
  { event: 'tool.shell.error',          description: 'Shell tool failed',                            blocker: false, category: 'tool'       },

  // Tool — browser
  { event: 'tool.browser.before',       description: 'Before browser tool dispatch',                 blocker: true,  category: 'tool'       },
  { event: 'tool.browser.after',        description: 'After browser tool completes',                 blocker: false, category: 'tool'       },
  { event: 'tool.browser.error',        description: 'Browser tool failed',                          blocker: false, category: 'tool'       },

  // Tool — http
  { event: 'tool.http.before',          description: 'Before HTTP tool dispatch',                    blocker: true,  category: 'tool'       },
  { event: 'tool.http.after',           description: 'After HTTP tool completes',                    blocker: false, category: 'tool'       },
  { event: 'tool.http.error',           description: 'HTTP tool failed',                             blocker: false, category: 'tool'       },

  // Tool — code
  { event: 'tool.code.before',          description: 'Before code execution tool dispatch',          blocker: true,  category: 'tool'       },
  { event: 'tool.code.after',           description: 'After code execution tool completes',          blocker: false, category: 'tool'       },
  { event: 'tool.code.error',           description: 'Code execution tool failed',                   blocker: false, category: 'tool'       },

  // Tool — memory
  { event: 'tool.memory.before',        description: 'Before memory tool dispatch',                  blocker: true,  category: 'tool'       },
  { event: 'tool.memory.after',         description: 'After memory tool completes',                  blocker: false, category: 'tool'       },
  { event: 'tool.memory.error',         description: 'Memory tool failed',                           blocker: false, category: 'tool'       },

  // Tool — vault
  { event: 'tool.vault.before',         description: 'Before vault tool dispatch',                   blocker: true,  category: 'tool'       },
  { event: 'tool.vault.after',          description: 'After vault tool completes',                   blocker: false, category: 'tool'       },
  { event: 'tool.vault.error',          description: 'Vault tool failed',                            blocker: false, category: 'tool'       },

  // Tool — messaging
  { event: 'tool.messaging.before',     description: 'Before messaging tool dispatch',               blocker: true,  category: 'tool'       },
  { event: 'tool.messaging.after',      description: 'After messaging tool completes',               blocker: false, category: 'tool'       },
  { event: 'tool.messaging.error',      description: 'Messaging tool failed',                        blocker: false, category: 'tool'       },

  // Tool — agent_management
  { event: 'tool.agent_management.before', description: 'Before agent management tool dispatch',    blocker: true,  category: 'tool'       },
  { event: 'tool.agent_management.after',  description: 'After agent management tool completes',    blocker: false, category: 'tool'       },
  { event: 'tool.agent_management.error',  description: 'Agent management tool failed',             blocker: false, category: 'tool'       },

  // Model
  { event: 'model.before',              description: 'Before LLM completion request',               blocker: true,  category: 'model'      },
  { event: 'model.after',               description: 'After LLM response received',                  blocker: false, category: 'model'      },
  { event: 'model.error',               description: 'LLM call failed',                              blocker: false, category: 'model'      },
  { event: 'model.context.compact',     description: 'Context window compaction triggered',          blocker: false, category: 'model'      },
  { event: 'model.stream.start',        description: 'LLM response streaming started',               blocker: false, category: 'model'      },
  { event: 'model.stream.end',          description: 'LLM response streaming ended',                 blocker: false, category: 'model'      },
  { event: 'model.fallback',            description: 'Model fallback triggered',                     blocker: false, category: 'model'      },

  // Approval
  { event: 'approval.requested',        description: 'Tool approval requested',                      blocker: false, category: 'approval'   },
  { event: 'approval.approved',         description: 'Approval granted',                             blocker: false, category: 'approval'   },
  { event: 'approval.rejected',         description: 'Approval denied',                              blocker: false, category: 'approval'   },
  { event: 'approval.timeout',          description: 'Approval timed out',                           blocker: false, category: 'approval'   },
  { event: 'approval.expired',          description: 'Approval expired without action',              blocker: false, category: 'approval'   },

  // Skills
  { event: 'skill.installed',           description: 'Skill installed',                              blocker: false, category: 'skills'     },
  { event: 'skill.removed',             description: 'Skill removed',                                blocker: false, category: 'skills'     },
  { event: 'skill.activated',           description: 'Skill activated',                              blocker: false, category: 'skills'     },
  { event: 'skill.deactivated',         description: 'Skill deactivated',                            blocker: false, category: 'skills'     },
  { event: 'skill.error',               description: 'Skill error',                                  blocker: false, category: 'skills'     },

  // Vault
  { event: 'vault.document.created',    description: 'Vault document created',                       blocker: false, category: 'vault'      },
  { event: 'vault.document.updated',    description: 'Vault document updated',                       blocker: false, category: 'vault'      },
  { event: 'vault.document.deleted',    description: 'Vault document deleted',                       blocker: false, category: 'vault'      },
  { event: 'vault.sync.start',          description: 'Vault sync started',                           blocker: false, category: 'vault'      },
  { event: 'vault.sync.complete',       description: 'Vault sync completed',                         blocker: false, category: 'vault'      },
  { event: 'vault.sync.failed',         description: 'Vault sync failed',                            blocker: false, category: 'vault'      },
  { event: 'vault.proposal.created',    description: 'Vault proposal created by agent',              blocker: false, category: 'vault'      },
  { event: 'vault.proposal.approved',   description: 'Vault proposal approved',                      blocker: false, category: 'vault'      },

  // Scheduler
  { event: 'schedule.created',          description: 'Schedule created',                             blocker: false, category: 'scheduler'  },
  { event: 'schedule.deleted',          description: 'Schedule deleted',                             blocker: false, category: 'scheduler'  },
  { event: 'schedule.paused',           description: 'Schedule paused',                              blocker: false, category: 'scheduler'  },
  { event: 'schedule.resumed',          description: 'Schedule resumed',                             blocker: false, category: 'scheduler'  },
  { event: 'schedule.fired',            description: 'Scheduled job fired',                          blocker: false, category: 'scheduler'  },
  { event: 'schedule.complete',         description: 'Scheduled job completed',                      blocker: false, category: 'scheduler'  },
  { event: 'schedule.failed',           description: 'Scheduled job failed',                         blocker: false, category: 'scheduler'  },

  // MCP
  { event: 'mcp.connected',             description: 'MCP server connected',                         blocker: false, category: 'mcp'        },
  { event: 'mcp.disconnected',          description: 'MCP server disconnected',                      blocker: false, category: 'mcp'        },
  { event: 'mcp.error',                 description: 'MCP server error',                             blocker: false, category: 'mcp'        },
  { event: 'mcp.tool.called',           description: 'MCP tool called',                              blocker: false, category: 'mcp'        },
  { event: 'mcp.reconnecting',          description: 'MCP server reconnecting',                      blocker: false, category: 'mcp'        },

  // Connectors
  { event: 'connector.message.received', description: 'Message received from connector', blocker: true, category: 'connectors' },
  { event: 'connector.message.sent',    description: 'Message sent via connector',                   blocker: false, category: 'connectors' },
  { event: 'connector.connected',       description: 'Connector connected',                          blocker: false, category: 'connectors' },
  { event: 'connector.disconnected',    description: 'Connector disconnected',                       blocker: false, category: 'connectors' },
  { event: 'connector.error',           description: 'Connector error',                              blocker: false, category: 'connectors' },
  { event: 'connector.reconnecting',    description: 'Connector reconnecting',                       blocker: false, category: 'connectors' },

  // Workers
  { event: 'worker.started',            description: 'Worker process started',                       blocker: false, category: 'workers'    },
  { event: 'worker.stopped',            description: 'Worker process stopped',                       blocker: false, category: 'workers'    },
  { event: 'worker.job.started',        description: 'Queue job started',                            blocker: false, category: 'workers'    },
  { event: 'worker.job.completed',      description: 'Queue job completed',                          blocker: false, category: 'workers'    },
  { event: 'worker.job.failed',         description: 'Queue job failed',                             blocker: false, category: 'workers'    },
  { event: 'worker.job.retrying',       description: 'Queue job retrying after failure',             blocker: false, category: 'workers'    },
  { event: 'queue.stalled',             description: 'Queue stalled',                                blocker: false, category: 'workers'    },

  // Auth
  { event: 'auth.login',                description: 'User logged in to dashboard',                  blocker: false, category: 'auth'       },
  { event: 'auth.logout',               description: 'User logged out',                              blocker: false, category: 'auth'       },
  { event: 'auth.failed',               description: 'Authentication failed',                        blocker: false, category: 'auth'       },
  { event: 'auth.token.expired',        description: 'Auth token expired',                           blocker: false, category: 'auth'       },

  // System
  { event: 'gateway.start',             description: 'Gateway starting up',                          blocker: false, category: 'system'     },
  { event: 'gateway.stop',              description: 'Gateway shutting down',                        blocker: false, category: 'system'     },
  { event: 'gateway.ready',             description: 'Gateway ready to accept connections',          blocker: false, category: 'system'     },
  { event: 'gateway.error',             description: 'Gateway error',                                blocker: false, category: 'system'     },
  { event: 'config.reloaded',           description: 'Configuration reloaded',                       blocker: false, category: 'system'     },
  { event: 'config.changed',            description: 'Configuration changed',                        blocker: false, category: 'system'     },
]

const BLOCKER_EVENTS = new Set(HOOK_EVENTS.filter(e => e.blocker).map(e => e.event))

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Hook {
  id: string
  name: string
  event: string
  command: string
  matcher: Record<string, unknown> | null
  enabled: boolean
  created_at: string
}

export interface FireResult {
  blocked: boolean
  reason?: string
}

// ─── HooksManager ─────────────────────────────────────────────────────────────

export class HooksManager {
  private readonly HOOK_TIMEOUT_MS = 30_000

  constructor(private readonly db: DatabaseClient) {}

  // ── Execution ──────────────────────────────────────────────────────────────

  async fire(event: string, context: Record<string, unknown> = {}): Promise<FireResult> {
    let hooks: Hook[]
    try {
      hooks = await this.db.query<Hook>(
        'SELECT * FROM hooks WHERE event = $1 AND enabled = true ORDER BY created_at ASC',
        [event]
      )
    } catch {
      return { blocked: false }
    }

    const isBlocker = BLOCKER_EVENTS.has(event)

    for (const hook of hooks) {
      if (!this.matchesContext(hook.matcher, context)) continue

      const exitCode = await this.runCommand(hook.command, event, context)

      if (isBlocker && exitCode !== 0) {
        return { blocked: true, reason: `Hook "${hook.name}" blocked event "${event}" (exit ${exitCode})` }
      }
    }

    return { blocked: false }
  }

  private matchesContext(matcher: Record<string, unknown> | null, context: Record<string, unknown>): boolean {
    if (!matcher) return true
    return Object.entries(matcher).every(([k, v]) => context[k] === v)
  }

  private runCommand(command: string, event: string, context: Record<string, unknown>): Promise<number> {
    return new Promise((resolve) => {
      const env: Record<string, string> = { ...process.env as Record<string, string> }
      env['AGENCY_EVENT'] = event
      for (const [k, v] of Object.entries(context)) {
        const key = `AGENCY_${k.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
        env[key] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      }

      let settled = false
      const child = spawn('bash', ['-c', command], {
        env,
        stdio: 'pipe',
        detached: false,
      })

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          try { child.kill('SIGTERM') } catch { /* ignore */ }
          resolve(1)
        }
      }, this.HOOK_TIMEOUT_MS)

      child.on('close', (code) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(code ?? 1)
        }
      })

      child.on('error', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(1)
        }
      })
    })
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async list(): Promise<Hook[]> {
    return this.db.query<Hook>('SELECT * FROM hooks ORDER BY created_at ASC')
  }

  async create(input: { name: string; event: string; command: string; matcher?: Record<string, unknown> | null; enabled?: boolean }): Promise<Hook> {
    const id = randomUUID()
    const { name, event, command, matcher = null, enabled = true } = input
    await this.db.execute(
      'INSERT INTO hooks (id, name, event, command, matcher, enabled) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, name, event, command, matcher ? JSON.stringify(matcher) : null, enabled]
    )
    const row = await this.db.queryOne<Hook>('SELECT * FROM hooks WHERE id = $1', [id])
    if (!row) throw new Error('Failed to create hook')
    return row
  }

  async update(id: string, patch: { name?: string; command?: string; matcher?: Record<string, unknown> | null; enabled?: boolean }): Promise<Hook> {
    const sets: string[] = []
    const values: unknown[] = []
    let i = 1

    if (patch.name !== undefined)    { sets.push(`name=$${i++}`);    values.push(patch.name) }
    if (patch.command !== undefined) { sets.push(`command=$${i++}`); values.push(patch.command) }
    if ('matcher' in patch)          { sets.push(`matcher=$${i++}`); values.push(patch.matcher ? JSON.stringify(patch.matcher) : null) }
    if (patch.enabled !== undefined) { sets.push(`enabled=$${i++}`); values.push(patch.enabled) }

    if (sets.length === 0) {
      const row = await this.db.queryOne<Hook>('SELECT * FROM hooks WHERE id = $1', [id])
      if (!row) throw new Error('Hook not found')
      return row
    }

    values.push(id)
    await this.db.execute(`UPDATE hooks SET ${sets.join(', ')} WHERE id = $${i}`, values)
    const row = await this.db.queryOne<Hook>('SELECT * FROM hooks WHERE id = $1', [id])
    if (!row) throw new Error('Hook not found')
    return row
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM hooks WHERE id = $1', [id])
  }
}
