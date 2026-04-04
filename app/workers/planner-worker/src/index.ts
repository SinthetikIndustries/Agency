// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { BaseWorker } from '@agency/shared-worker'
import type { ToolJob } from '@agency/shared-types'
import type { Job } from 'bullmq'
import { ModelRouter } from '@agency/model-router'
import { loadConfig, loadCredentials } from '@agency/config'

class PlannerWorker extends BaseWorker {
  private modelRouter?: ModelRouter

  constructor() {
    super('queue:planner', 3)
  }

  async start(): Promise<void> {
    const config = await loadConfig()
    const credentials = await loadCredentials()
    this.modelRouter = new ModelRouter(config.modelRouter, credentials)
    await super.start()
  }

  protected async processJob(job: Job<ToolJob>): Promise<unknown> {
    const { toolName, input, context } = job.data
    
    if (!this.modelRouter) throw new Error('Model router not initialized')
    
    console.log(`[Planner Worker] Processing job ${job.id} for tool ${toolName}`)
    throw new Error(`PlannerWorker: tool "${toolName}" is not yet implemented`)
  }
}

const worker = new PlannerWorker()

worker.start().catch((err) => {
  console.error('[PlannerWorker] Fatal error starting worker:', err)
  process.exit(1)
})

process.on('SIGTERM', () => void worker.stop().then(() => process.exit(0)))
process.on('SIGINT', () => void worker.stop().then(() => process.exit(0)))
