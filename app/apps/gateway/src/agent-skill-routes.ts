// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '@agency/orchestrator/db'
import type { SkillsManager } from './skills-manager.js'
import type { AuditLogger } from './audit.js'
import type { HooksManager } from './hooks-manager.js'

export function registerAgentSkillRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  skillsManager: SkillsManager,
  auditLogger: AuditLogger,
  hooksManager?: HooksManager
): void {
  app.get('/agents/:slug/skills', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const agent = await db.queryOne<{ id: string }>('SELECT id FROM agent_identities WHERE slug = $1', [slug])
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    const skills = await skillsManager.listAgentSkills(agent.id)
    return { skills, total: skills.length }
  })

  app.post('/agents/:slug/skills/:name/enable', async (request, reply) => {
    const { slug, name } = request.params as { slug: string; name: string }
    const agent = await db.queryOne<{ id: string }>('SELECT id FROM agent_identities WHERE slug = $1', [slug])
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    try {
      await skillsManager.enableAgentSkill(agent.id, name)
    } catch (err) {
      const msg = (err as Error).message
      void hooksManager?.fire('skill.error', { skillName: name, error: msg })
      return reply.status(400).send({ error: msg })
    }
    void auditLogger.log({ action: 'agent_skill.enable', actor: 'user', targetType: 'agent_skill', targetId: `${slug}:${name}` })
    void hooksManager?.fire('skill.activated', { skillName: name, agentSlug: slug, agentId: agent.id })
    return { ok: true }
  })

  app.post('/agents/:slug/skills/:name/disable', async (request, reply) => {
    const { slug, name } = request.params as { slug: string; name: string }
    const agent = await db.queryOne<{ id: string }>('SELECT id FROM agent_identities WHERE slug = $1', [slug])
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    try {
      await skillsManager.disableAgentSkill(agent.id, name)
    } catch (err) {
      const msg = (err as Error).message
      void hooksManager?.fire('skill.error', { skillName: name, error: msg })
      return reply.status(400).send({ error: msg })
    }
    void auditLogger.log({ action: 'agent_skill.disable', actor: 'user', targetType: 'agent_skill', targetId: `${slug}:${name}` })
    void hooksManager?.fire('skill.deactivated', { skillName: name, agentSlug: slug, agentId: agent.id })
    return { ok: true }
  })
}
