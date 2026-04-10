// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { sessions, agents, agentConfig, approvals as approvalsApi, getWsToken, me, type Agent, type SessionSummary } from '@/lib/api'

import { PORTS } from '@/lib/ports'
import { TokenBar } from '@/components/TokenBar'
import { WorkspacePanel } from '@/components/WorkspacePanel'
import { GreetingCenter } from '@/components/GreetingCenter'
import { OnboardingFlow } from '@/components/OnboardingFlow'
import type { PanelState, Artifact, PlanStep, OpenTab } from '@/components/workspace/types'

// Inline style ensures the button is always visible regardless of theme CSS-variable remapping
const newSessionStyle: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
}

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? `http://localhost:${PORTS.GATEWAY}`
const GATEWAY_WS = GATEWAY_URL.replace(/^http/, 'ws')

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextPart {
  kind: 'text'
  text: string
}

interface ToolCallPart {
  kind: 'tool_call'
  toolName: string
  toolInput: Record<string, unknown>
  result?: { success: boolean; output: unknown }
  expanded: boolean
}

interface ApprovalPart {
  kind: 'approval'
  approvalId: string
  toolName: string
  command: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
}

type MessagePart = TextPart | ToolCallPart | ApprovalPart

interface ChatMessage {
  role: 'user' | 'assistant'
  parts: MessagePart[]
  done: boolean
}

// ─── Tool Call Card ───────────────────────────────────────────────────────────

function ToolCard({ part, onToggle }: { part: ToolCallPart; onToggle: () => void }) {
  const pending = !part.result
  const failed = part.result && !part.result.success
  return (
    <div style={{ display: 'inline-block', marginBottom: 6, maxWidth: '100%' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '2px 8px', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: pending ? '#eab308' : failed ? '#ef4444' : '#22c55e',
        }} />
        {part.toolName}
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{part.expanded ? '▲' : '▼'}</span>
      </button>
      {part.expanded && (
        <div style={{
          marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '10px 12px', maxHeight: 240,
          overflow: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {Object.keys(part.toolInput).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', marginBottom: 4 }}>Input</p>
              {JSON.stringify(part.toolInput, null, 2)}
            </div>
          )}
          {part.result && (
            <div>
              <p style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', marginBottom: 4 }}>Output</p>
              <span style={{ color: failed ? '#f87171' : 'var(--text-secondary)' }}>
                {typeof part.result.output === 'string'
                  ? part.result.output
                  : JSON.stringify(part.result.output, null, 2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Approval Card ───────────────────────────────────────────────────────────

function ApprovalCard({
  part,
  onDecide,
}: {
  part: ApprovalPart
  onDecide: (approvalId: string, decision: 'approve' | 'reject') => void
}) {
  const isPending = part.status === 'pending'
  return (
    <div style={{
      marginBottom: 8,
      background: 'var(--bg-elevated)',
      border: `1px solid ${isPending ? '#b45309' : part.status === 'approved' ? '#15803d' : '#991b1b'}`,
      borderRadius: 8,
      padding: '10px 14px',
      maxWidth: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: isPending ? '#eab308' : part.status === 'approved' ? '#22c55e' : '#ef4444',
        }} />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {isPending ? 'Awaiting approval' : part.status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>· {part.toolName}</span>
      </div>
      {part.command && (
        <pre style={{
          margin: '0 0 8px', padding: '6px 10px',
          background: 'var(--bg-base)', borderRadius: 4,
          fontSize: 12, fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          border: '1px solid var(--border)',
        }}>{part.command}</pre>
      )}
      {part.reason && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{part.reason}</p>
      )}
      {isPending && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onDecide(part.approvalId, 'approve')}
            style={{
              padding: '5px 14px', borderRadius: 6, border: 'none',
              background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            Approve
          </button>
          <button
            onClick={() => onDecide(part.approvalId, 'reject')}
            style={{
              padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: '#ef4444', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onToggleTool,
  onDecide,
}: {
  msg: ChatMessage
  onToggleTool: (partIdx: number) => void
  onDecide: (approvalId: string, decision: 'approve' | 'reject') => void
}) {
  if (msg.role === 'user') {
    const text = msg.parts.find(p => p.kind === 'text')?.text ?? ''
    return (
      <div className="flex justify-end">
        <div style={{
          maxWidth: '42rem',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-accent)',
          color: 'var(--text-primary)',
          borderRadius: '8px',
          padding: '8px 14px',
          fontSize: '17px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div style={{
        maxWidth: '42rem',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        borderRadius: '8px',
        padding: '8px 14px',
        fontSize: '17px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.parts.map((part, i) =>
          part.kind === 'text' ? (
            <span key={i}>{part.text}</span>
          ) : part.kind === 'approval' ? (
            <ApprovalCard key={i} part={part} onDecide={onDecide} />
          ) : null
        )}
        {!msg.done && (
          <span style={{ display: 'inline-block', width: '6px', height: '16px', background: 'var(--accent)', opacity: 0.7, animation: 'pulse 1s infinite', marginLeft: '2px', verticalAlign: 'middle', borderRadius: '1px' }} />
        )}
      </div>
    </div>
  )
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [sessionHistory, setSessionHistory] = useState<SessionSummary[]>([])
  const [selectedAgent, setSelectedAgent] = useState('main')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number; contextWindow: number; model: string } | null>(null)
  const [tokenBarVisible, setTokenBarVisible] = useState(false)
  const [agentSystemPrompt, setAgentSystemPrompt] = useState('')
  const [meData, setMeData] = useState<{ name: string; onboarded: boolean } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingInputRef = useRef<string>('')
  const startingRef = useRef(false)

  // Workspace panel state
  const [artifacts, setArtifacts] = useState<Map<string, Artifact>>(new Map())
  const [panel, setPanel] = useState<PanelState>({ mode: null, openTabs: [] })
  const [shellLines, setShellLines] = useState<string[]>([])
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([])
  const [awaySummary, setAwaySummary] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const artifactReceivedRef = useRef(false)

  function upsertArtifact(data: { artifactId: string; mimeType: string; title: string; content: string }) {
    setArtifacts(prev => {
      const map = new Map(prev)
      const existing = map.get(data.artifactId)
      if (existing) {
        const versions = [...existing.versions, { content: data.content, timestamp: Date.now() }]
        map.set(data.artifactId, { ...existing, versions, activeVersion: versions.length - 1 })
      } else {
        map.set(data.artifactId, {
          id: data.artifactId,
          mimeType: data.mimeType,
          title: data.title,
          versions: [{ content: data.content, timestamp: Date.now() }],
          activeVersion: 0,
        })
      }
      return map
    })
  }

  function openArtifactTab(artifactId: string, title: string, mimeType: string) {
    setPanel(prev => {
      const exists = prev.openTabs.find(t => t.artifactId === artifactId)
      const newTab: OpenTab = { artifactId, title, mimeType }
      const openTabs = exists ? prev.openTabs : [...prev.openTabs, newTab]
      const mode = mimeType === 'text/csv' || mimeType === 'application/json' ? 'data-table' as const
        : (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') ? 'image' as const
        : 'canvas' as const
      return { ...prev, mode, artifactId, activeTabId: artifactId, openTabs }
    })
  }

  function detectFencedBlocks(text: string) {
    const fenceMap: Record<string, string> = {
      html: 'text/html',
      jsx: 'application/vnd.react',
      tsx: 'application/vnd.react',
      mermaid: 'application/vnd.mermaid',
      svg: 'image/svg+xml',
      json: 'application/json',
    }
    const re = /```(\w+)\n([\s\S]*?)```/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const lang = (m[1] ?? '').toLowerCase()
      const content = m[2] ?? ''
      const mimeType = fenceMap[lang]
      if (mimeType && content.trim()) {
        const artifactId = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        upsertArtifact({ artifactId, mimeType, title: lang.toUpperCase(), content })
        openArtifactTab(artifactId, lang.toUpperCase(), mimeType)
      }
    }
  }

  // Load token bar preference after mount (SSR-safe)
  useEffect(() => {
    setTokenBarVisible(localStorage.getItem('agency-token-bar-visible') === 'true')
  }, [])

  useEffect(() => {
    me.get().then(setMeData).catch(() => setMeData({ name: '', onboarded: true }))
  }, [])

  useEffect(() => {
    agents.list()
      .then(r => setAgentList(r.agents.filter(a => a.identity.status === 'active')))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load agents — check login'))
    loadHistory()
  }, [])

  function loadHistory() {
    sessions.list({ limit: 30 })
      .then(r => setSessionHistory(r.sessions))
      .catch(() => {})
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup WebSocket on unmount only — startSession handles closing on session change
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  async function startSession() {
    wsRef.current?.close()
    wsRef.current = null
    setSessionId(null)
    setMessages([])
    setError('')
    setSending(false)
    setArtifacts(new Map())
    setPanel({ mode: null, openTabs: [] })
    setAwaySummary(null)
    setSuggestions([])

    try {
      const res = await sessions.create(selectedAgent, 'dashboard')
      const sid = res.session.id
      setSessionId(sid)
      agentConfig.list(selectedAgent).then(r => {
        const ALWAYS = ['identity', 'soul', 'user', 'capabilities']
        const text = ALWAYS.map(t => r.files.find(f => f.file_type === t)?.content ?? '').filter(Boolean).join('\n\n---\n\n')
        setAgentSystemPrompt(text || (r.files.find(f => f.file_type === 'identity')?.content ?? ''))
      }).catch(() => agents.get(selectedAgent).then(r => setAgentSystemPrompt(r.agent.profile?.systemPrompt ?? '')).catch(() => {}))
      openWebSocket(sid)
      loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  async function resumeSession(sid: string) {
    wsRef.current?.close()
    wsRef.current = null
    setMessages([])
    setError('')
    setSending(false)
    setSessionId(sid)
    // Load agent info from session history if available
    const sessionEntry = sessionHistory.find(s => s.id === sid)
    const agentSlug = sessionEntry?.agentSlug ?? selectedAgent
    agentConfig.list(agentSlug).then(r => {
      const ALWAYS = ['identity', 'soul', 'user', 'capabilities']
      const text = ALWAYS.map(t => r.files.find(f => f.file_type === t)?.content ?? '').filter(Boolean).join('\n\n---\n\n')
      setAgentSystemPrompt(text || (r.files.find(f => f.file_type === 'identity')?.content ?? ''))
    }).catch(() => agents.get(agentSlug).then(r => setAgentSystemPrompt(r.agent.profile?.systemPrompt ?? '')).catch(() => {}))
    await loadSessionMessages(sid)
    openWebSocket(sid)
  }

  const openWebSocket = useCallback((sid: string) => {
    const token = getWsToken()
    const wsUrl = token
      ? `${GATEWAY_WS}/sessions/${sid}?token=${encodeURIComponent(token)}`
      : `${GATEWAY_WS}/sessions/${sid}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      const pending = pendingInputRef.current
      if (pending) {
        pendingInputRef.current = ''
        setMessages(prev => [...prev, { role: 'user', done: true, parts: [{ kind: 'text', text: pending }] }])
        setSending(true)
        ws.send(JSON.stringify({ content: pending }))
      }
    }

    ws.onmessage = (e) => {
      let chunk: {
        type: string
        text?: string
        toolName?: string
        toolInput?: Record<string, unknown>
        success?: boolean
        output?: unknown
        error?: string
        inputTokens?: number
        outputTokens?: number
        contextWindow?: number
        model?: string
        approvalId?: string
        command?: string
        reason?: string
      }
      try { chunk = JSON.parse(e.data as string) as typeof chunk } catch { return }

      if (chunk.type === 'away_summary') {
        setAwaySummary(chunk.text ?? null)
        return
      }

      // Handle token_usage outside setMessages — it's independent state
      if (chunk.type === 'token_usage') {
        setTokenUsage({
          inputTokens: chunk.inputTokens ?? 0,
          outputTokens: chunk.outputTokens ?? 0,
          contextWindow: chunk.contextWindow ?? 200000,
          model: chunk.model ?? '',
        })
        return
      }

      // Workspace panel events
      if (chunk.type === 'artifact') {
        artifactReceivedRef.current = true
        const d = chunk as { type: 'artifact'; artifactId: string; mimeType: string; title: string; content: string }
        upsertArtifact(d)
        openArtifactTab(d.artifactId, d.title, d.mimeType)
        return
      }
      if (chunk.type === 'file_tree') {
        const d = chunk as { type: 'file_tree'; agentSlug: string }
        setPanel(p => ({ ...p, mode: 'file-explorer', agentSlug: d.agentSlug }))
        return
      }
      if (chunk.type === 'file_diff') {
        const d = chunk as { type: 'file_diff'; path: string; before: string; after: string }
        setPanel(p => ({ ...p, mode: 'diff', diffPath: d.path, diffBefore: d.before, diffAfter: d.after }))
        return
      }
      if (chunk.type === 'shell_output') {
        const d = chunk as { type: 'shell_output'; output: string }
        setShellLines(lines => [...lines, ...d.output.split('\n')])
        setPanel(p => ({ ...p, mode: 'terminal' }))
        return
      }
      if (chunk.type === 'web_preview') {
        const d = chunk as { type: 'web_preview'; url: string; title: string; content: string; contentType: 'html' | 'screenshot' }
        setPanel(p => ({ ...p, mode: 'web-preview', webUrl: d.url, webTitle: d.title, webContent: d.content, webContentType: d.contentType }))
        return
      }
      if (chunk.type === 'plan') {
        const d = chunk as { type: 'plan'; steps: PlanStep[] }
        setPlanSteps(d.steps)
        setPanel(p => ({ ...p, mode: 'plan' }))
        return
      }

      setMessages(prev => {
        const msgs = [...prev]
        const last = msgs[msgs.length - 1]

        if (!last || last.role !== 'assistant' || last.done) {
          // Start a new assistant message
          if (chunk.type === 'text') {
            msgs.push({ role: 'assistant', done: false, parts: [{ kind: 'text', text: chunk.text ?? '' }] })
          } else if (chunk.type === 'tool_call') {
            msgs.push({ role: 'assistant', done: false, parts: [{ kind: 'tool_call', toolName: chunk.toolName ?? '', toolInput: chunk.toolInput ?? {}, expanded: false }] })
          } else if (chunk.type === 'approval_pending') {
            msgs.push({ role: 'assistant', done: false, parts: [{ kind: 'approval', approvalId: chunk.approvalId ?? '', toolName: chunk.toolName ?? '', command: chunk.command ?? '', reason: chunk.reason ?? '', status: 'pending' }] })
          }
          return msgs
        }

        const updated = { ...last, parts: [...last.parts] }

        if (chunk.type === 'text') {
          const lastPart = updated.parts[updated.parts.length - 1]
          if (lastPart?.kind === 'text') {
            updated.parts[updated.parts.length - 1] = { kind: 'text', text: lastPart.text + (chunk.text ?? '') }
          } else {
            updated.parts.push({ kind: 'text', text: chunk.text ?? '' })
          }
        } else if (chunk.type === 'tool_call') {
          updated.parts.push({ kind: 'tool_call', toolName: chunk.toolName ?? '', toolInput: chunk.toolInput ?? {}, expanded: false })
        } else if (chunk.type === 'approval_pending') {
          updated.parts.push({ kind: 'approval', approvalId: chunk.approvalId ?? '', toolName: chunk.toolName ?? '', command: chunk.command ?? '', reason: chunk.reason ?? '', status: 'pending' })
        } else if (chunk.type === 'tool_result') {
          // Find the last tool_call part without a result
          for (let i = updated.parts.length - 1; i >= 0; i--) {
            const p = updated.parts[i]
            if (p.kind === 'tool_call' && !p.result) {
              updated.parts[i] = { ...p, result: { success: chunk.success ?? false, output: chunk.output } }
              break
            }
          }
        } else if (chunk.type === 'done') {
          updated.done = true
          setSending(false)
          // Fallback: promote fenced code blocks if no explicit artifact events this turn
          if (!artifactReceivedRef.current) {
            const fullText = updated.parts.filter(p => p.kind === 'text').map(p => (p as { kind: 'text'; text: string }).text).join('')
            detectFencedBlocks(fullText)
          }
          artifactReceivedRef.current = false
          // Fetch prompt suggestions async after response completes
          if (sid) {
            sessions.suggestions(sid).then(data => setSuggestions(data.suggestions ?? [])).catch(() => {})
          }
        } else if (chunk.type === 'error') {
          updated.done = true
          updated.parts.push({ kind: 'text', text: `\n[Error: ${chunk.error}]` })
          setSending(false)
          setError(chunk.error ?? 'Unknown error')
        }

        msgs[msgs.length - 1] = updated
        return msgs
      })
    }

    ws.onerror = () => {
      setError('WebSocket error — try starting a new session')
      setSending(false)
    }

    ws.onclose = () => {
      setSending(false)
    }
  }, [])

  function sendMessage() {
    if (!input.trim() || !sessionId || sending || !wsRef.current) return
    if (wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Connection lost — start a new session')
      return
    }

    const content = input.trim()
    setInput('')
    setError('')
    setSending(true)
    setSuggestions([])

    // /clear clears local message history too (gateway will handle server-side reset)
    if (content === '/clear') {
      setMessages([])
    } else {
      setMessages(prev => [...prev, { role: 'user', done: true, parts: [{ kind: 'text', text: content }] }])
    }
    wsRef.current.send(JSON.stringify({ content }))
  }

  function toggleTool(msgIdx: number, partIdx: number) {
    setMessages(prev => {
      const msgs = [...prev]
      const msg = msgs[msgIdx]
      if (!msg) return prev
      const parts = [...msg.parts]
      const part = parts[partIdx]
      if (part?.kind !== 'tool_call') return prev
      parts[partIdx] = { ...part, expanded: !part.expanded }
      msgs[msgIdx] = { ...msg, parts }
      return msgs
    })
  }

  async function handleDecide(approvalId: string, decision: 'approve' | 'reject') {
    // Optimistically update the approval card status
    setMessages(prev => prev.map(msg => ({
      ...msg,
      parts: msg.parts.map(p =>
        p.kind === 'approval' && p.approvalId === approvalId
          ? { ...p, status: decision === 'approve' ? 'approved' : 'rejected' } as ApprovalPart
          : p
      ),
    })))
    try {
      if (decision === 'approve') {
        await approvalsApi.approve(approvalId)
      } else {
        await approvalsApi.reject(approvalId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval action failed')
    }
  }

  async function loadSessionMessages(sid: string) {
    try {
      const res = await sessions.messages(sid)
      const loaded: ChatMessage[] = res.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        done: true,
        parts: [{ kind: 'text' as const, text: m.content }],
      }))
      setMessages(loaded)
    } catch {
      // Non-fatal — session may be empty
    }
  }

  async function deleteSession(sid: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await sessions.delete(sid)
      if (sessionId === sid) {
        wsRef.current?.close()
        wsRef.current = null
        setSessionId(null)
        setMessages([])
      }
      loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Stable refs so event listeners always call the latest version of these functions
  const startSessionRef = useRef(startSession)
  const resumeSessionRef = useRef(resumeSession)
  useEffect(() => {
    startSessionRef.current = startSession
    resumeSessionRef.current = resumeSession
  })

  // Sidebar custom event listeners
  useEffect(() => {
    function handleNew() {
      wsRef.current?.close()
      wsRef.current = null
      setSessionId(null)
      setMessages([])
      setError('')
      setSending(false)
      setArtifacts(new Map())
      setPanel({ mode: null, openTabs: [] })
    }
    function handleResume(e: Event) { void resumeSessionRef.current((e as CustomEvent<string>).detail) }
    window.addEventListener('agency:new-conversation', handleNew)
    window.addEventListener('agency:resume-session', handleResume)
    return () => {
      window.removeEventListener('agency:new-conversation', handleNew)
      window.removeEventListener('agency:resume-session', handleResume)
    }
  }, [])

  if (meData && !meData.onboarded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <OnboardingFlow onComplete={() => {
          me.get().then(setMeData).catch(() => {})
          window.dispatchEvent(new CustomEvent('agency:new-conversation'))
        }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        {/* Main chat panel */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

        {/* Session header — only shown when a session is active */}
        {sessionId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {sessionId.slice(0, 8)}
          </span>
          <button
            onClick={() => {
              const next = !tokenBarVisible
              setTokenBarVisible(next)
              localStorage.setItem('agency-token-bar-visible', String(next))
            }}
            title={tokenBarVisible ? 'Hide token usage' : 'Show token usage'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', borderRadius: '4px', color: tokenBarVisible ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            ▦ tokens
          </button>
          <button
            onClick={() => setPanel(p => ({ ...p, mode: p.mode === 'file-explorer' ? null : 'file-explorer', agentSlug: selectedAgent }))}
            title="Toggle file explorer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', borderRadius: '4px', color: panel.mode === 'file-explorer' ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            📁 files
          </button>
        </div>
        )}

        {/* Greeting state — shown when no active session; wait for meData so greetingRef captures real name */}
        {!sessionId && meData !== null && (
          <GreetingCenter
            userName={meData.name}
            agentList={agentList}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
            onSend={(text) => {
              if (startingRef.current) return
              startingRef.current = true
              pendingInputRef.current = text
              void startSession().finally(() => { startingRef.current = false })
            }}
          />
        )}

        {/* Messages */}
        {sessionId && <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, msgIdx) => (
            <MessageBubble
              key={msgIdx}
              msg={msg}
              onToggleTool={partIdx => toggleTool(msgIdx, partIdx)}
              onDecide={handleDecide}
            />
          ))}
          {tokenUsage && sessionId && (() => {
            const pct = (tokenUsage.inputTokens / tokenUsage.contextWindow) * 100
            if (pct >= 95) return (
              <div style={{ margin: '0 24px 8px', padding: '8px 16px', background: 'rgba(127,29,29,0.3)', border: '1px solid rgba(185,28,28,0.5)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#f87171' }}>Context window almost full.</span>
                <button onClick={() => void startSession()} style={{ fontSize: '12px', color: '#fca5a5', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>New session</button>
              </div>
            )
            if (pct >= 80) return (
              <div style={{ margin: '0 24px 8px', padding: '8px 16px', background: 'rgba(120,53,15,0.2)', border: '1px solid rgba(180,83,9,0.4)', borderRadius: '6px', fontSize: '12px', color: '#fbbf24' }}>
                Context window is getting full — consider starting a new session.
              </div>
            )
            return null
          })()}
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          <div ref={messagesEndRef} />
        </div>}

        {/* Token Bar */}
        {sessionId && tokenBarVisible && (
          <TokenBar
            messages={messages}
            inputValue={input}
            systemPrompt={agentSystemPrompt}
            tokenUsage={tokenUsage}
          />
        )}

        {/* Away summary banner */}
        {awaySummary && (
          <div style={{ padding: '8px 20px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1 }}>{awaySummary}</span>
            <button onClick={() => setAwaySummary(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Input — only shown when a session is active */}
        {sessionId && (
          <div style={{ padding: '14px 20px', borderTop: awaySummary ? 'none' : '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
            {/* Suggestion chips */}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); setSuggestions([]) }}
                    style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px',
                      padding: '4px 12px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                placeholder="Send a message… (Enter to send, Shift+Enter for newline)"
                rows={2}
                style={{
                  flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px',
                  fontSize: '15px', color: 'var(--text-primary)', padding: '10px 14px',
                  outline: 'none', resize: 'none', opacity: sending ? 0.5 : 1, fontFamily: 'inherit',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
              {sending ? (
                <button
                  onClick={() => wsRef.current?.send(JSON.stringify({ type: 'cancel' }))}
                  style={{
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                    borderRadius: '10px', fontSize: '14px', fontWeight: 500, padding: '0 20px', cursor: 'pointer',
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  style={{
                    background: 'var(--accent)', color: 'var(--bg-base)', border: 'none', borderRadius: '10px',
                    fontSize: '14px', fontWeight: 500, padding: '0 20px', cursor: 'pointer',
                    opacity: !input.trim() ? 0.4 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Workspace Panel */}
        <WorkspacePanel
          panel={panel}
          artifacts={artifacts}
          shellLines={shellLines}
          planSteps={planSteps}
          onClose={() => setPanel(p => ({ ...p, mode: null }))}
          onSwitchTab={(artifactId) => {
            const artifact = artifacts.get(artifactId)
            if (!artifact) return
            const mode = artifact.mimeType === 'text/csv' ? 'data-table'
              : artifact.mimeType.startsWith('image/') && artifact.mimeType !== 'image/svg+xml' ? 'image'
              : 'canvas'
            setPanel(p => ({ ...p, mode: mode as PanelState['mode'], artifactId, activeTabId: artifactId }))
          }}
          onCloseTab={(artifactId) => {
            setPanel(p => {
              const openTabs = p.openTabs.filter(t => t.artifactId !== artifactId)
              if (openTabs.length === 0) return { ...p, mode: null, openTabs: [], artifactId: undefined, activeTabId: undefined }
              const newActive = p.activeTabId === artifactId ? openTabs[openTabs.length - 1]!.artifactId : p.activeTabId
              return { ...p, openTabs, activeTabId: newActive, artifactId: newActive }
            })
          }}
          onSwitchVersion={(artifactId, version) => {
            setArtifacts(prev => {
              const map = new Map(prev)
              const a = map.get(artifactId)
              if (a) map.set(artifactId, { ...a, activeVersion: version })
              return map
            })
          }}
        />
      </div>
    </div>
  )
}
