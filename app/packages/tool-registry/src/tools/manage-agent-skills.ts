// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ToolManifest, ToolHandler } from '../index.js'

export const MANAGE_AGENT_SKILLS_MANIFEST: ToolManifest = {
  name: 'manage_agent_skills',
  type: 'agent_management',
  description:
    'Enable or disable skills for agents in the system. Use this to customize which capabilities each agent has access to. Only the orchestrator may call this tool.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'enable', 'disable'],
        description: 'Operation to perform',
      },
      agent_id: {
        type: 'string',
        description: "The target agent's ID (UUID)",
      },
      skill_name: {
        type: 'string',
        description: 'The skill name — required for enable/disable operations',
      },
    },
    required: ['operation', 'agent_id'],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 10_000,
}

export function createManageAgentSkillsHandler(
  gatewayBaseUrl: string,
  serviceToken: string,
  orchestratorId: string
): ToolHandler {
  return async (input) => {
    const { operation, agent_id, skill_name } = input as {
      operation: 'list' | 'enable' | 'disable'
      agent_id: string
      skill_name?: string
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken}`,
      'X-Agent-Id': orchestratorId,
    }

    // Resolve agent ID to slug
    const agentsRes = await fetch(`${gatewayBaseUrl}/agents`, { headers })
    if (!agentsRes.ok) return { error: `Failed to list agents: ${agentsRes.status}` }
    const { agents } = (await agentsRes.json()) as { agents: Array<{ id: string; slug: string }> }
    const agent = agents.find((a) => a.id === agent_id)
    if (!agent) return { error: `Agent ${agent_id} not found` }

    if (operation === 'list') {
      const res = await fetch(`${gatewayBaseUrl}/agents/${agent.slug}/skills`, { headers })
      return res.json()
    }

    if (!skill_name) return { error: 'skill_name is required for enable/disable operations' }

    const res = await fetch(
      `${gatewayBaseUrl}/agents/${agent.slug}/skills/${skill_name}/${operation}`,
      { method: 'POST', headers }
    )
    return res.json()
  }
}
