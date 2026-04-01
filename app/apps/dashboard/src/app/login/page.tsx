// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, getStoredKey } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredKey()
    if (stored) {
      auth.login(stored)
        .then(() => router.replace('/dashboard'))
        .catch(() => setLoading(false))
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
      alignItems: 'center',
      justifyContent: 'center',
      background: '#060B14',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Deep ambient glows ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
      }}>
        {/* Teal glow — top-right */}
        <div style={{
          position: 'absolute', top: '-15%', right: '-10%',
          width: '55vw', height: '55vw',
          background: 'radial-gradient(circle, rgba(6,214,200,0.13) 0%, transparent 65%)',
          borderRadius: '50%',
        }} />
        {/* Purple glow — bottom-left */}
        <div style={{
          position: 'absolute', bottom: '-15%', left: '-10%',
          width: '50vw', height: '50vw',
          background: 'radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 65%)',
          borderRadius: '50%',
        }} />
        {/* Blue center glow — behind form */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '60vw', height: '60vw',
          background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />
      </div>

      {/* ── Angular geometry — background facets ───────────────────── */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 900"
      >
        {/* top-left triangle */}
        <polygon points="0,0 320,0 0,280"
          fill="none" stroke="rgba(6,214,200,0.06)" strokeWidth="1" />
        <polygon points="0,0 180,0 0,160"
          fill="rgba(6,214,200,0.025)" />
        {/* top-right */}
        <polygon points="1440,0 1100,0 1440,320"
          fill="none" stroke="rgba(147,51,234,0.06)" strokeWidth="1" />
        <polygon points="1440,0 1260,0 1440,180"
          fill="rgba(147,51,234,0.025)" />
        {/* bottom-left */}
        <polygon points="0,900 0,600 280,900"
          fill="none" stroke="rgba(147,51,234,0.06)" strokeWidth="1" />
        {/* bottom-right */}
        <polygon points="1440,900 1440,640 1160,900"
          fill="none" stroke="rgba(6,214,200,0.06)" strokeWidth="1" />
        {/* mid diagonal lines */}
        <line x1="0" y1="450" x2="440" y2="900" stroke="rgba(37,99,235,0.04)" strokeWidth="1" />
        <line x1="1440" y1="450" x2="1000" y2="0" stroke="rgba(37,99,235,0.04)" strokeWidth="1" />
      </svg>

      {/* ── Fine dot grid ──────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />

      {/* ── Main content ───────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', maxWidth: '420px',
        padding: '0 24px',
      }}>

        {/* Logo */}
        <div style={{ marginBottom: '12px', position: 'relative' }}>
          {/* glow ring behind logo */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '160px', height: '160px',
            background: 'radial-gradient(circle, rgba(6,214,200,0.2) 0%, rgba(147,51,234,0.1) 50%, transparent 75%)',
            borderRadius: '50%',
            filter: 'blur(12px)',
          }} />
          <Image
            src="/logo.png"
            alt="Agency"
            width={96}
            height={96}
            style={{ position: 'relative', display: 'block', filter: 'drop-shadow(0 8px 32px rgba(6,214,200,0.35))' }}
            priority
          />
        </div>

        {/* Wordmark */}
        <h1 style={{
          margin: '0 0 4px',
          fontSize: '32px',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #06D6C8 0%, #2563EB 50%, #9333EA 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Agency</h1>
        <p style={{
          margin: '0 0 36px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
        }}>YOUR AUTONOMOUS AI WORKFORCE</p>

        {/* Authenticating state */}
        {loading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            fontFamily: 'var(--font-mono)', fontSize: '12px',
            color: 'rgba(6,214,200,0.7)',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor"
                strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="10" strokeLinecap="round"/>
            </svg>
            Authenticating...
          </div>
        )}

        {/* ── Login card ─────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: loading ? 'none' : 'flex',
            flexDirection: 'column',
            width: '100%',
            /* glass card */
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(12px)',
            /* gradient border via box-shadow + border trick */
            border: '1px solid rgba(6,214,200,0.18)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 0 0 1px rgba(147,51,234,0.1), 0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Thin gradient rule at top of card */}
          <div style={{
            position: 'absolute',
            top: 0, left: '10%', right: '10%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(6,214,200,0.5), rgba(147,51,234,0.5), transparent)',
            borderRadius: '1px',
            pointerEvents: 'none',
          }} />

          <label style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.4)',
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
            autoFocus
            style={{
              width: '100%',
              padding: '11px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              marginBottom: error ? '12px' : '20px',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxSizing: 'border-box',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'rgba(6,214,200,0.5)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6,214,200,0.08)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />

          {error && (
            <div style={{
              padding: '9px 13px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!apiKey || loading}
            style={{
              width: '100%',
              padding: '12px',
              border: 'none',
              borderRadius: '8px',
              background: apiKey && !loading
                ? 'linear-gradient(135deg, #06D6C8 0%, #2563EB 55%, #9333EA 100%)'
                : 'rgba(255,255,255,0.07)',
              color: apiKey && !loading ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              cursor: apiKey && !loading ? 'pointer' : 'not-allowed',
              letterSpacing: '0.01em',
              transition: 'opacity 0.15s, filter 0.15s',
              boxShadow: apiKey && !loading
                ? '0 4px 24px rgba(6,214,200,0.25), 0 2px 8px rgba(147,51,234,0.2)'
                : 'none',
            }}
            onMouseEnter={e => { if (apiKey) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)' }}
          >
            Enter Agency
          </button>

          <p style={{
            marginTop: '18px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.2)',
            textAlign: 'center',
          }}>
            Run <code style={{ color: 'rgba(6,214,200,0.6)' }}>agency key</code> in your terminal to retrieve your key
          </p>
        </form>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        ::placeholder { color: rgba(255,255,255,0.2) !important; }
      `}</style>
    </div>
  )
}
