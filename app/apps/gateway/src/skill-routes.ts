// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { SkillsManager } from './skills-manager.js'
import type { AuditLogger } from './audit.js'
import type { HooksManager } from './hooks-manager.js'

export function registerSkillRoutes(
  app: FastifyInstance,
  skillsManager: SkillsManager,
  auditLogger: AuditLogger,
  hooksManager?: HooksManager
): void {
  app.post('/skills/:name/enable', async (request, reply) => {
    const { name } = request.params as { name: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    try {
      const skill = await skillsManager.enableSkill(name)
      void auditLogger.log({ action: 'skill.enable', actor: 'user', targetType: 'skill', targetId: name })
      hooksManager?.fire('skill.activated', { skillName: name }).catch(e => console.error('[Hooks] skill.activated fire failed:', e))
      return { ok: true, skill }
    } catch (err) {
      const msg = (err as Error).message
      hooksManager?.fire('skill.error', { skillName: name, error: msg }).catch(e => console.error('[Hooks] skill.error fire failed:', e))
      return reply.status(msg.includes('not installed') ? 404 : 400).send({ error: msg })
    }
  })

  app.post('/skills/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    try {
      const skill = await skillsManager.disableSkill(name)
      void auditLogger.log({ action: 'skill.disable', actor: 'user', targetType: 'skill', targetId: name })
      hooksManager?.fire('skill.deactivated', { skillName: name }).catch(e => console.error('[Hooks] skill.deactivated fire failed:', e))
      return { ok: true, skill }
    } catch (err) {
      const msg = (err as Error).message
      hooksManager?.fire('skill.error', { skillName: name, error: msg }).catch(e => console.error('[Hooks] skill.error fire failed:', e))
      return reply.status(msg.includes('not installed') ? 404 : 400).send({ error: msg })
    }
  })
}
