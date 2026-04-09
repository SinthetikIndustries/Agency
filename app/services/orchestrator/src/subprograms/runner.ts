// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { DatabaseClient } from '../db.js'
import type { SubprogramWorker, SubprogramContext } from './types.js'
import { MON } from './mon.js'
import { LIFE } from './life.js'
import { SENS } from './sens.js'

const WORKERS: SubprogramWorker[] = [MON, LIFE, SENS]

export class SubprogramRunner {
  constructor(private readonly db: DatabaseClient) {}

  async run(workerId: string): Promise<void> {
    const worker = WORKERS.find(w => w.id === workerId)
    if (!worker) throw new Error(`Unknown worker: ${workerId}`)

    const row = await this.db.queryOne<{ schedule_enabled: boolean }>(
      'SELECT schedule_enabled FROM agent_identities WHERE id = $1',
      [workerId]
    )
    if (!row?.schedule_enabled) return

    await this.db.execute(
      "UPDATE agent_identities SET updated_at = NOW() WHERE id = $1",
      [workerId]
    )

    try {
      const ctx: SubprogramContext = { db: this.db, redis: null, config: {} }
      const result = await worker.run(ctx)

      await this.db.execute(
        `UPDATE agent_identities
         SET last_run_at = NOW(), run_count = run_count + 1, last_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [workerId]
      )

      console.log(`[${workerId}] ${result.message} (${result.itemsProcessed} items)`)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await this.db.execute(
        'UPDATE agent_identities SET last_error = $1, updated_at = NOW() WHERE id = $2',
        [error, workerId]
      )
      console.error(`[${workerId}] Error:`, err)
    }
  }

  async scheduleAll(): Promise<void> {
    for (const worker of WORKERS) {
      const row = await this.db.queryOne<{ schedule_enabled: boolean }>(
        'SELECT schedule_enabled FROM agent_identities WHERE id = $1',
        [worker.id]
      )
      if (row?.schedule_enabled) {
        console.log(`[SubprogramRunner] Scheduled ${worker.id} (${worker.defaultSchedule})`)
      }
    }
  }
}

export { WORKERS }
