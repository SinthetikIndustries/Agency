// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { CompletionMessage, ContentBlock, TextBlock } from '@agency/shared-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contentToText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content
  return content.map(b => (b.type === 'text' ? (b as TextBlock).text : '')).join('')
}

// ─── buildCompactionPrompt ────────────────────────────────────────────────────

export function buildCompactionPrompt(messages: CompletionMessage[]): string {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${contentToText(m.content)}`)
    .join('\n\n')

  return `Your task is to create a detailed summary of the conversation below.

First, wrap your analysis in <analysis> tags — chronologically review each message and note:
- The user's explicit requests and intent at each point
- Key technical decisions and concepts
- Files examined or modified, with relevant code snippets
- Errors encountered and how they were resolved
- Any specific feedback or corrections from the user

Then provide your summary inside <summary> tags with exactly these 9 sections:

1. **Primary Request and Intent** — All explicit user requests, in order
2. **Key Technical Concepts** — Technologies, frameworks, and patterns discussed
3. **Files and Code Sections** — Files examined, modified, or created with relevant snippets
4. **Errors and Fixes** — Errors encountered and resolution steps
5. **Problem Solving** — Problems solved and ongoing troubleshooting
6. **All User Messages** — Every user message verbatim (preserves original intent)
7. **Pending Tasks** — Work items not yet completed
8. **Current Work** — Precise description of work in progress at this point
9. **Next Step** — The single next action aligned with the most recent user request

---

Conversation to summarize:

${transcript}`
}

// ─── parseCompactionSummary ───────────────────────────────────────────────────

export function parseCompactionSummary(raw: string): string {
  const match = raw.match(/<summary>([\s\S]*?)<\/summary>/)
  if (match) return match[1]!.trim()
  return raw.trim()
}

// ─── pruneToolResults ─────────────────────────────────────────────────────────

export function pruneToolResults(messages: CompletionMessage[], keepLast = 5): CompletionMessage[] {
  const isToolResultMessage = (m: CompletionMessage): boolean =>
    Array.isArray(m.content) && (m.content as ContentBlock[]).some(b => b.type === 'tool_result')

  const toolResultIndices: number[] = []
  messages.forEach((m, i) => { if (isToolResultMessage(m)) toolResultIndices.push(i) })

  if (toolResultIndices.length <= keepLast) return messages

  const pruneSet = new Set(toolResultIndices.slice(0, toolResultIndices.length - keepLast))

  return messages.map((m, i) => {
    if (!pruneSet.has(i)) return m
    const content = (m.content as ContentBlock[]).map(b =>
      b.type === 'tool_result'
        ? { ...b, content: '[tool result pruned — see summary for context]' }
        : b
    )
    return { ...m, content: content as ContentBlock[] }
  })
}
