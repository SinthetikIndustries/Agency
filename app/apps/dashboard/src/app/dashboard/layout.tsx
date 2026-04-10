// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ChatPanel } from '@/components/ChatPanel'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const sidebarMode: 'conversations' | 'dashboard' = pathname === '/dashboard' ? 'conversations' : 'dashboard'
  const [collapsed, setCollapsed] = useState(false)
  const lastDashboardPage = useRef('/dashboard/overview')

  // Persist collapse state
  useEffect(() => {
    const stored = localStorage.getItem('agency.sidebar.collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  // Track last visited dashboard page for returning from conversations mode
  useEffect(() => {
    if (sidebarMode === 'dashboard') {
      lastDashboardPage.current = pathname
      localStorage.setItem('agency.last-dashboard-page', pathname)
    }
  }, [pathname, sidebarMode])

  useEffect(() => {
    const stored = localStorage.getItem('agency.last-dashboard-page')
    if (stored) lastDashboardPage.current = stored
  }, [])

  function toggleCollapsed() {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem('agency.sidebar.collapsed', String(next))
      return next
    })
  }

  function switchToConversations() {
    router.push('/dashboard')
    window.dispatchEvent(new CustomEvent('agency:new-conversation'))
  }

  function switchToDashboard() {
    router.push(lastDashboardPage.current)
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Sidebar
        mode={sidebarMode}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onSwitchMode={(m) => m === 'conversations' ? switchToConversations() : switchToDashboard()}
      />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {/* Conversations mode: ChatPanel */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-base)',
          opacity: sidebarMode === 'conversations' ? 1 : 0,
          pointerEvents: sidebarMode === 'conversations' ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
          zIndex: sidebarMode === 'conversations' ? 1 : 0,
        }}>
          <ChatPanel />
        </div>
        {/* Dashboard mode: Next.js child pages */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', overflow: 'auto',
          opacity: sidebarMode === 'dashboard' ? 1 : 0,
          pointerEvents: sidebarMode === 'dashboard' ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
          zIndex: sidebarMode === 'dashboard' ? 1 : 0,
        }}>
          {children}
        </div>
      </main>
    </div>
  )
}
