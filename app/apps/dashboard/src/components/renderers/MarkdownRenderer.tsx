// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface Props {
  content: string
}

const components: Components = {
  h1: ({ children }) => <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-primary)' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '20px 0 12px', color: 'var(--text-primary)' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-primary)' }}>{children}</h3>,
  p: ({ children }) => <p style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>{children}</p>,
  pre: ({ children }) => (
    <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', margin: '0 0 12px' }}>
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={className} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 5px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{children}</code>
  ),
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{children}</a>,
  ul: ({ children }) => <ul style={{ paddingLeft: '20px', margin: '0 0 12px' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: '20px', margin: '0 0 12px' }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: '4px', color: 'var(--text-primary)' }}>{children}</li>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--border-accent)', paddingLeft: '12px', margin: '12px 0', color: 'var(--text-secondary)' }}>{children}</blockquote>,
  table: ({ children }) => <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '12px' }}>{children}</table>,
  th: ({ children }) => <th style={{ border: '1px solid var(--border)', padding: '6px 12px', background: 'var(--bg-elevated)', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>,
  td: ({ children }) => <td style={{ border: '1px solid var(--border)', padding: '6px 12px', fontSize: '13px' }}>{children}</td>,
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: '1.7', color: 'var(--text-primary)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
