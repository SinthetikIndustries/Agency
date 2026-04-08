// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { FastifyInstance } from 'fastify'
import { promises as fs } from 'fs'
import { join } from 'path'
import { agencyDir } from '@agency/config'
import type { DatabaseClient } from '@agency/orchestrator/db'

const NAME_PLACEHOLDER = '[Unknown — update this as I learn]'

async function getAgentUserMdName(db: DatabaseClient): Promise<string> {
  try {
    const row = await db.queryOne<{ content: string }>(
      `SELECT acf.content
       FROM agent_config_files acf
       JOIN agent_identities ai ON ai.id = acf.agent_id
       WHERE ai.slug = 'main' AND acf.file_type = 'user'`
    )
    const match = row?.content?.match(/\*\*Name:\*\*\s*(.+)/)
    const name = match?.[1]?.trim() ?? ''
    return name && name !== NAME_PLACEHOLDER ? name : ''
  } catch {
    return ''
  }
}

export function registerMeRoutes(app: FastifyInstance, { db }: { db: DatabaseClient }) {
  app.get('/me', async (request, reply) => {
    let config: Record<string, unknown> = {}
    try {
      const raw = await fs.readFile(join(agencyDir, 'config.json'), 'utf8')
      config = JSON.parse(raw)
    } catch {
      // config unreadable → treat as first-run
    }
    const configName = (config.name as string | null | undefined)?.trim() ?? ''
    const agentName = configName ? '' : await getAgentUserMdName(db)
    return {
      name: configName || agentName,
      onboarded: config.firstRun === false,
    }
  })
}
