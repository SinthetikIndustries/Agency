// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState } from 'react'

interface Props {
  content: string
  language?: string
}

export function CodeRenderer({ content, language }: Props) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>{language ?? 'text'}</span>
        <button
          onClick={copy}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--accent)' : 'var(--text-muted)', fontSize: '11px' }}
        >
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>
      <pre style={{
        flex: 1,
        overflow: 'auto',
        margin: 0,
        padding: '16px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: '1.6',
        color: 'var(--text-primary)',
        background: 'var(--bg-base)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {content}
      </pre>
    </div>
  )
}
