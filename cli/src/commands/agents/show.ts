// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { Command, Args } from '@oclif/core'
import chalk from 'chalk'
import { gatewayFetch } from '../../lib/gateway.js'

export default class AgentsShow extends Command {
  static summary = 'Show detailed information about an agent'

  static args = {
    slug: Args.string({ description: 'Agent slug', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(AgentsShow)
    let agent: {
      identity: { slug: string; name: string; status: string; lifecycleType: string; shellPermissionLevel: string; agentManagementPermission: string; workspacePath: string; createdAt: string }
      profile: { name: string; slug: string; description: string; modelTier: string; allowedTools: string[] }
    }
    try {
      const res = await gatewayFetch<{ agent: typeof agent }>(`/agents/${args.slug}`)
      agent = res.agent
    } catch (err) {
      this.error(`${String(err)}`)
    }

    const id = agent.identity
    const p = agent.profile
    const statusColor = (s: string) =>
      s === 'active' ? chalk.green(s) : chalk.yellow(s)

    this.log('')
    this.log(`${chalk.bold(id.name)}  ${chalk.gray(id.slug)}`)
    this.log('')
    this.log(`  Status:        ${statusColor(id.status)}`)
    this.log(`  Lifecycle:     ${id.lifecycleType}`)
    this.log(`  Profile:       ${chalk.cyan(p.name)} (${p.slug})`)
    this.log(`  Model tier:    ${p.modelTier}`)
    this.log(`  Shell perms:   ${id.shellPermissionLevel}`)
    this.log(`  Agent mgmt:    ${id.agentManagementPermission}`)
    this.log(`  Workspace:     ${id.workspacePath}`)
    this.log(`  Tools:         ${p.allowedTools.join(', ')}`)
    this.log(`  Created:       ${new Date(id.createdAt).toLocaleString()}`)
    this.log('')
  }
}
