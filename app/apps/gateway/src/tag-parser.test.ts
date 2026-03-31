// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/gateway/src/tag-parser.test.ts
import { describe, it, expect } from 'vitest'
import { TagParserSession } from './tag-parser.js'

describe('TagParserSession', () => {
  it('flushes plain text with no tags', () => {
    const p = new TagParserSession()
    const { text, events } = p.push('hello world')
    expect(text).toBe('hello world')
    expect(events).toHaveLength(0)
  })

  it('detects a complete artifact tag in a single chunk', () => {
    const p = new TagParserSession()
    const { text, events } = p.push('<artifact id="a1" type="text/html" title="Test">content</artifact>')
    expect(text).toBe('')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'artifact', artifactId: 'a1', mimeType: 'text/html', title: 'Test', content: 'content' })
  })

  it('handles artifact split across multiple chunks', () => {
    const p = new TagParserSession()
    const r1 = p.push('<artifact id="a1" type="text/plain" title="T">')
    expect(r1.text).toBe('')
    expect(r1.events).toHaveLength(0)
    const r2 = p.push('chunk1')
    expect(r2.text).toBe('')
    const r3 = p.push('</artifact>')
    expect(r3.events).toHaveLength(1)
    expect(r3.events[0]).toMatchObject({ type: 'artifact', content: 'chunk1' })
  })

  it('preserves text before and after a tag', () => {
    const p = new TagParserSession()
    const { text, events } = p.push('before<artifact id="x" type="text/plain" title="T">body</artifact>after')
    expect(text).toBe('beforeafter')
    expect(events).toHaveLength(1)
  })

  it('emits file_tree event for self-closing tag', () => {
    const p = new TagParserSession()
    const { text, events } = p.push('<file_tree agentSlug="main" />')
    expect(text).toBe('')
    expect(events[0]).toMatchObject({ type: 'file_tree', agentSlug: 'main' })
  })

  it('detects file_diff with before/after sections', () => {
    const p = new TagParserSession()
    const input = '<file_diff path="/src/foo.ts"><file_diff_before>old</file_diff_before><file_diff_after>new</file_diff_after></file_diff>'
    const { text, events } = p.push(input)
    expect(text).toBe('')
    expect(events[0]).toMatchObject({ type: 'file_diff', path: '/src/foo.ts', before: 'old', after: 'new' })
  })

  it('detects shell_output tag', () => {
    const p = new TagParserSession()
    const { events } = p.push('<shell_output command="npm test">output here</shell_output>')
    expect(events[0]).toMatchObject({ type: 'shell_output', command: 'npm test', output: 'output here' })
  })

  it('detects plan tag with JSON', () => {
    const p = new TagParserSession()
    const steps = [{ id: '1', label: 'Step 1', status: 'done', children: [] }]
    const { events } = p.push(`<plan>${JSON.stringify(steps)}</plan>`)
    expect(events[0]).toMatchObject({ type: 'plan', steps })
  })

  it('handles invalid plan JSON gracefully', () => {
    const p = new TagParserSession()
    const { text, events } = p.push('<plan>not json</plan>')
    expect(events).toHaveLength(0)
    expect(text).toContain('not json')
  })

  it('flushes partial tag as text on done()', () => {
    const p = new TagParserSession()
    p.push('<artifact id="x" type="text/html" title="T">partial')
    const { text, events } = p.done()
    expect(text).toContain('partial')
    expect(events).toHaveLength(0)
  })

  it('detects web_preview with html contentType', () => {
    const p = new TagParserSession()
    const { events } = p.push('<web_preview url="https://example.com" title="Ex" contentType="html"><html></html></web_preview>')
    expect(events[0]).toMatchObject({ type: 'web_preview', url: 'https://example.com', contentType: 'html' })
  })

  it('handles multiple tags in one chunk', () => {
    const p = new TagParserSession()
    const { events } = p.push('<file_tree agentSlug="main" /><file_tree agentSlug="sub" />')
    expect(events).toHaveLength(2)
  })
})
