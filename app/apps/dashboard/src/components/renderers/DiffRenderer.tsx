// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/renderers/DiffRenderer.tsx
'use client'

import { diffLines } from 'diff'

interface Props {
  path: string
  before: string
  after: string
}

export function DiffRenderer({ path, before, after }: Props) {
  const changes = diffLines(before, after)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        {path}
      </div>
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6' }}>
        {changes.map((change, i) => {
          const bg = change.added
            ? 'rgba(34,197,94,0.12)'
            : change.removed
            ? 'rgba(239,68,68,0.12)'
            : 'transparent'
          const color = change.added
            ? 'var(--green)'
            : change.removed
            ? 'var(--red)'
            : 'var(--text-secondary)'
          const prefix = change.added ? '+ ' : change.removed ? '- ' : '  '
          const raw = change.value ?? ''
          const lines = raw.endsWith('\n') ? raw.slice(0, -1).split('\n') : raw.split('\n')
          return lines.map((line, j) => (
            <div key={`${i}-${j}`} style={{ display: 'flex', background: bg, padding: '0 12px' }}>
              <span style={{ color, minWidth: '16px', userSelect: 'none', marginRight: '8px' }}>{prefix}</span>
              <span style={{ color: change.added || change.removed ? color : 'var(--text-primary)', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</span>
            </div>
          ))
        })}
      </div>
    </div>
  )
}
