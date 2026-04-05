// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '@agency/orchestrator/db'

export type AuditAction =
  | 'agent.create'
  | 'agent.delete'
  | 'agent.enable'
  | 'agent.disable'
  | 'agent.profile_switch'
  | 'agent.context_edit'
  | 'agent.workspace_add'
  | 'agent.workspace_remove'
  | 'profile.create'
  | 'approval.create'
  | 'approval.approve'
  | 'approval.reject'
  | 'skill.install'
  | 'skill.remove'
  | 'skill.update'
  | 'skill.enable'
  | 'skill.disable'
  | 'agent_skill.enable'
  | 'agent_skill.disable'
  | 'tool.enable'
  | 'tool.disable'
  | 'mcp.server.add'
  | 'mcp.server.remove'
  | 'mcp.server.enable'
  | 'mcp.server.disable'
  | 'agent_mcp.enable'
  | 'agent_mcp.disable'
  | 'session.create'
  | 'session.end'
  | 'connector.enable'
  | 'connector.disable'
  | 'connector.message'
  | 'vault.sync'
  | 'auth.login'
  | 'auth.logout'
  | 'group.create'
  | 'group.update'
  | 'group.delete'
  | 'group.member_add'
  | 'group.member_remove'

interface AuditEntry {
  action: AuditAction
  actor: string
  targetType?: string
  targetId?: string
  details?: Record<string, unknown>
}

export class AuditLogger {
  constructor(private readonly db: DatabaseClient) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.db.execute(
        `INSERT INTO audit_log (id, action, actor, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          randomUUID(),
          entry.action,
          entry.actor,
          entry.targetType ?? null,
          entry.targetId ?? null,
          JSON.stringify(entry.details ?? {}),
        ]
      )
    } catch (err) {
      // Audit log failures must never crash the main flow
      console.error('[AuditLogger] Failed to write audit entry:', err)
    }
  }

  async query(options: {
    action?: AuditAction
    actor?: string
    targetType?: string
    targetId?: string
    limit?: number
    offset?: number
  } = {}): Promise<AuditLogRow[]> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (options.action) {
      params.push(options.action)
      conditions.push(`action = $${params.length}`)
    }
    if (options.actor) {
      params.push(options.actor)
      conditions.push(`actor = $${params.length}`)
    }
    if (options.targetType) {
      params.push(options.targetType)
      conditions.push(`target_type = $${params.length}`)
    }
    if (options.targetId) {
      params.push(options.targetId)
      conditions.push(`target_id = $${params.length}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(options.limit ?? 100)
    const limitIdx = params.length
    params.push(options.offset ?? 0)
    const offsetIdx = params.length

    return this.db.query<AuditLogRow>(
      `SELECT id, action, actor, target_type, target_id, details, created_at
       FROM audit_log
       ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    )
  }
}

export interface AuditLogRow {
  id: string
  action: string
  actor: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  created_at: string
}
