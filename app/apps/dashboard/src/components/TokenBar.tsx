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
      className="px-4 pb-2 pt-1"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Summary line */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-400">
          Tokens: <span className="text-gray-200">{authTotal.toLocaleString()}</span>
          {' · '}
          <span className="text-gray-200">{pct.toFixed(1)}%</span>
          {' · Context: '}
          <span className="text-gray-200">{formatK(contextWindow)}</span>
          {tokenUsage?.model && <span className="text-gray-400"> · {tokenUsage.model}</span>}
        </span>
      </div>

      {/* Bar */}
      <div className="relative">
        <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-surface, #1f2937)' }}>
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
          <div
            className="absolute bottom-full left-0 mb-2 bg-gray-900 border border-gray-700 rounded-lg p-3 w-64 shadow-xl z-50"
            style={{ pointerEvents: 'none' }}
          >
            <p className="text-xs font-semibold text-white mb-2">Token Usage Breakdown</p>
            <div className="space-y-1.5">
              {SEGMENTS.filter(seg => seg.key !== 'available').map(seg => (
                <div key={seg.key} className="grid text-xs" style={{ gridTemplateColumns: '12px 1fr auto', gap: '6px', alignItems: 'center' }}>
                  <span className="w-3 h-3 rounded-full" style={{ background: seg.color }} />
                  <span className="text-gray-400">{seg.label}</span>
                  <span className="text-gray-300 text-right tabular-nums">{estimated[seg.key].toLocaleString()}</span>
                </div>
              ))}
              <div className="grid text-xs border-t border-gray-700 pt-1.5 mt-1.5" style={{ gridTemplateColumns: '12px 1fr auto', gap: '6px', alignItems: 'center' }}>
                <span />
                <span className="text-gray-500">Available</span>
                <span className="text-gray-500 text-right tabular-nums">{available.toLocaleString()}</span>
              </div>
              <div className="grid text-xs font-semibold border-t border-gray-700 pt-1.5" style={{ gridTemplateColumns: '12px 1fr auto', gap: '6px', alignItems: 'center' }}>
                <span />
                <span className="text-white">Total</span>
                <span className="text-white text-right tabular-nums">{authTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1.5">
        {SEGMENTS.map(seg => (
          <div key={seg.key} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
            <span className="text-sm text-gray-300">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
