// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { SchedulerService } from './scheduler.js'
import type { HooksManager } from './hooks-manager.js'
import { toHumanReadable } from './schedule-parser.js'

export function registerSchedulerRoutes(
  app: FastifyInstance,
  scheduler: SchedulerService,
  getAgent: (slug: string) => unknown,
  hooksManager?: HooksManager
): void {

  // GET /schedules?agentSlug=&limit=
  app.get('/schedules', async (request, reply) => {
    const { agentSlug, limit } = request.query as { agentSlug?: string; limit?: string }
    const parsedLimit = limit ? parseInt(limit, 10) : 200
    const tasks = await scheduler.listTasks(agentSlug, isNaN(parsedLimit) ? 200 : parsedLimit)
    return {
      tasks: tasks.map(t => ({
        ...t,
        humanReadableSchedule: toHumanReadable(t.schedule, t.type),
      })),
    }
  })

  // POST /schedules
  app.post('/schedules', async (request, reply) => {
    const body = request.body as {
      agentSlug: string
      label: string
      prompt: string
      schedule: string
      type: 'recurring' | 'once'
    }
    if (!body?.agentSlug || !body?.label || !body?.prompt || !body?.schedule || !body?.type) {
      return reply.status(400).send({ error: 'agentSlug, label, prompt, schedule, and type are required' })
    }
    const agent = getAgent(body.agentSlug)
    if (agent === null || agent === undefined) {
      return reply.status(404).send({ error: `Agent "${body.agentSlug}" not found` })
    }
    try {
      const task = await scheduler.createTask(body)
      void hooksManager?.fire('schedule.created', { taskId: task.id, agentSlug: body.agentSlug, schedule: task.schedule })
      return { task: { ...task, humanReadableSchedule: toHumanReadable(task.schedule, task.type) } }
    } catch (err) {
      return reply.status(400).send({ error: String(err) })
    }
  })

  // PATCH /schedules/:id
  app.patch('/schedules/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      label?: string
      prompt?: string
      schedule?: string
      type?: 'recurring' | 'once'
      enabled?: boolean
    }
    try {
      const task = await scheduler.updateTask(id, body)
      if (body.enabled === true) void hooksManager?.fire('schedule.resumed', { taskId: id })
      else if (body.enabled === false) void hooksManager?.fire('schedule.paused', { taskId: id })
      return { task: { ...task, humanReadableSchedule: toHumanReadable(task.schedule, task.type) } }
    } catch (err) {
      const msg = String(err)
      if (msg.includes('not found')) return reply.status(404).send({ error: msg })
      return reply.status(400).send({ error: msg })
    }
  })

  // DELETE /schedules/:id
  app.delete('/schedules/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await scheduler.deleteTask(id)
    void hooksManager?.fire('schedule.deleted', { taskId: id })
    return reply.status(204).send()
  })

  // GET /schedules/:id/runs?limit=
  app.get('/schedules/:id/runs', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit } = request.query as { limit?: string }
    const parsedLimit = limit ? parseInt(limit, 10) : 20
    const runs = await scheduler.listRuns(id, isNaN(parsedLimit) ? 20 : parsedLimit)
    return { runs }
  })
}
