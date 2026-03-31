// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState, useRef, useEffect } from 'react'
import { selectGreeting, STATIC_CHIPS } from '@/lib/greetings'
import type { Agent } from '@/lib/api'

interface GreetingCenterProps {
  userName: string
  onSend: (text: string) => void
  agentList?: Agent[]
  selectedAgent?: string
  onSelectAgent?: (slug: string) => void
}

// ─── GreetingCenter ───────────────────────────────────────────────────────────

export function GreetingCenter({
  userName,
  onSend,
  agentList = [],
  selectedAgent = 'main',
  onSelectAgent,
}: GreetingCenterProps) {
  const [input, setInput] = useState('')
  const [visible, setVisible] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const greetingRef = useRef(selectGreeting(userName))

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  useEffect(() => {
    if (!dropdownOpen) return
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [dropdownOpen])

  function handleSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg) return
    setInput('')
    onSend(msg)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const currentAgent = agentList.find(a => a.identity.slug === selectedAgent)
  const agentLabel = currentAgent?.profile?.name ?? currentAgent?.identity?.name ?? selectedAgent

  const sortedAgents = [
    ...agentList.filter(a => a.identity.slug === 'main'),
    ...[...agentList.filter(a => a.identity.slug !== 'main')].sort((a, b) => {
      const nameA = (a.profile?.name ?? a.identity?.name ?? a.identity.slug).toLowerCase()
      const nameB = (b.profile?.name ?? b.identity?.name ?? b.identity.slug).toLowerCase()
      return nameA.localeCompare(nameB)
    }),
  ]

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 32px', overflow: 'hidden',
      position: 'relative',
      opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease',
    }}>

      {/* CSS blob background */}
      <div className="gc-blob gc-blob-1" />
      <div className="gc-blob gc-blob-2" />
      <div className="gc-blob gc-blob-3" />
      <div className="gc-blob gc-blob-4" />

      {/* Greeting — full width so nowrap doesn't clip */}
      <div style={{ width: '100%', textAlign: 'center', marginBottom: '24px', position: 'relative', zIndex: 1 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '27px',
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'var(--text-primary)',
          margin: 0,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>
          {greetingRef.current}
        </h1>
      </div>

      {/* Content */}
      <div style={{
        width: '100%', maxWidth: '680px',
        display: 'flex', flexDirection: 'column', gap: '24px',
        position: 'relative', zIndex: 1,
      }}>

        {/* Input box */}
        <div style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '16px',
          position: 'relative',
          boxShadow: focused
            ? '0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent), 0 8px 32px rgba(0,0,0,0.22)'
            : '0 4px 20px rgba(0,0,0,0.16)',
          transition: 'border-color 0.2s, box-shadow 0.25s',
          overflow: 'visible',
        }}>

          {/* Top edge shimmer */}
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
            background: focused
              ? 'linear-gradient(90deg, transparent, var(--accent), transparent)'
              : 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 25%, transparent), transparent)',
            opacity: focused ? 0.8 : 0.4,
            transition: 'opacity 0.3s',
            pointerEvents: 'none',
          }} />

          <textarea
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Send a message…"
            rows={3}
            style={{
              width: '100%', background: 'transparent', resize: 'none', outline: 'none',
              padding: '18px 20px 14px', fontSize: '16px', color: 'var(--text-primary)',
              lineHeight: 1.6, fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
              border: 'none',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderTop: '1px solid var(--border)',
          }}>
            {agentList.length > 1 ? (
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                {dropdownOpen && (
                  <div
                    role="listbox"
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        setDropdownOpen(false)
                        triggerRef.current?.focus()
                      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault()
                        const items = dropdownRef.current?.querySelectorAll('[role="option"]') as NodeListOf<HTMLElement>
                        if (!items?.length) return
                        const focused = document.activeElement
                        const idx = Array.from(items).indexOf(focused as HTMLElement)
                        const next = e.key === 'ArrowDown'
                          ? (idx + 1) % items.length
                          : (idx - 1 + items.length) % items.length
                        items[next]?.focus()
                      }
                    }}
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 4px)',
                      left: 0,
                      minWidth: '160px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      zIndex: 50,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                    }}
                  >
                    {sortedAgents.map((agent, idx) => {
                      const name = agent.profile?.name ?? agent.identity.name ?? agent.identity.slug
                      const isSelected = agent.identity.slug === selectedAgent
                      const isDefault = agent.identity.slug === 'main'
                      const showDivider = idx > 0 && sortedAgents[idx - 1].identity.slug === 'main'
                      return (
                        <div key={agent.identity.slug}>
                          {showDivider && (
                            <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                          )}
                          <button
                            role="option"
                            aria-selected={isSelected}
                            onMouseDown={e => {
                              e.preventDefault()
                              onSelectAgent?.(agent.identity.slug)
                              setDropdownOpen(false)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onSelectAgent?.(agent.identity.slug)
                                setDropdownOpen(false)
                                triggerRef.current?.focus()
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              textAlign: 'left',
                              padding: isDefault ? '9px 14px' : '8px 14px',
                              background: isSelected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                              color: isSelected ? 'var(--accent)' : isDefault ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontSize: '13px',
                              fontWeight: isDefault ? 600 : isSelected ? 600 : 400,
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-sans)',
                              gap: '8px',
                            }}
                            onMouseEnter={e => {
                              if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)'
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
                            }}
                          >
                            <span>{name}</span>
                            {isDefault && (
                              <span style={{
                                fontSize: '10px',
                                color: 'var(--accent)',
                                opacity: 0.7,
                                fontWeight: 500,
                                letterSpacing: '0.04em',
                                fontFamily: 'var(--font-mono)',
                              }}>
                                default
                              </span>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <button
                  ref={triggerRef}
                  onClick={() => setDropdownOpen(o => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={dropdownOpen}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setDropdownOpen(false)
                    } else if (e.key === 'ArrowDown' && !dropdownOpen) {
                      e.preventDefault()
                      setDropdownOpen(true)
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.02em',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  → {agentLabel} {dropdownOpen ? '▴' : '▾'}
                </button>
              </div>
            ) : agentList.length === 1 ? (
              <span style={{
                fontSize: '13px', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
              }}>
                → {agentLabel}
              </span>
            ) : null}
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              style={{
                background: input.trim() ? 'var(--accent)' : 'transparent',
                color: input.trim() ? 'var(--bg-base)' : 'var(--text-muted)',
                border: input.trim() ? 'none' : '1px solid var(--border)',
                borderRadius: '10px', padding: '7px 18px',
                fontSize: '14px', fontWeight: 500,
                cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s',
                boxShadow: input.trim() ? '0 2px 12px color-mix(in srgb, var(--accent) 35%, transparent)' : 'none',
              }}
            >
              Send ↵
            </button>
          </div>
        </div>

        {/* Suggestion chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {STATIC_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => handleSend(chip)}
              style={{
                padding: '6px 16px', borderRadius: '20px',
                border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
                color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--accent)'
                el.style.color = 'var(--accent)'
                el.style.boxShadow = '0 0 10px color-mix(in srgb, var(--accent) 22%, transparent)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--border)'
                el.style.color = 'var(--text-secondary)'
                el.style.boxShadow = 'none'
              }}
            >
              {chip}
            </button>
          ))}
        </div>

      </div>

      <style>{`
        .gc-blob {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }
        .gc-blob-1 {
          width: 550px; height: 550px;
          top: 5%; left: -8%;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 68%);
          animation: gc-blob1 28s ease-in-out infinite alternate;
        }
        .gc-blob-2 {
          width: 420px; height: 420px;
          bottom: 2%; right: -5%;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 68%);
          animation: gc-blob2 22s ease-in-out infinite alternate;
        }
        .gc-blob-3 {
          width: 320px; height: 320px;
          top: 40%; left: 35%;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 5%, transparent) 0%, transparent 65%);
          animation: gc-blob3 34s ease-in-out infinite alternate;
        }
        .gc-blob-4 {
          width: 380px; height: 380px;
          top: -5%; right: 10%;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 68%);
          animation: gc-blob4 26s ease-in-out infinite alternate;
        }
        @keyframes gc-blob1 {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(60px, 40px) scale(1.08); }
        }
        @keyframes gc-blob2 {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-50px, -35px) scale(1.06); }
        }
        @keyframes gc-blob3 {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(30px, -20px) scale(1.12); }
        }
        @keyframes gc-blob4 {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-40px, 50px) scale(0.93); }
        }
        @media (prefers-reduced-motion: reduce) {
          .gc-blob { animation: none; }
        }
      `}</style>
    </div>
  )
}
