// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/renderers/WebPreviewRenderer.tsx
'use client'

interface Props {
  url: string
  title: string
  content: string
  contentType: 'html' | 'screenshot'
}

export function WebPreviewRenderer({ url, title, content, contentType }: Props) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>{title || url}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Open ↗
        </a>
      </div>
      {contentType === 'screenshot' ? (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '16px', background: 'var(--bg-base)' }}>
          <img src={content} alt={title} style={{ maxWidth: '100%', border: '1px solid var(--border)', borderRadius: '4px' }} />
        </div>
      ) : (
        // sandbox="allow-scripts" without allow-same-origin: scripts execute but the
        // frame cannot access the parent origin's localStorage, cookies, or DOM.
        // This is intentional — the iframe is designed to render AI HTML faithfully.
        <iframe
          srcDoc={content}
          sandbox="allow-scripts"
          style={{ flex: 1, border: 'none', width: '100%' }}
          title={title}
        />
      )}
    </div>
  )
}
