// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'bullmq'
import { createRedisClient } from '@agency/shared-worker'
import { parseSchedule, computeNextRun } from './schedule-parser.js'

const QUEUE_NAME = 'scheduled'

export interface ScheduledTask {
  id: string
  agentSlug: string
  label: string
  prompt: string
  schedule: string
  type: 'recurring' | 'once'
  enabled: boolean
  lastRunAt?: Date
  nextRunAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface ScheduledRun {
  id: string
  taskId: string
  sessionId: string | null
  status: 'running' | 'completed' | 'failed'
  error?: string
  startedAt: Date
  finishedAt?: Date
}

interface JobData {
  taskId: string
}

// Use structural types to avoid complex import chains
type DbClient = {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<void>
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
}

type OrchestratorLike = {
  run(session: any, prompt: string, tools: any[], context: any): AsyncGenerator<any>
}

export class SchedulerService {
  private queue?: Queue
  private worker?: Worker
  private queueRedis?: { disconnect: () => void }
  private workerRedis?: { disconnect: () => void }

  constructor(
    private readonly db: DbClient,
    private readonly orchestrator: OrchestratorLike,
    private readonly log: (level: string, msg: string) => void,
    private readonly fireHook: (event: string, context: Record<string, unknown>) => void = () => { /* no-op */ }
  ) {}

  async start(): Promise<void> {
    try {
      this.queueRedis = await createRedisClient()
      this.workerRedis = await createRedisClient()

      this.queue = new Queue(QUEUE_NAME, { connection: this.queueRedis as never })

      this.worker = new Worker<JobData>(
        QUEUE_NAME,
        (job) => this.executeJob(job),
        { connection: this.workerRedis as never, concurrency: 3 }
      )

      this.worker.on('failed', (job: any, err: unknown) => {
        this.log('error', `[Scheduler] Job ${String(job?.id)} failed: ${String(err)}`)
        this.fireHook('worker.job.failed', { jobId: String(job?.id ?? ''), error: String(err) })
      })

      this.worker.on('completed', (job: any) => {
        this.fireHook('worker.job.completed', { jobId: String(job?.id ?? '') })
      })

      this.worker.on('active', (job: any) => {
        this.fireHook('worker.job.started', { jobId: String(job?.id ?? '') })
      })

      this.worker.on('stalled', (jobId: string) => {
        this.fireHook('queue.stalled', { jobId })
      })

      this.worker.on('error', (err: Error) => {
        this.fireHook('worker.job.retrying', { queue: QUEUE_NAME, error: err.message })
      })

      this.fireHook('worker.started', { queue: QUEUE_NAME })

      const rows = await this.db.query<Record<string, unknown>>(
        `SELECT * FROM scheduled_tasks WHERE enabled = TRUE`,
        []
      )

      for (const row of rows) {
        const task = this.rowToTask(row)
        await this.registerJob(task)
      }

      this.log('info', `[Scheduler] Started — registered ${rows.length} task(s)`)
    } catch (err) {
      this.log('warn', `[Scheduler] Failed to start (Redis unavailable?): ${String(err)}`)
    }
  }

  async stop(): Promise<void> {
    if (this.worker) await this.worker.close()
    if (this.queue) await this.queue.close()
    if (this.workerRedis) this.workerRedis.disconnect()
    if (this.queueRedis) this.queueRedis.disconnect()
    this.fireHook('worker.stopped', { queue: QUEUE_NAME })
    this.log('info', '[Scheduler] Stopped')
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async createTask(input: {
    agentSlug: string
    label: string
    prompt: string
    schedule: string
    type: 'recurring' | 'once'
  }): Promise<ScheduledTask> {
    const parsed = parseSchedule(input.schedule, input.type)
    const nextRunAt = computeNextRun(parsed.schedule, parsed.type)
    const id = randomUUID()

    await this.db.execute(
      `INSERT INTO scheduled_tasks (id, agent_slug, label, prompt, schedule, type, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.agentSlug, input.label, input.prompt, parsed.schedule, parsed.type, nextRunAt]
    )

    const task = await this.getTask(id)
    if (!task) throw new Error('Task not found after insert')
    await this.registerJob(task)
    return task
  }

  async updateTask(id: string, patch: {
    label?: string
    prompt?: string
    schedule?: string
    type?: 'recurring' | 'once'
    enabled?: boolean
  }): Promise<ScheduledTask> {
    const existing = await this.getTask(id)
    if (!existing) throw new Error(`Scheduled task not found: ${id}`)

    await this.unregisterJob(existing)

    const newSchedule = patch.schedule
      ? parseSchedule(patch.schedule, patch.type ?? existing.type).schedule
      : existing.schedule
    const newType = patch.type ?? existing.type
    // Only recompute nextRunAt if schedule or type changed
    const nextRunAt = (patch.schedule || patch.type)
      ? computeNextRun(newSchedule, newType)
      : existing.nextRunAt ?? null

    await this.db.execute(
      `UPDATE scheduled_tasks SET
        label = COALESCE($2, label),
        prompt = COALESCE($3, prompt),
        schedule = $4,
        type = $5,
        enabled = COALESCE($6, enabled),
        next_run_at = $7,
        updated_at = NOW()
       WHERE id = $1`,
      [id, patch.label ?? null, patch.prompt ?? null, newSchedule, newType,
       patch.enabled ?? null, nextRunAt]
    )

    const updated = await this.getTask(id)
    if (!updated) throw new Error('Task not found after update')
    if (updated.enabled) await this.registerJob(updated)
    return updated
  }

  async deleteTask(id: string): Promise<void> {
    const task = await this.getTask(id)
    if (task) await this.unregisterJob(task)
    await this.db.execute(`DELETE FROM scheduled_tasks WHERE id = $1`, [id])
  }

  async listTasks(agentSlug?: string, limit = 200): Promise<ScheduledTask[]> {
    const rows = agentSlug
      ? await this.db.query<Record<string, unknown>>(
          `SELECT * FROM scheduled_tasks WHERE agent_slug = $1 ORDER BY created_at DESC LIMIT $2`,
          [agentSlug, limit]
        )
      : await this.db.query<Record<string, unknown>>(
          `SELECT * FROM scheduled_tasks ORDER BY created_at DESC LIMIT $1`,
          [limit]
        )
    return rows.map(r => this.rowToTask(r))
  }

  async getTask(id: string): Promise<ScheduledTask | null> {
    const row = await this.db.queryOne<Record<string, unknown>>(
      `SELECT * FROM scheduled_tasks WHERE id = $1`, [id]
    )
    return row ? this.rowToTask(row) : null
  }

  async listRuns(taskId: string, limit = 20): Promise<ScheduledRun[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM scheduled_runs WHERE task_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [taskId, limit]
    )
    return rows.map(r => this.rowToRun(r))
  }

  // ─── BullMQ Registration ───────────────────────────────────────────────────

  private async registerJob(task: ScheduledTask): Promise<void> {
    if (!this.queue) return

    if (task.type === 'once') {
      const target = new Date(task.schedule)
      const now = Date.now()
      if (target.getTime() <= now) {
        await this.db.execute(
          `UPDATE scheduled_tasks SET enabled = FALSE, updated_at = NOW() WHERE id = $1`,
          [task.id]
        )
        return
      }
      const delay = target.getTime() - now
      await this.queue.add(`scheduled:${task.id}`, { taskId: task.id }, {
        delay,
        jobId: `scheduled:${task.id}`,
        removeOnComplete: true,
        removeOnFail: false,
      })
    } else {
      await this.queue.add(`scheduled:${task.id}`, { taskId: task.id }, {
        repeat: { pattern: task.schedule },
        jobId: `scheduled:${task.id}`,
        removeOnComplete: true,
        removeOnFail: false,
      })
    }
  }

  private async unregisterJob(task: ScheduledTask): Promise<void> {
    if (!this.queue) return
    try {
      if (task.type === 'recurring') {
        await this.queue.removeRepeatable(
          `scheduled:${task.id}`,
          { pattern: task.schedule }
        )
      } else {
        const job = await this.queue.getJob(`scheduled:${task.id}`)
        if (job) await (job as any).remove()
      }
    } catch {
      // Job may not exist in BullMQ — that's fine
    }
  }

  // ─── Job Execution ─────────────────────────────────────────────────────────

  private async executeJob(job: Job<JobData>): Promise<void> {
    const { taskId } = job.data
    const task = await this.getTask(taskId)
    if (!task) {
      this.log('warn', `[Scheduler] Task not found for job: ${taskId}`)
      return
    }

    const sessionId = randomUUID()
    const agentIdentity = await this.db.queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM agent_identities WHERE slug = $1`,
      [task.agentSlug]
    )
    if (!agentIdentity) {
      this.log('error', `[Scheduler] Agent not found: ${task.agentSlug}`)
      return
    }

    await this.db.execute(
      `INSERT INTO sessions (id, agent_id, client, status) VALUES ($1, $2, 'scheduled', 'active')`,
      [sessionId, agentIdentity.id]
    )

    const runId = randomUUID()
    await this.db.execute(
      `INSERT INTO scheduled_runs (id, task_id, session_id, status) VALUES ($1, $2, $3, 'running')`,
      [runId, taskId, sessionId]
    )

    this.fireHook('schedule.fired', { taskId, runId, agentSlug: task.agentSlug, sessionId })

    try {
      const session: any = {
        id: sessionId,
        agentId: agentIdentity.id,
        client: 'scheduled',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await this.db.execute(
        `INSERT INTO messages (id, session_id, role, content) VALUES ($1, $2, 'user', $3)`,
        [randomUUID(), sessionId, task.prompt]
      )

      // Load existing messages for this session so the agent has conversation context
      const rawMessages = await this.db.query<Record<string, string>>(
        'SELECT id, session_id, role, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
        [sessionId]
      )
      const messages = rawMessages.map(m => ({
        id: m['id']!,
        sessionId: m['session_id']!,
        role: m['role'] as 'user' | 'assistant',
        content: m['content']!,
        createdAt: new Date(m['created_at']!),
      }))

      let fullResponse = ''
      for await (const chunk of this.orchestrator.run(session, task.prompt, messages as never, undefined)) {
        if (chunk.type === 'text') fullResponse += chunk.text
      }

      await this.db.execute(
        `INSERT INTO messages (id, session_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
        [randomUUID(), sessionId, fullResponse]
      )

      await this.db.execute(
        `UPDATE scheduled_runs SET status = 'completed', finished_at = NOW() WHERE id = $1`,
        [runId]
      )
      await this.db.execute(
        `UPDATE sessions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [sessionId]
      )
      this.fireHook('schedule.complete', { taskId, runId, agentSlug: task.agentSlug, sessionId })
    } catch (err) {
      const errMsg = String(err)
      await this.db.execute(
        `UPDATE scheduled_runs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`,
        [runId, errMsg]
      )
      await this.db.execute(
        `UPDATE sessions SET status = 'error', updated_at = NOW() WHERE id = $1`,
        [sessionId]
      )
      this.fireHook('schedule.failed', { taskId, runId, agentSlug: task.agentSlug, sessionId, error: errMsg })
      this.log('error', `[Scheduler] Task ${taskId} failed: ${errMsg}`)
    }

    try {
      const nextRunAt = task.type === 'once' ? null : computeNextRun(task.schedule, task.type)
      if (task.type === 'once') {
        await this.db.execute(
          `UPDATE scheduled_tasks SET last_run_at = NOW(), next_run_at = $2, enabled = FALSE, updated_at = NOW() WHERE id = $1`,
          [taskId, nextRunAt]
        )
      } else {
        await this.db.execute(
          `UPDATE scheduled_tasks SET last_run_at = NOW(), next_run_at = $2, updated_at = NOW() WHERE id = $1`,
          [taskId, nextRunAt]
        )
      }
    } catch (updateErr) {
      this.log('warn', `[Scheduler] Failed to update task timestamps for ${taskId}: ${String(updateErr)}`)
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private rowToTask(row: Record<string, unknown>): ScheduledTask {
    return {
      id: row['id'] as string,
      agentSlug: row['agent_slug'] as string,
      label: row['label'] as string,
      prompt: row['prompt'] as string,
      schedule: row['schedule'] as string,
      type: row['type'] as 'recurring' | 'once',
      enabled: row['enabled'] as boolean,
      ...(row['last_run_at'] ? { lastRunAt: new Date(row['last_run_at'] as string) } : {}),
      ...(row['next_run_at'] ? { nextRunAt: new Date(row['next_run_at'] as string) } : {}),
      createdAt: new Date(row['created_at'] as string),
      updatedAt: new Date(row['updated_at'] as string),
    }
  }

  private rowToRun(row: Record<string, unknown>): ScheduledRun {
    return {
      id: row['id'] as string,
      taskId: row['task_id'] as string,
      sessionId: (row['session_id'] as string | null) ?? null,
      status: row['status'] as 'running' | 'completed' | 'failed',
      ...(row['error'] != null ? { error: row['error'] as string } : {}),
      startedAt: new Date(row['started_at'] as string),
      ...(row['finished_at'] ? { finishedAt: new Date(row['finished_at'] as string) } : {}),
    }
  }
}
