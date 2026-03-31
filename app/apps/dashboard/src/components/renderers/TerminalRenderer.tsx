// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/renderers/TerminalRenderer.tsx
'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  lines: string[]
  command?: string
}

// Strip basic ANSI escape codes
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '')
}

export function TerminalRenderer({ lines, command }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [locked, setLocked] = useState(true)

  useEffect(() => {
    if (locked) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, locked])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setLocked(atBottom)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      {command && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #30363d', fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#8b949e' }}>
          $ {command}
        </div>
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', color: '#c9d1d9', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {stripAnsi(line)}
          </div>
        ))}
        {lines.length === 0 && (
          <div style={{ color: '#8b949e', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>Waiting for output...</div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '4px 12px', borderTop: '1px solid #30363d', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setLocked(l => !l)}
          style={{ fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', color: locked ? '#58a6ff' : '#8b949e' }}
        >
          {locked ? '🔒 auto-scroll' : '🔓 scroll free'}
        </button>
      </div>
    </div>
  )
}
