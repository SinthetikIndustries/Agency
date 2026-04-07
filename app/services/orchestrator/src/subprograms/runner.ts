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

  async run(subprogramId: string): Promise<void> {
    const worker = WORKERS.find(w => w.id === subprogramId)
    if (!worker) throw new Error(`Unknown subprogram: ${subprogramId}`)

    const sp = await this.db.queryOne<{ enabled: boolean; config: Record<string, unknown> }>(
      'SELECT enabled, config FROM subprograms WHERE id = $1',
      [subprogramId]
    )
    if (!sp?.enabled) return

    await this.db.execute(
      "UPDATE subprograms SET status = 'running', updated_at = NOW() WHERE id = $1",
      [subprogramId]
    )

    try {
      // Redis is not yet wired into SubprogramRunner — LIFE and SENS don't need it.
      // Workers that require Redis (future: COMP, ANLY) will receive it once the runner
      // is updated to accept a redis client in its constructor.
      const ctx: SubprogramContext = { db: this.db, redis: null, config: sp.config }
      const result = await worker.run(ctx)

      await this.db.execute(
        `UPDATE subprograms
         SET status = $1, last_run_at = NOW(), run_count = run_count + 1,
             last_error = NULL, updated_at = NOW()
         WHERE id = $2`,
        [result.status === 'ok' ? 'idle' : 'error', subprogramId]
      )

      console.log(`[${subprogramId}] ${result.message} (${result.itemsProcessed} items)`)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await this.db.execute(
        "UPDATE subprograms SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2",
        [error, subprogramId]
      )
      console.error(`[${subprogramId}] Error:`, err)
    }
  }

  async scheduleAll(): Promise<void> {
    // Register each enabled worker in the scheduler
    for (const worker of WORKERS) {
      const sp = await this.db.queryOne<{ enabled: boolean }>(
        'SELECT enabled FROM subprograms WHERE id = $1', [worker.id]
      )
      if (sp?.enabled) {
        console.log(`[SubprogramRunner] Scheduled ${worker.id} (${worker.defaultSchedule})`)
      }
    }
  }
}

export { WORKERS }
