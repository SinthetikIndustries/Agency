// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Redis } from 'ioredis'
import { Worker, type Job, Queue, QueueEvents } from 'bullmq'
import { loadConfig, loadCredentials } from '@agency/config'
import type { ToolJob, WorkerQueueName } from '@agency/shared-types'

export async function createRedisClient(): Promise<Redis> {
  const credentials = await loadCredentials()
  const config = await loadConfig()
  
  const redisUrl = credentials.redis?.url ?? config.redis.url
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null // Required by BullMQ
  })
}

export abstract class BaseWorker {
  protected worker?: Worker
  protected redis?: Redis

  constructor(
    public readonly queueName: WorkerQueueName,
    public readonly concurrency = 1
  ) {}

  protected abstract processJob(job: Job<ToolJob>): Promise<unknown>

  async start(): Promise<void> {
    this.redis = await createRedisClient()
    
    this.worker = new Worker<ToolJob>(
      this.queueName,
      async (job) => {
        return await this.processJob(job)
      },
      {
        connection: this.redis as any,
        concurrency: this.concurrency,
      }
    )

    this.worker.on('failed', (job, err) => {
      console.error(`[${this.queueName}] Job ${job?.id} failed:`, err)
    })

    console.log(`[${this.queueName}] Worker started`)
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close()
    }
    if (this.redis) {
      this.redis.disconnect()
    }
    console.log(`[${this.queueName}] Worker stopped`)
  }
}

// ─── Dispatch Helper ──────────────────────────────────────────────────────────

export class QueueClient {
  private redis?: Redis
  private queues: Map<string, Queue> = new Map()
  private events: Map<string, QueueEvents> = new Map()

  async init() {
    this.redis = await createRedisClient()
  }

  async close() {
    for (const q of this.queues.values()) await q.close()
    for (const e of this.events.values()) await e.close()
    if (this.redis) this.redis.disconnect()
  }

  private getQueue(name: string): Queue {
    if (!this.redis) throw new Error('QueueClient not initialized')
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection: this.redis as any }))
    }
    return this.queues.get(name)!
  }

  private getEvents(name: string): QueueEvents {
    if (!this.redis) throw new Error('QueueClient not initialized')
    if (!this.events.has(name)) {
      this.events.set(name, new QueueEvents(name, { connection: this.redis as any }))
    }
    return this.events.get(name)!
  }

  async getStats(names: string[]): Promise<Array<{ name: string; waiting: number; active: number; delayed: number; failed: number; completed: number }>> {
    return Promise.all(names.map(async name => {
      try {
        const q = this.getQueue(name)
        const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
        return { name, waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0, completed: counts.completed ?? 0 }
      } catch {
        return { name, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 }
      }
    }))
  }

  async getQueueWorkers(names: string[]): Promise<Array<{ queueName: string; token: string; addr: string }>> {
    const results: Array<{ queueName: string; token: string; addr: string }> = []
    for (const name of names) {
      try {
        const q = this.getQueue(name)
        const workers = await q.getWorkers()
        for (const w of workers) {
          results.push({ queueName: name, token: w.id ?? '', addr: w.addr ?? '' })
        }
      } catch { /* queue name may be unsupported, skip */ }
    }
    return results
  }

  async dispatchAndWait(queueName: WorkerQueueName, jobName: string, data: ToolJob): Promise<unknown> {
    const queue = this.getQueue(queueName)
    const events = this.getEvents(queueName)
    
    const job = await queue.add(jobName, data, {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: data.maxAttempts,
    })

    try {
      // Wait for completion via QueueEvents
      const result = await job.waitUntilFinished(events, data.timeout)
      return result
    } catch (err) {
      throw new Error(`Job execution failed: ${String(err)}`)
    }
  }
}
