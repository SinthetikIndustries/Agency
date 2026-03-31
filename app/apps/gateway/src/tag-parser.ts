// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/gateway/src/tag-parser.ts

/**
 * Streaming tag parser for gateway WS handler.
 * One instance per WebSocket session. Accumulates chunks,
 * detects complete structured tags, emits typed events,
 * and returns clean text with tags stripped.
 */

export type ParsedEvent =
  | { type: 'artifact'; artifactId: string; mimeType: string; title: string; content: string }
  | { type: 'file_tree'; agentSlug: string }
  | { type: 'file_diff'; path: string; before: string; after: string }
  | { type: 'shell_output'; command: string; output: string; streaming: boolean }
  | { type: 'web_preview'; url: string; title: string; content: string; contentType: 'html' | 'screenshot' }
  | { type: 'plan'; steps: unknown[] }

export interface PushResult {
  text: string
  events: ParsedEvent[]
}

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]!] = m[2]!
  }
  return attrs
}

const BLOCK_TAGS = ['artifact', 'file_diff', 'shell_output', 'web_preview', 'plan']
const SELF_CLOSING_TAGS = ['file_tree']

function tryParseTag(raw: string): ParsedEvent | null {
  raw = raw.trim()

  const selfClose = /^<(file_tree)\s+([^>]*?)\s*\/>$/.exec(raw)
  if (selfClose) {
    const attrs = parseAttrs(selfClose[2]!)
    return { type: 'file_tree', agentSlug: attrs['agentSlug'] ?? 'main' }
  }

  const blockRe = /^<(\w+)\s*([^>]*)>([\s\S]*)<\/\1>$/
  const block = blockRe.exec(raw)
  if (!block) return null

  const [, tag, attrStr, content] = block as unknown as [string, string, string, string]
  const attrs = parseAttrs(attrStr)

  switch (tag) {
    case 'artifact':
      return {
        type: 'artifact',
        artifactId: attrs['id'] ?? `artifact-${Date.now()}`,
        mimeType: attrs['type'] ?? 'text/plain',
        title: attrs['title'] ?? 'Artifact',
        content,
      }
    case 'file_diff': {
      const beforeMatch = /<file_diff_before>([\s\S]*?)<\/file_diff_before>/.exec(content)
      const afterMatch = /<file_diff_after>([\s\S]*?)<\/file_diff_after>/.exec(content)
      return {
        type: 'file_diff',
        path: attrs['path'] ?? '',
        before: beforeMatch?.[1] ?? '',
        after: afterMatch?.[1] ?? '',
      }
    }
    case 'shell_output':
      return { type: 'shell_output', command: attrs['command'] ?? '', output: content, streaming: false }
    case 'web_preview':
      return {
        type: 'web_preview',
        url: attrs['url'] ?? '',
        title: attrs['title'] ?? '',
        content,
        contentType: (attrs['contentType'] as 'html' | 'screenshot') ?? 'html',
      }
    case 'plan':
      try {
        const steps = JSON.parse(content) as unknown[]
        if (!Array.isArray(steps)) return null
        return { type: 'plan', steps }
      } catch {
        return null
      }
    default:
      return null
  }
}

export class TagParserSession {
  private buffer = ''

  push(chunk: string): PushResult {
    this.buffer += chunk
    return this._process()
  }

  done(): PushResult {
    const result = this._process()
    if (this.buffer) {
      result.text += this.buffer
      this.buffer = ''
    }
    return result
  }

  private _process(): PushResult {
    const events: ParsedEvent[] = []
    let text = ''

    const allTagNames = [...BLOCK_TAGS, ...SELF_CLOSING_TAGS]
    const openTagRe = new RegExp(`<(${allTagNames.join('|')})(\\s[^>]*)?>`, 'g')

    let pos = 0

    while (pos < this.buffer.length) {
      openTagRe.lastIndex = pos
      const openMatch = openTagRe.exec(this.buffer)
      if (!openMatch) {
        const ltIdx = this.buffer.lastIndexOf('<', this.buffer.length - 1)
        if (ltIdx >= pos && ltIdx >= this.buffer.length - 50) {
          text += this.buffer.slice(pos, ltIdx)
          this.buffer = this.buffer.slice(ltIdx)
          pos = this.buffer.length
        } else {
          text += this.buffer.slice(pos)
          this.buffer = ''
          pos = 0
        }
        break
      }

      const tagName = openMatch[1]!
      const openStart = openMatch.index!
      const openEnd = openMatch.index! + openMatch[0].length

      text += this.buffer.slice(pos, openStart)

      if (SELF_CLOSING_TAGS.includes(tagName) || openMatch[0].endsWith('/>')) {
        const selfCloseStr = this.buffer.slice(openStart, openEnd)
        const evt = tryParseTag(selfCloseStr)
        if (evt) events.push(evt)
        else text += selfCloseStr
        pos = openEnd
        continue
      }

      const closeTag = `</${tagName}>`
      const closeIdx = this.buffer.indexOf(closeTag, openEnd)
      if (closeIdx === -1) {
        this.buffer = this.buffer.slice(openStart)
        pos = this.buffer.length
        break
      }

      const closeEnd = closeIdx + closeTag.length
      const fullTag = this.buffer.slice(openStart, closeEnd)
      const evt = tryParseTag(fullTag)
      if (evt) {
        events.push(evt)
      } else {
        const innerContent = this.buffer.slice(openEnd, closeIdx)
        text += innerContent
      }
      pos = closeEnd
    }

    if (pos > 0 && pos < this.buffer.length) {
      this.buffer = this.buffer.slice(pos)
    }

    return { text, events }
  }
}
