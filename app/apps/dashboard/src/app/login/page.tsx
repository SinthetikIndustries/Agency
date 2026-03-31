// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, getStoredKey } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // On mount: if a key is stored, silently re-authenticate and go straight to dashboard
  useEffect(() => {
    const stored = getStoredKey()
    if (stored) {
      auth.login(stored)
        .then(() => router.replace('/dashboard'))
        .catch(() => setLoading(false)) // key no longer valid — show the form
    } else {
      setLoading(false)
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await auth.login(apiKey.trim())
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg-base)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(var(--border-dim) 1px, transparent 1px),
          linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)
        `,
        backgroundSize: '32px 32px',
        opacity: 0.5,
      }} />

      {/* Radial glow */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '40px 16px',
      }}>

        {/* Logo mark */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="var(--accent)" strokeWidth="1.5" opacity="0.3"/>
              <circle cx="24" cy="24" r="14" stroke="var(--accent)" strokeWidth="1.5" opacity="0.6"/>
              <circle cx="24" cy="24" r="6" fill="var(--accent)"/>
              <path d="M24 4v4M24 40v4M4 24h4M40 24h4" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
            </svg>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '28px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}>Agency</h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            marginTop: '6px',
          }}>AI PLATFORM — COMMAND CENTER</p>
        </div>

        {/* Auto-authenticating spinner */}
        {loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
            Authenticating...
          </div>
        )}

        {/* Login form — only shown if no stored key or stored key failed */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: loading ? 'none' : undefined,
            width: '100%',
            maxWidth: '360px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '28px',
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="agency-key-..."
              className="input"
              autoFocus
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              background: '#ef444412',
              border: '1px solid #ef444422',
              borderRadius: '4px',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--red)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!apiKey}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="10" strokeLinecap="round"/>
                </svg>
                Authenticating...
              </span>
            ) : 'Access platform'}
          </button>

          <p style={{
            marginTop: '16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            Key stored in <code style={{ color: 'var(--text-secondary)' }}>~/.agency/credentials.json</code>
          </p>
        </form>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
