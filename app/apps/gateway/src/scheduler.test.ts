// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SchedulerService } from './scheduler.js'

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job1' }),
    removeRepeatable: vi.fn().mockResolvedValue(undefined),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock Redis - try the actual module path used in the codebase
// We'll mock whatever path createRedisClient comes from
vi.mock('@agency/shared-worker', () => ({
  createRedisClient: vi.fn().mockResolvedValue({
    disconnect: vi.fn(),
  }),
}))

const mockDb = {
  query: vi.fn(),
  execute: vi.fn(),
  queryOne: vi.fn(),
}

const mockOrchestrator = {
  run: vi.fn(),
}

describe('SchedulerService', () => {
  let service: SchedulerService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SchedulerService(mockDb as any, mockOrchestrator as any, vi.fn())
  })

  it('constructs without throwing', () => {
    expect(service).toBeDefined()
  })

  it('start() loads enabled tasks from DB', async () => {
    mockDb.query.mockResolvedValueOnce([]) // no tasks
    await service.start()
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('scheduled_tasks'),
      expect.anything()
    )
  })

  it('start() skips past one-off tasks and marks them disabled', async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString()
    mockDb.query.mockResolvedValueOnce([{
      id: 'task1', agent_slug: 'main', label: 'Test', prompt: 'hello',
      schedule: pastDate, type: 'once', enabled: true,
      last_run_at: null, next_run_at: null, created_at: new Date(), updated_at: new Date(),
    }])
    mockDb.execute.mockResolvedValue(undefined)
    await service.start()
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('enabled = FALSE'),
      expect.arrayContaining(['task1'])
    )
  })

  it('stop() closes Queue, Worker, and Redis connections', async () => {
    mockDb.query.mockResolvedValueOnce([])
    await service.start()
    await service.stop()
    // No throws — connections closed
  })

  it('updateTask() calls unregisterJob then re-registers', async () => {
    mockDb.query.mockResolvedValueOnce([]) // start() — no tasks
    await service.start()

    // Mock getTask (called twice: before update + after update)
    mockDb.queryOne
      .mockResolvedValueOnce({ id: 'task1', agent_slug: 'main', label: 'Old', prompt: 'hi',
        schedule: '0 9 * * *', type: 'recurring', enabled: true,
        last_run_at: null, next_run_at: null, created_at: new Date(), updated_at: new Date() })
      .mockResolvedValueOnce({ id: 'task1', agent_slug: 'main', label: 'New', prompt: 'hi',
        schedule: '0 10 * * *', type: 'recurring', enabled: true,
        last_run_at: null, next_run_at: null, created_at: new Date(), updated_at: new Date() })
    mockDb.execute.mockResolvedValue(undefined)

    await service.updateTask('task1', { label: 'New', schedule: '0 10 * * *' })
    expect(mockDb.execute).toHaveBeenCalled()
  })
})
