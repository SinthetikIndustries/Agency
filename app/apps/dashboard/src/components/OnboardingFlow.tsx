// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState, useMemo } from 'react'
import { onboarding } from '@/lib/api'

// A minimal list of countries for the dropdown.
const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'SG', name: 'Singapore' },
  { code: 'NZ', name: 'New Zealand' },
  // Note: comment says "add full ISO country list" — keeping minimal for now
]

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming']
const CA_PROVINCES = ['Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon']
const AU_STATES = ['Australian Capital Territory','New South Wales','Northern Territory','Queensland','South Australia','Tasmania','Victoria','Western Australia']

const AUTONOMY_OPTIONS = [
  { value: 'supervised', label: 'Supervised', desc: 'Ask before every action' },
  { value: 'balanced',   label: 'Balanced',   desc: 'Ask for significant actions only' },
  { value: 'autonomous', label: 'Autonomous', desc: 'Act independently, report after' },
]

interface OnboardingFormData {
  name: string; sex: string; timezone: string
  country: string; state: string; city: string
  role: string; autonomy: string; goals: string
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Step {step} of {total}</span>
      </div>
      <div style={{ height: '3px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${(step / total) * 100}%`, background: 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 500 }}>{children}</label>
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
      onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }}
      onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)' }}
    />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
    >
      {children}
    </select>
  )
}

export function OnboardingFlow({ onComplete }: { onComplete: (sessionId: string) => void }) {
  const timezoneOptions = useMemo(() => Intl.supportedValuesOf('timeZone'), [])
  const [step, setStep] = useState(0) // 0=welcome, 1-4=form steps
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<OnboardingFormData>({
    name: '', sex: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    country: 'US', state: '', city: '',
    role: '', autonomy: 'balanced', goals: '',
  })

  function set(field: keyof OnboardingFormData) {
    return (value: string) => setData(prev => ({ ...prev, [field]: value }))
  }

  function stateOptions() {
    if (data.country === 'US') return US_STATES
    if (data.country === 'CA') return CA_PROVINCES
    if (data.country === 'AU') return AU_STATES
    return null
  }

  async function handleFinish() {
    setSubmitting(true)
    setError('')
    try {
      const result = await onboarding.submit(data)
      setSubmitting(false)
      onComplete(result.sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed. Please try again.')
      setSubmitting(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    width: '100%', maxWidth: '480px', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: '16px', padding: '32px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
  }

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)', color: 'var(--bg-base)', border: 'none',
    borderRadius: '8px', padding: '10px 24px', fontSize: '14px',
    fontWeight: 500, cursor: 'pointer', transition: 'opacity 0.15s',
  }

  // Step 0: Welcome
  if (step === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Welcome to Agency</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '28px' }}>
            Let's take a moment to set things up so your agent can get to know you. This takes about a minute.
          </p>
          <button style={btnStyle} onClick={() => setStep(1)}>Get started →</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', overflow: 'auto' }}>
      <div style={cardStyle}>
        <ProgressBar step={step} total={4} />

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>About you</h2>
            <div>
              <Label>Name</Label>
              <Input value={data.name} onChange={set('name')} placeholder="Your name" />
            </div>
            <div>
              <Label>Sex</Label>
              <Select value={data.sex} onChange={set('sex')}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Location</h2>
            <div>
              <Label>Country</Label>
              <Select value={data.country} onChange={v => setData(d => ({ ...d, country: v, state: '' }))}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>State / Province</Label>
              {(() => {
                const opts = stateOptions()
                return opts ? (
                  <Select value={data.state} onChange={set('state')}>
                    <option value="">Select…</option>
                    {opts.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                ) : (
                  <Input value={data.state} onChange={set('state')} placeholder="State or province" />
                )
              })()}
            </div>
            <div>
              <Label>City</Label>
              <Input value={data.city} onChange={set('city')} placeholder="City" />
            </div>
            <div>
              <Label>Timezone</Label>
              <Select value={data.timezone} onChange={set('timezone')}>
                {timezoneOptions.map((tz: string) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </Select>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Auto-detected from your browser. Change if incorrect.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Role & Autonomy</h2>
            <div>
              <Label>Primary role</Label>
              <Input value={data.role} onChange={set('role')} placeholder="e.g. Software Engineer, Founder, Designer…" />
            </div>
            <div>
              <Label>How should your agent work?</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {AUTONOMY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('autonomy')(opt.value)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      padding: '12px 14px', border: `1px solid ${data.autonomy === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '8px', background: data.autonomy === opt.value ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 500, color: data.autonomy === opt.value ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Goals</h2>
            <div>
              <Label>What do you hope to accomplish with Agency?</Label>
              <textarea
                value={data.goals}
                onChange={e => set('goals')(e.target.value)}
                placeholder="I want to…"
                rows={4}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }}
                onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)' }}
              />
            </div>
            {error && <p style={{ fontSize: '12px', color: 'var(--error, #ef4444)' }}>{error}</p>}
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px' }}>
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              ← Back
            </button>
          ) : <div />}

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !data.name.trim()}
              style={{ ...btnStyle, opacity: (step === 1 && !data.name.trim()) ? 0.4 : 1 }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={() => void handleFinish()}
              disabled={submitting}
              style={{ ...btnStyle, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Setting up…' : 'Finish setup →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
