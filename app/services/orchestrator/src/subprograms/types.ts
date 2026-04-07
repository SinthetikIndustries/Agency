// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { DatabaseClient } from '../db.js'

export interface SubprogramContext {
  db: DatabaseClient
  redis: unknown | null  // RedisClient — typed loosely until a shared Redis type is defined
  config: Record<string, unknown>
}

export interface SubprogramResult {
  status: 'ok' | 'error' | 'skipped'
  itemsProcessed: number
  message: string
  details?: Record<string, unknown>
}

export interface SubprogramWorker {
  id: string
  run(ctx: SubprogramContext): Promise<SubprogramResult>
  defaultSchedule: string  // cron expression
  defaultEnabled: boolean
}
