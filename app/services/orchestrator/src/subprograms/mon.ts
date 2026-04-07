// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { SubprogramWorker, SubprogramContext, SubprogramResult } from './types.js'

export const MON: SubprogramWorker = {
  id: 'MON',
  defaultSchedule: '*/5 * * * *',  // every 5 minutes
  defaultEnabled: true,

  async run({ db }: SubprogramContext): Promise<SubprogramResult> {
    const [agentCount, activeSessionCount, pendingApprovalCount, memoryCount] = await Promise.all([
      db.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM agent_identities WHERE status = $1', ['active']),
      db.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM sessions WHERE status = $1', ['active']),
      db.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM approvals WHERE status = $1', ['pending']),
      db.queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM memory_entries WHERE memory_status = $1', ['active']),
    ])

    const report = {
      active_agents: agentCount?.count ?? 0,
      active_sessions: activeSessionCount?.count ?? 0,
      pending_approvals: pendingApprovalCount?.count ?? 0,
      active_memories: memoryCount?.count ?? 0,
      checked_at: new Date().toISOString(),
    }

    // Update MON brain node with current health snapshot
    await db.execute(
      `UPDATE brain_nodes
       SET content = $1, metadata = $2, updated_at = NOW()
       WHERE grid_path = 'GRID/SYSTEM/subprograms/MON'`,
      [
        `MON health snapshot: ${report.active_agents} agents, ${report.active_sessions} sessions, ${report.pending_approvals} pending approvals.`,
        report,
      ]
    )

    return {
      status: 'ok',
      itemsProcessed: 1,
      message: `Health check complete. ${report.active_agents} agents active, ${report.pending_approvals} approvals pending.`,
      details: report,
    }
  },
}
