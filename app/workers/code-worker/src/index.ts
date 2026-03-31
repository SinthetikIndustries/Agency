// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { BaseWorker } from '@agency/shared-worker'
import { ToolHandlers } from '@agency/tool-registry'
import type { ToolJob } from '@agency/shared-types'
import type { Job } from 'bullmq'

class CodeWorker extends BaseWorker {
  constructor() {
    super('queue:code', 3) // Concurrency of 3 for code execution
  }

  protected async processJob(job: Job<ToolJob>): Promise<unknown> {
    const { toolName, input, context } = job.data
    
    // We process code_run_python and code_run_javascript here
    if (toolName !== 'code_run_python' && toolName !== 'code_run_javascript') {
      throw new Error(`Code worker cannot handle tool: ${toolName}`)
    }

    const handler = ToolHandlers[toolName as keyof typeof ToolHandlers]
    if (!handler) {
        throw new Error(`Handler for ${toolName} not found in registry`)
    }

    return await handler(input, context)
  }
}

const worker = new CodeWorker()

worker.start().catch((err) => {
  console.error('[CodeWorker] Fatal error starting worker:', err)
  process.exit(1)
})

process.on('SIGTERM', () => void worker.stop().then(() => process.exit(0)))
process.on('SIGINT', () => void worker.stop().then(() => process.exit(0)))
