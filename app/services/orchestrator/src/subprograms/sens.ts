// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// SENS reads the audit_log and normalizes significant events into the Grid
// history structure by creating brain nodes for important events.

import type { SubprogramWorker, SubprogramContext, SubprogramResult } from './types.js'

export const SENS: SubprogramWorker = {
  id: 'SENS',
  defaultSchedule: '*/15 * * * *',  // every 15 minutes
  defaultEnabled: true,

  async run({ db }: SubprogramContext): Promise<SubprogramResult> {
    // Find audit log entries not yet processed by SENS.
    // Real audit_log columns: id, action, actor, target_type, target_id, details JSONB, created_at
    const unprocessed = await db.query<{
      id: string; actor: string; action: string; target_type: string;
      target_id: string | null; details: Record<string, unknown> | null; created_at: string
    }>(
      `SELECT id, actor, action, target_type, target_id, details, created_at
       FROM audit_log
       WHERE sens_processed = false
         AND created_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at ASC
       LIMIT 100`
    )

    let itemsProcessed = 0
    const eventsHistoryNode = await db.queryOne<{ id: string }>(
      `SELECT id FROM brain_nodes WHERE grid_path = 'GRID/HISTORY/events'`
    )

    for (const entry of unprocessed) {
      // Only create brain nodes for high-signal events
      const isHighSignal = ['agent.created', 'agent.deleted', 'approval.resolved',
        'profile.switched', 'canon.promoted', 'session.compacted'].includes(entry.action)

      if (isHighSignal && eventsHistoryNode) {
        const eventNode = await db.queryOne<{ id: string }>(
          `INSERT INTO brain_nodes
             (type, label, content, grid_path, grid_tier, confidence, source, metadata)
           VALUES ('fact', $1, $2, $3, 3, 0.8, 'sens', $4)
           RETURNING id`,
          [
            `${entry.action}: ${entry.target_type}/${entry.target_id ?? ''}`,
            `${entry.action} on ${entry.target_type} at ${entry.created_at}`,
            `GRID/HISTORY/events/${entry.id}`,
            entry.details ?? {},
          ]
        )
        if (eventNode) {
          await db.execute(
            `INSERT INTO brain_edges (from_id, to_id, type, weight, source)
             VALUES ($1, $2, 'contains', 0.5, 'sens')
             ON CONFLICT (from_id, to_id, type) DO NOTHING`,
            [eventsHistoryNode.id, eventNode.id]
          )
        }
      }

      // Mark as processed
      await db.execute(
        'UPDATE audit_log SET sens_processed = true WHERE id = $1',
        [entry.id]
      )
      itemsProcessed++
    }

    return {
      status: 'ok',
      itemsProcessed,
      message: `Processed ${itemsProcessed} audit events.`,
    }
  },
}
