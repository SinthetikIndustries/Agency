// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/renderers/PlanRenderer.tsx
'use client'

import { useEffect, useState } from 'react'
import type { PlanStep } from '@/components/workspace/types'

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

const STATUS_ICON: Record<string, string> = {
  pending: '⏳',
  running: '⚙️',
  done: '✓',
  failed: '✗',
  skipped: '—',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--text-muted)',
  running: 'var(--accent)',
  done: 'var(--green)',
  failed: 'var(--red)',
  skipped: 'var(--text-muted)',
}

function StepRow({ step, depth = 0 }: { step: PlanStep; depth?: number }) {
  const color = STATUS_COLOR[step.status] ?? 'var(--text-muted)'
  const icon = STATUS_ICON[step.status] ?? '?'
  const now = useNow(step.status === 'running')

  const elapsed = step.startedAt && step.completedAt
    ? `${((step.completedAt - step.startedAt) / 1000).toFixed(1)}s`
    : step.startedAt && step.status === 'running'
    ? `${((now - step.startedAt) / 1000).toFixed(0)}s`
    : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: `5px 12px 5px ${12 + depth * 20}px` }}>
        <span style={{ color, fontSize: step.status === 'running' ? '14px' : '12px', minWidth: '16px', textAlign: 'center' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '13px', color: step.status === 'done' ? 'var(--text-secondary)' : 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>{step.label}</span>
        {elapsed && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{elapsed}</span>}
      </div>
      {step.children?.map(child => <StepRow key={child.id} step={child} depth={depth + 1} />)}
    </>
  )
}

interface Props {
  steps: PlanStep[]
}

export function PlanRenderer({ steps }: Props) {
  if (steps.length === 0) {
    return <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>No steps yet...</div>
  }

  const done = steps.filter(s => s.status === 'done').length
  const total = steps.length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {done}/{total} steps complete
        <div style={{ marginTop: '4px', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {steps.map(step => <StepRow key={step.id} step={step} />)}
      </div>
    </div>
  )
}
