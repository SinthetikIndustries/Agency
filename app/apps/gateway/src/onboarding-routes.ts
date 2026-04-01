// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { FastifyInstance } from 'fastify'
import { promises as fs } from 'fs'
import { join } from 'path'
import { agencyDir } from '@agency/config'

const AUTONOMY_MAP: Record<string, string> = {
  supervised: 'all',
  balanced: 'auto',
  autonomous: 'none',
}

interface OnboardingBody {
  name: string
  nickname?: string
  sex: string
  timezone: string
  country: string
  state: string
  city: string
  role: string
  autonomy: string
  goals: string
}

export function registerOnboardingRoutes(app: FastifyInstance) {
  const VALID_AUTONOMY = ['supervised', 'balanced', 'autonomous']

  app.post<{ Body: OnboardingBody }>('/onboarding', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'sex', 'timezone', 'country', 'state', 'city', 'role', 'autonomy', 'goals'],
        properties: {
          name:     { type: 'string' },
          nickname: { type: 'string' },
          sex:      { type: 'string' },
          timezone: { type: 'string' },
          country:  { type: 'string' },
          state:    { type: 'string' },
          city:     { type: 'string' },
          role:     { type: 'string' },
          autonomy: { type: 'string' },
          goals:    { type: 'string' },
        }
      }
    }
  }, async (request, reply) => {
    const { name, nickname, sex, timezone, country, state, city, role, autonomy, goals } = request.body

    if (!name?.trim()) {
      return reply.status(400).send({ error: 'name is required' })
    }

    if (!VALID_AUTONOMY.includes(autonomy?.toLowerCase())) {
      return reply.status(400).send({ error: 'autonomy must be supervised, balanced, or autonomous' })
    }

    const configPath = join(agencyDir, 'config.json')
    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(await fs.readFile(configPath, 'utf8'))
    } catch { /* start fresh */ }

    config.name = name.trim()
    config.firstRun = false
    config.onboarding = { nickname: nickname?.trim() ?? '', sex, timezone, country, state, city, role, autonomy, goals }

    // Map autonomy to approvalMode on main agent config if present
    const approvalMode = AUTONOMY_MAP[autonomy.toLowerCase()] ?? 'auto'
    if (config.agents && typeof config.agents === 'object') {
      const agents = config.agents as Record<string, Record<string, unknown>>
      if (agents.main) agents.main.approvalMode = approvalMode
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')

    return { ok: true }
  })
}
