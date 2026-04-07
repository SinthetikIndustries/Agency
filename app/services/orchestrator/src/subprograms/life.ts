// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { SubprogramWorker, SubprogramContext, SubprogramResult } from './types.js'

export const LIFE: SubprogramWorker = {
  id: 'LIFE',
  defaultSchedule: '0 * * * *',  // every hour
  defaultEnabled: true,

  async run({ db }: SubprogramContext): Promise<SubprogramResult> {
    let itemsProcessed = 0

    // 1. Archive expired memory entries (expires_at passed, not yet archived)
    const expired = await db.query<{ id: string }>(
      `UPDATE memory_entries
       SET memory_status = 'archived', updated_at = NOW()
       WHERE expires_at IS NOT NULL
         AND expires_at < NOW()
         AND memory_status NOT IN ('archived','deprecated')
       RETURNING id`,
    )
    itemsProcessed += expired.length

    // 2. Archive deprecated memories older than 30 days
    const oldDeprecated = await db.query<{ id: string }>(
      `UPDATE memory_entries
       SET memory_status = 'archived', updated_at = NOW()
       WHERE memory_status = 'deprecated'
         AND updated_at < NOW() - INTERVAL '30 days'
       RETURNING id`,
    )
    itemsProcessed += oldDeprecated.length

    // NOTE: sessions archival is intentionally excluded.
    // The sessions table has no 'archived' status value and no updated_at column.
    // Session lifecycle is managed by the gateway — LIFE does not touch sessions.

    return {
      status: 'ok',
      itemsProcessed,
      message: `Archived ${itemsProcessed} items (expired memory, deprecated memory).`,
    }
  },
}
