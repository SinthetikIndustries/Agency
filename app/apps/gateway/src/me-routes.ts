// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { FastifyInstance } from 'fastify'
import { promises as fs } from 'fs'
import { join } from 'path'
import { userInfo } from 'os'
import { agencyDir } from '@agency/config'

const NAME_PLACEHOLDER = '[Unknown — update this as I learn]'

async function getAgentUserMdName(): Promise<string> {
  try {
    const userMd = await fs.readFile(join(agencyDir, 'agents', 'main', 'config', 'user.md'), 'utf8')
    const match = userMd.match(/\*\*Name:\*\*\s*(.+)/)
    const name = match?.[1]?.trim() ?? ''
    return name && name !== NAME_PLACEHOLDER ? name : ''
  } catch {
    return ''
  }
}

export function registerMeRoutes(app: FastifyInstance) {
  app.get('/me', async (request, reply) => {
    let config: Record<string, unknown> = {}
    try {
      const raw = await fs.readFile(join(agencyDir, 'config.json'), 'utf8')
      config = JSON.parse(raw)
    } catch {
      // config unreadable → treat as first-run
    }
    const configName = (config.name as string | null | undefined)?.trim() ?? ''
    const agentName = configName ? '' : await getAgentUserMdName()
    const fallbackName = userInfo().username ?? ''
    return {
      name: configName || agentName || fallbackName,
      onboarded: config.firstRun === false,
    }
  })
}
