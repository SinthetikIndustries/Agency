// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import DOMPurify from 'dompurify'
import type { Artifact } from '@/components/workspace/types'
import { CodeRenderer } from './CodeRenderer'
import { DataTableRenderer } from './DataTableRenderer'
import { MarkdownRenderer } from './MarkdownRenderer'
import { MermaidRenderer } from './MermaidRenderer'
import { SandpackRenderer } from './SandpackRenderer'

interface Props {
  artifact: Artifact
}

export function ArtifactRenderer({ artifact }: Props) {
  const { mimeType, versions, activeVersion } = artifact
  const content = versions[activeVersion]?.content ?? ''

  if (mimeType === 'text/html' || mimeType === 'application/vnd.react') {
    return <SandpackRenderer content={content} mimeType={mimeType} />
  }
  if (mimeType === 'application/vnd.mermaid') {
    return <MermaidRenderer content={content} />
  }
  if (mimeType === 'image/svg+xml') {
    const clean = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } })
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', justifyContent: 'center' }}>
        <div dangerouslySetInnerHTML={{ __html: clean }} />
      </div>
    )
  }
  if (mimeType === 'text/markdown') {
    return <MarkdownRenderer content={content} />
  }
  if (mimeType === 'text/csv') {
    return <DataTableRenderer content={content} mimeType={mimeType} />
  }
  if (mimeType === 'application/json') {
    let formatted = content
    try { formatted = JSON.stringify(JSON.parse(content), null, 2) } catch { /* use raw */ }
    return <CodeRenderer content={formatted} language="json" />
  }
  const langMap: Record<string, string> = {
    'text/plain': 'text',
    'text/css': 'css',
    'text/javascript': 'javascript',
    'application/xml': 'xml',
  }
  return <CodeRenderer content={content} language={langMap[mimeType] ?? 'text'} />
}
