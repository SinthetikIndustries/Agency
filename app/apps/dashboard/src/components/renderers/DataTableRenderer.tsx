// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/renderers/DataTableRenderer.tsx
'use client'

import { useMemo, useState } from 'react'

interface Props {
  content: string
  mimeType: string
}

function parseContent(content: string, mimeType: string): { columns: string[]; rows: string[][] } | null {
  try {
    if (mimeType === 'application/json' || content.trimStart().startsWith('[')) {
      const arr = JSON.parse(content) as Record<string, unknown>[]
      if (!Array.isArray(arr) || arr.length === 0) return null
      const columns = Object.keys(arr[0] ?? {})
      const rows = arr.map(row => columns.map(col => String(row[col] ?? '')))
      return { columns, rows }
    }
    // CSV fallback
    const lines = content.trim().split('\n')
    if (lines.length < 2) return null
    const columns = (lines[0] ?? '').split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
    return { columns, rows }
  } catch {
    return null
  }
}

export function DataTableRenderer({ content, mimeType }: Props) {
  const [filter, setFilter] = useState('')
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100

  const parsed = useMemo(() => parseContent(content, mimeType), [content, mimeType])

  const filtered = useMemo(() => {
    if (!parsed) return []
    let rows = parsed.rows
    if (filter) {
      const q = filter.toLowerCase()
      rows = rows.filter(r => r.some(c => c.toLowerCase().includes(q)))
    }
    if (sortCol !== null) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return rows
  }, [parsed, filter, sortCol, sortAsc])

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  if (!parsed) {
    return <div style={{ padding: '16px', fontSize: '12px', color: 'var(--red)' }}>Could not parse table data</div>
  }

  function handleSort(colIdx: number) {
    if (sortCol === colIdx) setSortAsc(a => !a)
    else { setSortCol(colIdx); setSortAsc(true) }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <input
          type="text"
          placeholder="Filter rows..."
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(0) }}
          style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none' }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr>
              {parsed.columns.map((col, i) => (
                <th
                  key={col}
                  onClick={() => handleSort(i)}
                  style={{ padding: '6px 10px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  {col} {sortCol === i ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border-dim)', color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '11px' }}>← Prev</button>
          <span>Page {page + 1} / {totalPages} ({filtered.length} rows)</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '11px' }}>Next →</button>
        </div>
      )}
    </div>
  )
}
