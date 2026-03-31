// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import React, { useState, Component, type ReactNode } from 'react'
import { SandpackProvider, SandpackPreview, SandpackCodeEditor, SandpackLayout } from '@codesandbox/sandpack-react'

interface Props {
  content: string
  mimeType: string
}

function HtmlFallback({ content }: { content: string }) {
  const [showCode, setShowCode] = useState(false)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 12px', display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <button onClick={() => setShowCode(s => !s)} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {showCode ? 'Preview' : 'Code'}
        </button>
      </div>
      {showCode ? (
        <pre style={{ flex: 1, overflow: 'auto', margin: 0, padding: '16px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-base)', whiteSpace: 'pre-wrap' }}>
          {content}
        </pre>
      ) : (
        <iframe srcDoc={content} sandbox="allow-scripts" style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} title="HTML Preview" />
      )}
    </div>
  )
}

class SandpackErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export function SandpackRenderer({ content, mimeType }: Props) {
  const [showCode, setShowCode] = useState(false)
  const isReact = mimeType === 'application/vnd.react'

  if (!isReact) {
    return <HtmlFallback content={content} />
  }

  const files = {
    '/App.js': { code: content },
    '/index.js': { code: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')).render(<App />);` },
  }

  const fallback = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px' }}>
      <div style={{ fontSize: '12px', color: 'var(--red)', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.3)' }}>
        Sandbox failed to load (offline or network error). Showing source.
      </div>
      <pre style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>{content}</pre>
    </div>
  )

  return (
    <SandpackErrorBoundary fallback={fallback}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SandpackProvider template="react" files={files} theme="dark">
          <SandpackLayout style={{ flex: 1, height: '100%', border: 'none' }}>
            {showCode && <SandpackCodeEditor style={{ height: '100%' }} />}
            <SandpackPreview style={{ height: '100%' }} />
          </SandpackLayout>
        </SandpackProvider>
        <div style={{ padding: '4px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <button onClick={() => setShowCode(s => !s)} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {showCode ? 'Hide code' : 'Show code'}
          </button>
        </div>
      </div>
    </SandpackErrorBoundary>
  )
}
