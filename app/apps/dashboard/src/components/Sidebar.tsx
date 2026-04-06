// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useRef } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { getThemeMeta, THEMES } from '@/lib/themes'

import { sessions, type SessionSummary } from '@/lib/api'
import { useEffect, useState } from 'react'

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.25"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.25"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.25"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  )
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H5l-3 2V3.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.828 1.172a.5.5 0 0 0-.707 0l-1.06 1.06a.5.5 0 0 0-.122.195l-.813 2.439-2.44-.813a.5.5 0 0 0-.536.122L2.88 5.845a.5.5 0 0 0 .122.707l2.44.813-.813 2.44a.5.5 0 0 0 .707.536l2.44-.813.813 2.44a.5.5 0 0 0 .707-.122l1.17-1.17a.5.5 0 0 0 .122-.536l-.813-2.44 2.44-.813a.5.5 0 0 0 .122-.707L9.828 1.172ZM8 12l-1.5 3h3L8 12Z"/>
    </svg>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '7px 10px',
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', fontSize: '13px',
  textAlign: 'left', borderRadius: '6px', whiteSpace: 'nowrap',
}

function IconBot() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="5" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="6" cy="9" r="1" fill="currentColor"/>
      <circle cx="10" cy="9" r="1" fill="currentColor"/>
      <path d="M8 5V3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
      <circle cx="8" cy="2.5" r="0.75" fill="currentColor"/>
    </svg>
  )
}

function IconPuzzle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 2h4v2.5c.5-.5 1-.5 1.5 0s.5 1 0 1.5H14v4h-2.5c.5.5.5 1 0 1.5s-1 .5-1.5 0V14H6v-2.5c-.5.5-1 .5-1.5 0S4 10.5 4.5 10H2V6h2.5C4 5.5 4 5 4.5 4.5S5.5 4 6 4.5V2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  )
}

function IconBrain() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 2.5C4.067 2.5 2.5 4.067 2.5 6c0 .95.37 1.81.97 2.45A2.5 2.5 0 0 0 3 9.5a2.5 2.5 0 0 0 2 2.45V13h6v-1.05A2.5 2.5 0 0 0 13 9.5a2.5 2.5 0 0 0-.47-1.05C13.13 7.81 13.5 6.95 13.5 6c0-1.933-1.567-3.5-3.5-3.5A3.49 3.49 0 0 0 8 3.18 3.49 3.49 0 0 0 6 2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M8 3.18V13M5.5 7H3M10.5 7H13M5.5 10H4M10.5 10H12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 8a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24L6.71 3.05" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
      <path d="M10 8a3 3 0 0 0-4.24 0L3.64 10.12a3 3 0 0 0 4.24 4.24l1.41-1.41" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function IconInbox() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 10h3l1 2h4l1-2h3" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M2 10V4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5V10" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  )
}

function IconScroll() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 4h8M4 7h8M4 10h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4v4c0 3.31 2.24 5.72 5 6 2.76-.28 5-2.69 5-6V4L8 2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M5.5 8l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconAudit() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M5 6h6M5 8.5h4M5 11h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function IconClock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5V8l2.5 2" strokeLinecap="round" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.76 3.76l.7.7M11.54 11.54l.7.7M3.76 12.24l.7-.7M11.54 4.46l.7-.7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-2 2-2-2H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  )
}

function IconGroups() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="10.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M1 13c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
      <path d="M10.5 9.5c1.933 0 3.5 1.343 3.5 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function IconNetwork() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="13" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M8 4.5v2M8 6.5L3 10.5M8 6.5L13 10.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function IconHook() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h4v2H5v6a3 3 0 0 0 6 0V5h-2V3h4v2h-1v6a5 5 0 0 1-10 0V5H3V3Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  )
}

function IconWrench() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10.5 2a3.5 3.5 0 0 0-3.36 4.47L2.5 11.09A1.5 1.5 0 1 0 4.91 13.5l4.62-4.64A3.5 3.5 0 1 0 10.5 2Zm0 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Match spec exactly: Overview, Agents, Skills, Brain, Connectors, Logs, Approvals, Audit
// Settings is handled separately (opens modal, not a route)
const DASHBOARD_NAV = [
  { href: '/dashboard/overview',   label: 'Overview',    Icon: IconGrid     },
  { href: '/dashboard/agents',     label: 'Agents',      Icon: IconBot      },
  { href: '/dashboard/groups',     label: 'Groups',      Icon: IconGroups   },
  { href: '/dashboard/network',    label: 'Network',     Icon: IconNetwork  },
  { href: '/dashboard/skills',     label: 'Skills',      Icon: IconPuzzle   },
  { href: '/dashboard/tools',      label: 'Tools',       Icon: IconWrench   },
  { href: '/dashboard/hooks',      label: 'Hooks',       Icon: IconHook     },
  { href: '/dashboard/brain',      label: 'Brain',       Icon: IconBrain    },
  { href: '/dashboard/messaging',  label: 'Messaging',   Icon: IconMessage  },
  { href: '/dashboard/logs',       label: 'Logs',        Icon: IconScroll   },
  { href: '/dashboard/approvals',  label: 'Approvals',   Icon: IconShield   },
  { href: '/dashboard/audit',      label: 'Audit',       Icon: IconAudit    },
  { href: '/dashboard/schedules',  label: 'Schedules',   Icon: IconClock    },
  { href: '/dashboard/mcp',        label: 'MCP',         Icon: IconLink     },
]

interface SidebarProps {
  mode: 'conversations' | 'dashboard'
  collapsed: boolean
  onToggleCollapsed: () => void
  onSwitchMode: (mode: 'conversations' | 'dashboard') => void
}

export function Sidebar({ mode, collapsed, onToggleCollapsed, onSwitchMode }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme, toggleMode } = useTheme()
  const isDark = getThemeMeta(theme).mode === 'dark'
  const [sessionList, setSessionList] = useState<SessionSummary[]>([])
  const [search, setSearch] = useState('')
  const [themePicker, setThemePicker] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleThemePointerDown() {
    longPressTimer.current = setTimeout(() => setThemePicker(true), 500)
  }
  function handleThemePointerUp() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  useEffect(() => {
    if (mode === 'conversations') {
      sessions.list({ limit: 50 }).then(r => setSessionList(r.sessions)).catch(() => {})
    }
  }, [mode])

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  async function deleteSession(id: string) {
    try {
      await sessions.delete(id)
      setSessionList(prev => prev.filter(s => s.id !== id))
    } catch { /* non-fatal */ }
  }

  async function pinSession(id: string, pinned: boolean) {
    try {
      await sessions.pin(id, pinned)
      setSessionList(prev => prev.map(s =>
        s.id === id ? { ...s, pinned, pinnedAt: pinned ? new Date().toISOString() : null } : s
      ).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        if (a.pinned && b.pinned) return (a.pinnedAt ?? '').localeCompare(b.pinnedAt ?? '')
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }))
    } catch { /* non-fatal */ }
  }

  async function renameSession(id: string, name: string) {
    try {
      await sessions.rename(id, name)
      setSessionList(prev => prev.map(s => s.id === id ? { ...s, name } : s))
    } catch { /* non-fatal */ }
    setRenamingId(null)
  }

  function sessionLabel(s: SessionSummary): string {
    if (s.name) return s.name
    return s.agentName ?? s.id
  }

  // Extract the user-editable part (after the | separator)
  function sessionUserTitle(s: SessionSummary): string {
    if (!s.name) return ''
    const idx = s.name.indexOf(' | ')
    return idx >= 0 ? s.name.slice(idx + 3) : s.name
  }

  function sessionAgentPrefix(s: SessionSummary): string {
    if (!s.name) return s.agentName ?? ''
    const idx = s.name.indexOf(' | ')
    return idx >= 0 ? s.name.slice(0, idx) : ''
  }

  const filtered = search.trim()
    ? sessionList.filter(s =>
        sessionLabel(s).toLowerCase().includes(search.toLowerCase())
      )
    : sessionList

  // Group sessions by recency (pinned sessions skip grouping)
  function groupLabel(updatedAt: string): string {
    const now = new Date()
    const d = new Date(updatedAt)
    const diff = (now.getTime() - d.getTime()) / 1000 / 60 / 60 / 24
    if (diff < 1) return 'Today'
    if (diff < 2) return 'Yesterday'
    if (diff < 7) return 'This week'
    return 'Older'
  }

  const W = collapsed ? '56px' : '300px'

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside style={{
      width: W, minWidth: W, flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100%',
      transition: 'width 0.2s ease, min-width 0.2s ease',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ padding: collapsed ? '12px 0' : '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Wordmark + collapse toggle */}
        {collapsed ? (
          /* Collapsed: just the sparkle logo — click to expand */
          <button
            onClick={onToggleCollapsed}
            title="Expand sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', justifyContent: 'center', width: '100%' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
              <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" fill="currentColor"/>
              <path d="M19 3L19.75 5.25L22 6L19.75 6.75L19 9L18.25 6.75L16 6L18.25 5.25L19 3Z" fill="currentColor" opacity="0.7"/>
              <path d="M5 15L5.75 17.25L8 18L5.75 18.75L5 21L4.25 18.75L2 18L4.25 17.25L5 15Z" fill="currentColor" opacity="0.5"/>
            </svg>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '6px' }}>
                <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" fill="currentColor"/>
                <path d="M19 3L19.75 5.25L22 6L19.75 6.75L19 9L18.25 6.75L16 6L18.25 5.25L19 3Z" fill="currentColor" opacity="0.7"/>
                <path d="M5 15L5.75 17.25L8 18L5.75 18.75L5 21L4.25 18.75L2 18L4.25 17.25L5 15Z" fill="currentColor" opacity="0.5"/>
              </svg>
              <span style={{ fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', userSelect: 'none' }}>
                Agency
              </span>
            </div>
            <button
              onClick={onToggleCollapsed}
              title="Collapse sidebar"
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer',
                color: 'var(--text-primary)', padding: '6px 8px', display: 'flex', borderRadius: '8px',
              }}
            >
              <IconChevronLeft />
            </button>
          </div>
        )}

        {/* Mode toggle — hidden when collapsed */}
        {!collapsed && (
          <div style={{
            display: 'flex', gap: '4px', background: 'var(--bg-elevated)',
            borderRadius: '10px', padding: '3px',
          }}>
            {(['conversations', 'dashboard'] as const).map(m => (
              <button
                key={m}
                onClick={() => onSwitchMode(m)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '14px', fontWeight: mode === m ? 600 : 400, transition: 'all 0.15s',
                  background: mode === m ? 'var(--bg-base)' : 'transparent',
                  color: mode === m ? 'var(--text-primary)' : '#ffffff',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                {m === 'conversations' ? 'Chat' : 'Dashboard'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {mode === 'conversations' ? (
          // ── Conversations mode ──
          <div style={{ padding: collapsed ? '10px 0' : '10px' }}>
            {!collapsed && (
              <>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search conversations…"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                    marginBottom: '8px', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => { window.dispatchEvent(new CustomEvent('agency:new-conversation')) }}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px', marginBottom: '8px',
                    border: '1px dashed var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  + New conversation
                </button>
              </>
            )}
            {/* Session list */}
            {/* Pinned section header */}
            {!collapsed && filtered.some(s => s.pinned) && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 6px 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pinned
              </p>
            )}
            {filtered.map((s, i) => {
              const label = s.pinned ? 'Pinned' : groupLabel(s.updatedAt ?? s.createdAt ?? '')
              const prevS = filtered[i - 1]
              const prevLabel = prevS ? (prevS.pinned ? 'Pinned' : groupLabel(prevS.updatedAt ?? prevS.createdAt ?? '')) : null
              const showHeader = !collapsed && label !== prevLabel && label !== 'Pinned'
              const isMenuOpen = menuOpenId === s.id
              const isRenaming = renamingId === s.id
              const displayLabel = sessionLabel(s)

              return (
                <div key={s.id} style={{ position: 'relative' }}>
                  {showHeader && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 6px 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {label}
                    </p>
                  )}
                  <div
                    className="session-item"
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', borderRadius: '8px' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'
                      const btn = (e.currentTarget as HTMLElement).querySelector('.menu-btn') as HTMLElement | null
                      if (btn) btn.style.opacity = '1'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'none'
                      const btn = (e.currentTarget as HTMLElement).querySelector('.menu-btn') as HTMLElement | null
                      if (btn && !isMenuOpen) btn.style.opacity = '0'
                    }}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        defaultValue={sessionUserTitle(s)}
                        style={{
                          flex: 1, padding: '6px 10px', fontSize: '14px',
                          background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
                          borderRadius: '6px', color: 'var(--text-primary)', outline: 'none',
                          margin: '2px 4px',
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim()
                            if (val) void renameSession(s.id, `${sessionAgentPrefix(s) || s.agentName || s.agentId} | ${val}`)
                            else setRenamingId(null)
                          }
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={e => {
                          const val = e.target.value.trim()
                          if (val) void renameSession(s.id, `${sessionAgentPrefix(s) || s.agentName || s.agentId} | ${val}`)
                          else setRenamingId(null)
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('agency:resume-session', { detail: s.id }))}
                        title={collapsed ? displayLabel : undefined}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                          gap: '10px', flex: 1, padding: collapsed ? '10px 0' : '8px 10px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'left',
                          overflow: 'hidden', minWidth: 0,
                        }}
                      >
                        <span style={{ flexShrink: 0, opacity: s.pinned ? 1 : 0.6, display: 'flex', color: s.pinned ? 'var(--accent)' : undefined }}>
                          {s.pinned ? <IconPin /> : <IconChat />}
                        </span>
                        {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLabel}</span>}
                      </button>
                    )}
                    {!collapsed && !isRenaming && (
                      <button
                        className="menu-btn"
                        onClick={e => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : s.id) }}
                        style={{
                          opacity: isMenuOpen ? 1 : 0, transition: 'opacity 0.1s',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: '4px 8px', flexShrink: 0,
                          fontSize: '16px', lineHeight: 1, letterSpacing: '1px',
                        }}
                      >
                        ···
                      </button>
                    )}
                    {isMenuOpen && (
                      <div
                        style={{
                          position: 'absolute', right: 0, top: '100%', zIndex: 100,
                          background: 'var(--bg-surface)', border: '1px solid var(--border)',
                          borderRadius: '8px', padding: '4px', minWidth: '160px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        }}
                        onMouseLeave={() => setMenuOpenId(null)}
                      >
                        <button
                          onClick={() => { void pinSession(s.id, !s.pinned); setMenuOpenId(null) }}
                          style={menuItemStyle}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                        >
                          {s.pinned ? '↑ Unpin' : '📌 Pin to top'}
                        </button>
                        <button
                          onClick={() => { setRenamingId(s.id); setMenuOpenId(null) }}
                          style={menuItemStyle}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                        >
                          ✏️ Rename
                        </button>
                        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                        <button
                          onClick={() => { void deleteSession(s.id); setMenuOpenId(null) }}
                          style={{ ...menuItemStyle, color: 'var(--red, #e05)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // ── Dashboard mode ──
          <nav style={{ padding: '8px 0' }}>
            {DASHBOARD_NAV.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: '10px', padding: collapsed ? '11px 0' : '9px 14px',
                    fontSize: '14px', fontWeight: active ? 500 : 400,
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    borderRight: active ? '2px solid var(--accent)' : '2px solid transparent',
                    textDecoration: 'none', transition: 'color 0.1s, background 0.1s',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.background = 'transparent' } }}
                >
                  <span style={{ opacity: active ? 1 : 0.65, display: 'flex', flexShrink: 0 }}><Icon /></span>
                  {!collapsed && label}
                </Link>
              )
            })}
            {(() => {
              const href = '/dashboard/settings'
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  href={href}
                  title={collapsed ? 'Settings' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: '10px', padding: collapsed ? '11px 0' : '9px 14px',
                    fontSize: '14px', fontWeight: active ? 500 : 400,
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    borderRight: active ? '2px solid var(--accent)' : '2px solid transparent',
                    textDecoration: 'none', transition: 'color 0.1s, background 0.1s',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.background = 'transparent' } }}
                >
                  <span style={{ opacity: active ? 1 : 0.65, display: 'flex', flexShrink: 0 }}><IconSettings /></span>
                  {!collapsed && 'Settings'}
                </Link>
              )
            })()}
          </nav>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: collapsed ? '10px 0' : '10px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: collapsed ? 'column' : 'row',
        alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
        gap: '8px', flexShrink: 0,
      }}>
        <button
          onClick={() => void signOut()}
          title="Sign out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 4V2.5h-5v7h5V8M4.5 6h6M8 4l2 2-2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && 'sign out'}
        </button>
        <button
          onClick={toggleMode}
          onPointerDown={handleThemePointerDown}
          onPointerUp={handleThemePointerUp}
          onPointerLeave={handleThemePointerUp}
          onContextMenu={e => { e.preventDefault(); setThemePicker(true) }}
          title={isDark ? 'Switch to light mode (long-press for theme picker)' : 'Switch to dark mode (long-press for theme picker)'}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent)' }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text-secondary)' }}
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.25"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12 8.5A5.5 5.5 0 0 1 5.5 2a5.5 5.5 0 1 0 6.5 6.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>
          )}
        </button>
      </div>

      {/* Theme picker popover */}
      {themePicker && (
        <div
          onClick={() => setThemePicker(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: '64px', left: collapsed ? '64px' : '192px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '8px', zIndex: 51,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)', minWidth: '200px',
            }}
          >
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 10px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme</p>
            {THEMES.map(t => (
              <button
                key={t.key}
                onClick={() => { setTheme(t.key); setThemePicker(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '8px 12px', background: theme === t.key ? 'var(--accent-dim)' : 'none',
                  border: 'none', borderRadius: '8px', cursor: 'pointer',
                  fontSize: '13px', color: theme === t.key ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { if (theme !== t.key) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                onMouseLeave={e => { if (theme !== t.key) (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                <span>{t.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t.mode}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </aside>
  )
}
