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
    try {
      const skill = await skillsManager.enableSkill(name)
      void auditLogger.log({ action: 'skill.enable', actor: 'user', targetType: 'skill', targetId: name })
      void hooksManager?.fire('skill.activated', { skillName: name })
      return { ok: true, skill }
    } catch (err) {
      const msg = (err as Error).message
      void hooksManager?.fire('skill.error', { skillName: name, error: msg })
      return reply.status(msg.includes('not installed') ? 404 : 400).send({ error: msg })
    }
  })

  app.post('/skills/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      const skill = await skillsManager.disableSkill(name)
      void auditLogger.log({ action: 'skill.disable', actor: 'user', targetType: 'skill', targetId: name })
      void hooksManager?.fire('skill.deactivated', { skillName: name })
      return { ok: true, skill }
    } catch (err) {
      const msg = (err as Error).message
      void hooksManager?.fire('skill.error', { skillName: name, error: msg })
      return reply.status(msg.includes('not installed') ? 404 : 400).send({ error: msg })
    }
  })
}
