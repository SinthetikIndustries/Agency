// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { BaseWorker } from '@agency/shared-worker'
import { ToolHandlers } from '@agency/tool-registry'
import type { ToolJob } from '@agency/shared-types'
import type { Job } from 'bullmq'

class ShellWorker extends BaseWorker {
  constructor() {
    super('queue:shell', 5) // Concurrency of 5 for shell commands
  }

  protected async processJob(job: Job<ToolJob>): Promise<unknown> {
    const { toolName, input, context } = job.data
    
    // We only process shell_run here
    if (toolName !== 'shell_run') {
      throw new Error(`Shell worker cannot handle tool: ${toolName}`)
    }

    // Call the same handler from tool-registry, but it's executed in this container
    const handler = ToolHandlers['shell_run']
    if (!handler) {
        throw new Error(`Handler for shell_run not found in registry`)
    }

    return await handler(input, context)
  }
}

const worker = new ShellWorker()

worker.start().catch((err) => {
  console.error('[ShellWorker] Fatal error starting worker:', err)
  process.exit(1)
})

process.on('SIGTERM', () => void worker.stop().then(() => process.exit(0)))
process.on('SIGINT', () => void worker.stop().then(() => process.exit(0)))
