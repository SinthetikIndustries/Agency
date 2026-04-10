// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState } from 'react'

interface TokenBarProps {
  messages: Array<{ role: string; parts: Array<{ kind: string; text?: string; result?: { output: unknown } }> }>
  inputValue: string
  systemPrompt: string
  tokenUsage: { inputTokens: number; outputTokens: number; contextWindow: number; model: string } | null
}

const SEGMENTS = [
  { key: 'system',    label: 'System Prompt',    color: '#a855f7' },
  { key: 'history',   label: 'Message History',  color: '#60a5fa' },
  { key: 'tools',     label: 'Tool Results',     color: '#fb923c' },
  { key: 'input',     label: 'Current Input',    color: '#facc15' },
  { key: 'available', label: 'Available',        color: '#374151' },
] as const

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function formatK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)
}

export function TokenBar({ messages, inputValue, systemPrompt, tokenUsage }: TokenBarProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const contextWindow = tokenUsage?.contextWindow ?? 200000

  // Client-side estimates
  const systemTokens = estimateTokens(systemPrompt)
  const historyTokens = messages
    .reduce((sum, m) => sum + m.parts.reduce((s, p) => {
      if (p.kind === 'text') return s + estimateTokens(p.text ?? '')
      return s
    }, 0), 0)
  const toolTokens = messages.reduce((sum, m) => sum + m.parts.reduce((s, p) => {
    if (p.kind === 'tool_call' && p.result) {
      const out = typeof p.result.output === 'string' ? p.result.output : JSON.stringify(p.result.output)
      return s + estimateTokens(out)
    }
    return s
  }, 0), 0)
  const inputTokens = estimateTokens(inputValue)

  const estimated = { system: systemTokens, history: historyTokens, tools: toolTokens, input: inputTokens, available: 0 }
  const totalEstimated = systemTokens + historyTokens + toolTokens + inputTokens
  const available = Math.max(0, contextWindow - totalEstimated)
  estimated.available = available
  const pct = Math.min(100, (totalEstimated / contextWindow) * 100)

  // Authoritative total from last WS response
  const authTotal = tokenUsage?.inputTokens ?? totalEstimated

  const segmentWidths = {
    system:    (estimated.system  / contextWindow) * 100,
    history:   (estimated.history / contextWindow) * 100,
    tools:     (estimated.tools   / contextWindow) * 100,
    input:     (estimated.input   / contextWindow) * 100,
    available: (available         / contextWindow) * 100,
  }

  return (
    <div
      style={{ padding: '4px 16px 8px', position: 'relative' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Summary line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Tokens: <span style={{ color: 'var(--text-primary)' }}>{authTotal.toLocaleString()}</span>
          {' · '}
          <span style={{ color: 'var(--text-primary)' }}>{pct.toFixed(1)}%</span>
          {' · Context: '}
          <span style={{ color: 'var(--text-primary)' }}>{formatK(contextWindow)}</span>
          {tokenUsage?.model && <span style={{ color: 'var(--text-muted)' }}> · {tokenUsage.model}</span>}
        </span>
      </div>

      {/* Bar */}
      <div style={{ position: 'relative' }}>
        <div style={{ height: 6, borderRadius: 9999, overflow: 'hidden', display: 'flex', background: 'var(--bg-surface)' }}>
          {SEGMENTS.map(seg => (
            segmentWidths[seg.key] > 0 ? (
              <div
                key={seg.key}
                style={{ width: `${segmentWidths[seg.key]}%`, background: seg.color, flexShrink: 0 }}
              />
            ) : null
          ))}
        </div>

        {/* Tooltip */}
        {showTooltip && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            width: 256, padding: 12, pointerEvents: 'none',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 50,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Token Usage Breakdown</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SEGMENTS.filter(seg => seg.key !== 'available').map(seg => (
                <div key={seg.key} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 6, alignItems: 'center', fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{seg.label}</span>
                  <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{estimated[seg.key].toLocaleString()}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 6, alignItems: 'center', fontSize: 11, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
                <span />
                <span style={{ color: 'var(--text-muted)' }}>Available</span>
                <span style={{ color: 'var(--text-muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{available.toLocaleString()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <span />
                <span style={{ color: 'var(--text-primary)' }}>Total</span>
                <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{authTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        {SEGMENTS.map(seg => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: seg.color }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
