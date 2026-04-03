// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { describe, it, expect } from 'vitest'
import type { CompletionMessage } from '@agency/shared-types'
import { buildCompactionPrompt, parseCompactionSummary, pruneToolResults } from './compaction.js'

// ─── buildCompactionPrompt ────────────────────────────────────────────────────

describe('buildCompactionPrompt', () => {
  it('includes all 9 required sections', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: 'Fix the login bug' },
      { role: 'assistant', content: 'Found it in auth.ts.' },
    ]
    const prompt = buildCompactionPrompt(messages)
    expect(prompt).toContain('Primary Request and Intent')
    expect(prompt).toContain('Key Technical Concepts')
    expect(prompt).toContain('Files and Code Sections')
    expect(prompt).toContain('Errors and Fixes')
    expect(prompt).toContain('Problem Solving')
    expect(prompt).toContain('All User Messages')
    expect(prompt).toContain('Pending Tasks')
    expect(prompt).toContain('Current Work')
    expect(prompt).toContain('Next Step')
  })

  it('includes analysis and summary tag instructions', () => {
    const messages: CompletionMessage[] = [{ role: 'user', content: 'hello' }]
    const prompt = buildCompactionPrompt(messages)
    expect(prompt).toContain('<analysis>')
    expect(prompt).toContain('<summary>')
  })

  it('includes the conversation transcript', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: 'It is 4.' },
    ]
    const prompt = buildCompactionPrompt(messages)
    expect(prompt).toContain('What is 2+2?')
    expect(prompt).toContain('It is 4.')
  })

  it('handles messages with ContentBlock arrays', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'block message' }] },
    ]
    const prompt = buildCompactionPrompt(messages)
    expect(prompt).toContain('block message')
  })
})

// ─── parseCompactionSummary ───────────────────────────────────────────────────

describe('parseCompactionSummary', () => {
  it('returns only the content inside <summary> tags', () => {
    const raw = '<analysis>My reasoning</analysis>\n<summary>The actual summary</summary>'
    expect(parseCompactionSummary(raw)).toBe('The actual summary')
  })

  it('returns trimmed full text when no summary tags are present', () => {
    const raw = '  Plain summary with no tags  '
    expect(parseCompactionSummary(raw)).toBe('Plain summary with no tags')
  })

  it('handles multiline summary content', () => {
    const raw = '<analysis>thinking</analysis>\n<summary>\nLine one\nLine two\n</summary>'
    expect(parseCompactionSummary(raw)).toBe('Line one\nLine two')
  })
})

// ─── pruneToolResults ─────────────────────────────────────────────────────────

describe('pruneToolResults', () => {
  it('replaces older tool_result content with a placeholder, keeps the recent one intact', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'old result 1' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '2', content: 'old result 2' }] },
      { role: 'user', content: 'a plain user message' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '3', content: 'recent result' }] },
    ]
    const pruned = pruneToolResults(messages, 1)
    type ResultBlock = { type: string; content?: string }
    const getResultContent = (m: CompletionMessage) =>
      (m.content as ResultBlock[])[0]!.content
    expect(getResultContent(pruned[0]!)).toContain('pruned')
    expect(getResultContent(pruned[1]!)).toContain('pruned')
    expect(getResultContent(pruned[3]!)).toBe('recent result')
  })

  it('replaces pruned tool_result content with a placeholder, not removes the message', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'old result' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '2', content: 'recent result' }] },
    ]
    const pruned = pruneToolResults(messages, 1)
    expect(pruned).toHaveLength(2)
    const firstContent = pruned[0]!.content as Array<{ type: string; content?: string }>
    expect(firstContent[0]!.type).toBe('tool_result')
    expect(firstContent[0]!.content).toContain('pruned')
  })

  it('does not modify messages when under the keep limit', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]
    expect(pruneToolResults(messages, 10)).toEqual(messages)
  })

  it('does not modify non-tool-result messages', () => {
    const messages: CompletionMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'old' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '2', content: 'old2' }] },
      { role: 'user', content: 'keep this plain message' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '3', content: 'recent' }] },
    ]
    const pruned = pruneToolResults(messages, 1)
    expect(pruned[2]!.content).toBe('keep this plain message')
  })
})
