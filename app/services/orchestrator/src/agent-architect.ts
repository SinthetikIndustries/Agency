// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ModelRouter } from '@agency/model-router'

const ARCHITECT_SYSTEM_PROMPT = `You are an expert at designing AI agent configurations for the Agency system.
Given a description of what a user wants an agent to do, produce a complete agent spec.

Agency agents have: a name, a slug, a system prompt (identity), a soul description (personality),
a profile type (researcher / developer / analyst / executive / personal-assistant), and a set of allowed tools.

When designing an agent:
1. Extract the core purpose and responsibilities
2. Design a persona that embodies deep expertise in that domain
3. Write a system prompt that establishes clear behavioral boundaries, methodologies, and output expectations
4. Choose the most appropriate built-in profile as a starting point
5. Identify any additional tools beyond the profile defaults that would be needed

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "Display name for the agent",
  "slug": "url-safe-slug",
  "identity": "The full identity.md content — who this agent is, what it does, its expertise",
  "soul": "The soul.md content — personality in 2-3 sentences",
  "suggestedProfile": "researcher | developer | analyst | executive | personal-assistant",
  "reasoning": "Why this profile and these choices (2-3 sentences)"
}`

export interface AgentSpec {
  name: string
  slug: string
  identity: string
  soul: string
  suggestedProfile: string
  reasoning: string
}

export class AgentArchitect {
  constructor(private readonly modelRouter: ModelRouter) {}

  async architectAgent(description: string): Promise<AgentSpec> {
    const response = await this.modelRouter.complete({
      model: this.modelRouter.resolveModel('cheap'),
      messages: [
        {
          role: 'user',
          content: `${ARCHITECT_SYSTEM_PROMPT}\n\nAgent description: ${description}`,
        },
      ],
      maxTokens: 1000,
    })

    const text = typeof response.content === 'string'
      ? response.content
      : (response.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('Architect returned no valid JSON')
    }

    const parsed = JSON.parse(match[0]) as Partial<AgentSpec>
    return {
      name: String(parsed.name ?? 'New Agent'),
      slug: String(parsed.slug ?? 'new-agent').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      identity: String(parsed.identity ?? ''),
      soul: String(parsed.soul ?? ''),
      suggestedProfile: String(parsed.suggestedProfile ?? 'personal-assistant'),
      reasoning: String(parsed.reasoning ?? ''),
    }
  }
}
