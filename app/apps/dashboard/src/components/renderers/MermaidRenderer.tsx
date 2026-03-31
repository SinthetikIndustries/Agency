// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import DOMPurify from 'dompurify'
import { useEffect, useRef, useState } from 'react'

interface Props {
  content: string
}

export function MermaidRenderer({ content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function render() {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { background: 'transparent' } })
      try {
        const id = `mermaid-${Date.now()}`
        const { svg } = await mermaid.render(id, content)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Diagram render failed')
      }
    }

    void render()
    return () => { cancelled = true }
  }, [content])

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }} />
      {error && (
        <>
          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', fontSize: '12px', color: 'var(--red)' }}>
            {error}
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {content}
          </pre>
        </>
      )}
    </div>
  )
}
