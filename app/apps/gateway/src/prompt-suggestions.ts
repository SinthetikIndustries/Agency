// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ModelRouter } from '@agency/model-router'

export async function generatePromptSuggestions(
  recentMessages: Array<{ role: string; content: string }>,
  modelRouter: ModelRouter,
): Promise<string[]> {
  if (recentMessages.length === 0) return []

  const transcript = recentMessages
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content.slice(0, 300)}`)
    .join('\n')

  const response = await modelRouter.complete({
    model: modelRouter.resolveModel('cheap'),
    messages: [
      {
        role: 'user',
        content: `You are predicting what the user will say next in a conversation with an AI agent.
Given the conversation below, suggest 1-3 short follow-up prompts the user might naturally say next.

Rules:
- Each suggestion must be 3-10 words
- Prioritize actionable next steps over questions
- Do NOT suggest things the agent just completed
- Match the user's communication style

Return ONLY a JSON array of strings. Example: ["Run the tests", "Show me the diff", "Deploy to staging"]

Conversation:
${transcript}`,
      },
    ],
    maxTokens: 150,
  })

  const text = typeof response.content === 'string'
    ? response.content
    : (response.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')

  try {
    const match = text.match(/\[[\s\S]*?\]/)
    if (!match) return []
    const suggestions: unknown[] = JSON.parse(match[0])
    return suggestions
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 3)
  } catch {
    return []
  }
}
