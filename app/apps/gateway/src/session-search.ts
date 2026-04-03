// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { ModelRouter } from '@agency/model-router'

export interface SessionSearchCandidate {
  id: string
  name: string | null
  agentId: string
  createdAt: string
  firstMessage: string | null
  excerpt: string | null
}

export async function rankSessionsByRelevance(
  query: string,
  sessions: SessionSearchCandidate[],
  modelRouter: ModelRouter,
): Promise<string[]> {
  if (sessions.length === 0) return []

  const manifest = sessions
    .map((s, i) => {
      const title = s.name ?? 'Untitled session'
      const preview = s.firstMessage ?? s.excerpt ?? ''
      return `${i}: ${title} — ${preview.slice(0, 200)}`
    })
    .join('\n')

  const response = await modelRouter.complete({
    model: modelRouter.resolveModel('cheap'),
    messages: [
      {
        role: 'user',
        content: `Find sessions relevant to this query: "${query}"

Sessions:
${manifest}

Return ONLY a JSON array of indices for relevant sessions, most relevant first. Be inclusive. Example: [2, 0, 5]
Return [] if none match.`,
      },
    ],
    maxTokens: 256,
  })

  const text = typeof response.content === 'string'
    ? response.content
    : (response.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')

  try {
    const match = text.match(/\[[\d,\s\-]*\]/)
    if (!match) return []
    const indices: number[] = JSON.parse(match[0])
    return indices
      .filter(i => Number.isInteger(i) && i >= 0 && i < sessions.length)
      .map(i => sessions[i]!.id)
  } catch {
    return []
  }
}
