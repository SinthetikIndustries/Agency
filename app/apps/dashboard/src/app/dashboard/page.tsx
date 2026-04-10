// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import {
  health, skills, agents, discordConnector, queue,
  type HealthStatus, type Agent, type QueueStat,
} from '@/lib/api'
import Link from 'next/link'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${accent ? 'var(--border-accent)' : 'var(--border)'}`,
      borderRadius: '6px',
      padding: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {accent && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '2px',
          background: 'var(--accent)',
        }} />
      )}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        marginBottom: '8px',
      }}>{label}</p>
      <p style={{
        fontSize: '24px',
        fontWeight: 600,
        color: accent ? 'var(--accent)' : 'var(--text-primary)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>{value}</p>
      {sub && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '6px',
        }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Service Row ──────────────────────────────────────────────────────────────

function ServiceRow({ name, status }: { name: string; status: string }) {
  const isOk = status === 'ok' || status === 'connected'
  const isDisabled = status === 'disabled'
  const dotClass = isOk ? 'dot dot-green' : isDisabled ? 'dot dot-gray' : 'dot dot-red'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 0',
      borderBottom: '1px solid var(--border-dim)',
    }}>
      <span className={dotClass} style={{ animation: isOk ? 'pulse-slow 3s ease-in-out infinite' : undefined }} />
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', textTransform: 'capitalize', flex: 1 }}>
        {name}
      </span>
      <span className={`badge ${isOk ? 'badge-green' : isDisabled ? 'badge-gray' : 'badge-red'}`}>
        {status}
      </span>
    </div>
  )
}

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: '8px', height: '8px',
      borderRadius: '50%', flexShrink: 0,
      background: ok ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
    }} />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const [healthData, setHealthData] = useState<HealthStatus | null>(null)
  const [skillCount, setSkillCount] = useState(0)
  const [agentList, setAgentList] = useState<Agent[] | null>(null)
  const [discordAgents, setDiscordAgents] = useState<Array<{ slug: string; enabled: boolean }> | null>(null)
  const [queueStats, setQueueStats] = useState<QueueStat[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      health.get(),
      skills.list(),
      agents.list(),
      discordConnector.agents(),
      queue.stats(),
    ]).then(([h, sk, ag, discordAgentsRes, qRes]) => {
      if (h.status === 'fulfilled') setHealthData(h.value)
      if (sk.status === 'fulfilled') setSkillCount(sk.value.total)
      if (ag.status === 'fulfilled') setAgentList(ag.value.agents)
      if (discordAgentsRes.status === 'fulfilled') setDiscordAgents(discordAgentsRes.value.agents)
      if (qRes.status === 'fulfilled') setQueueStats(qRes.value.queues)
      setLoading(false)
    })
  }, [])

  const uptime = healthData ? formatUptime(healthData.uptime) : '—'
  const statusOk = healthData?.status === 'ok'
  const activeAgents = agentList?.filter(a => a.identity.status === 'active') ?? []
  const totalQueueActive = queueStats?.reduce((s, q) => s + q.active, 0) ?? 0
  const totalQueueFailed = queueStats?.reduce((s, q) => s + q.failed, 0) ?? 0

  const QUICK_LINKS = [
    { href: '/dashboard/chat',      label: 'Open chat'         },
    { href: '/dashboard/agents',    label: 'Manage agents'     },
    { href: '/dashboard/approvals', label: 'Approvals'         },
    { href: '/dashboard/logs',      label: 'System logs'       },
    { href: '/dashboard/grid',      label: 'Grid'              },
    { href: '/dashboard/skills',    label: 'Skills'            },
  ]

  return (
    <div style={{ padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <h1 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            margin: 0,
          }}>Overview</h1>
          {healthData && (
            <span className={`badge ${statusOk ? 'badge-green' : 'badge-amber'}`}>
              <span className={`dot ${statusOk ? 'dot-green' : 'dot-amber'}`} style={{ width: '5px', height: '5px' }} />
              {statusOk ? 'operational' : 'degraded'}
            </span>
          )}
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          Gateway health, agents, and integrations
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
        <StatCard
          label="Status"
          value={healthData?.status ?? '—'}
          sub={healthData ? `v${healthData.version}` : undefined}
          accent={statusOk}
        />
        <StatCard label="Uptime" value={uptime} />
        <StatCard
          label="Agents"
          value={agentList ? `${activeAgents.length} / ${agentList.length}` : '—'}
          sub="active / total"
        />
        <StatCard label="Skills" value={skillCount === 0 ? '—' : skillCount} />
      </div>

      {/* Quick access — full width row of 6 links */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
          {QUICK_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '7px 8px', borderRadius: '4px', textDecoration: 'none',
                fontSize: '12px', color: 'var(--text-secondary)',
                transition: 'all 0.1s', border: '1px solid transparent',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'var(--accent-dim)'
                el.style.color = 'var(--accent)'
                el.style.borderColor = 'var(--border-accent)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'transparent'
                el.style.color = 'var(--text-secondary)'
                el.style.borderColor = 'transparent'
              }}
            >
              <span>{label}</span>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ))}
        </div>
      </div>

      {/* Services + Agents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>

        {/* Services */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
          <p className="section-label" style={{ marginBottom: '12px' }}>Gateway services</p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ height: '36px', background: 'var(--bg-elevated)', borderRadius: '4px', animation: 'pulse-slow 2s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          ) : healthData?.services && Object.keys(healthData.services).length > 0 ? (
            Object.entries(healthData.services).map(([name, status]) => (
              <ServiceRow key={name} name={name} status={status} />
            ))
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No service data</p>
          )}
        </div>

        {/* Agents */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
          <p className="section-label" style={{ marginBottom: '12px' }}>
            Agents
            {agentList && (
              <span style={{ marginLeft: '8px', fontWeight: 400, color: 'var(--text-muted)' }}>{agentList.length}</span>
            )}
          </p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1,2].map(i => <div key={i} style={{ height: '28px', background: 'var(--bg-elevated)', borderRadius: '4px', animation: 'pulse-slow 2s ease-in-out infinite' }} />)}
            </div>
          ) : !agentList || agentList.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No agents found</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {agentList.map((a, i) => (
                <div key={`${a.identity.id}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                    {a.identity.name}
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '12px', fontSize: '12px', flexShrink: 0,
                    background: a.identity.status === 'active' ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)',
                    color: a.identity.status === 'active' ? '#4ade80' : 'var(--text-muted)',
                  }}>
                    {a.identity.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Discord */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '12px' }}>

        {/* Discord */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <p className="section-label" style={{ margin: 0 }}>Discord</p>
            {discordAgents && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {discordAgents.filter(a => a.enabled).length} / {discordAgents.length} enabled
              </span>
            )}
          </div>
          {loading ? (
            <div style={{ height: '60px', background: 'var(--bg-elevated)', borderRadius: '4px', animation: 'pulse-slow 2s ease-in-out infinite' }} />
          ) : !discordAgents || discordAgents.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No Discord agents configured</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {discordAgents.map(a => (
                <div key={a.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{a.slug}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
                    background: a.enabled ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)',
                    color: a.enabled ? '#4ade80' : 'var(--text-muted)',
                  }}>{a.enabled ? 'enabled' : 'disabled'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Queue stats — full width */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <p className="section-label" style={{ margin: 0 }}>Worker queues</p>
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            {totalQueueActive > 0 && <span style={{ color: '#60a5fa' }}>{totalQueueActive} active</span>}
            {totalQueueFailed > 0 && <span style={{ color: '#f87171' }}>{totalQueueFailed} failed</span>}
            {totalQueueActive === 0 && totalQueueFailed === 0 && <span style={{ color: 'var(--text-muted)' }}>idle</span>}
          </div>
        </div>
        {loading ? (
          <div style={{ height: '32px', background: 'var(--bg-elevated)', borderRadius: '4px', animation: 'pulse-slow 2s ease-in-out infinite' }} />
        ) : !queueStats ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Queue not available</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${queueStats.length}, 1fr)`, gap: '8px' }}>
            {queueStats.map(q => {
              const hasActivity = q.active + q.waiting + q.failed > 0
              const QUEUE_LABELS: Record<string, string> = {
                'queue:shell': 'Shell', 'queue:browser': 'Browser', 'queue:code': 'Code',
                'queue:planner': 'Planner', 'queue:ingestion': 'Ingestion',
              }
              return (
                <div key={q.name} style={{
                  background: hasActivity ? 'var(--bg-elevated)' : 'transparent',
                  border: `1px solid ${hasActivity ? 'var(--border)' : 'var(--border-dim)'}`,
                  borderRadius: '4px', padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                      background: q.active > 0 ? '#60a5fa' : q.failed > 0 ? '#f87171' : q.waiting > 0 ? '#facc15' : 'var(--border)',
                    }} />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {QUEUE_LABELS[q.name] ?? q.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: q.waiting > 0 ? '#facc15' : 'var(--text-muted)' }}>{q.waiting}w</span>
                    <span style={{ color: q.active > 0 ? '#60a5fa' : 'var(--text-muted)' }}>{q.active}a</span>
                    <span style={{ color: q.failed > 0 ? '#f87171' : 'var(--text-muted)' }}>{q.failed}f</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
