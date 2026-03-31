// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * Lightweight JWT auth for the dashboard.
 * Uses HMAC-SHA256 via Node crypto — no external deps.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

// ─── JWT ──────────────────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string      // 'dashboard'
  iat: number      // issued at (unix seconds)
  exp: number      // expires at (unix seconds)
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  return Buffer.from(padded, 'base64')
}

export function signJwt(secret: string, maxAgeSeconds: number): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  // maxAgeSeconds === 0 means no expiry
  const payload = base64url(Buffer.from(JSON.stringify({
    sub: 'dashboard',
    iat: now,
    exp: maxAgeSeconds === 0 ? 0 : now + maxAgeSeconds,
  } satisfies JwtPayload)))

  const sig = base64url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest()
  )
  return `${header}.${payload}.${sig}`
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, payload, sig] = parts as [string, string, string]
  const expected = base64url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest()
  )

  // Constant-time comparison
  try {
    const sigBuf = base64urlDecode(sig)
    const expBuf = base64urlDecode(expected)
    if (sigBuf.length !== expBuf.length) return null
    if (!timingSafeEqual(sigBuf, expBuf)) return null
  } catch {
    return null
  }

  let parsed: JwtPayload
  try {
    parsed = JSON.parse(base64urlDecode(payload).toString()) as JwtPayload
  } catch {
    return null
  }

  // exp === 0 means no expiry
  if (parsed.exp !== 0 && parsed.exp < Math.floor(Date.now() / 1000)) return null
  return parsed
}

/** Returns 'valid' | 'expired' | 'invalid' */
export function verifyJwtWithReason(token: string, secret: string): 'valid' | 'expired' | 'invalid' {
  const parts = token.split('.')
  if (parts.length !== 3) return 'invalid'

  const [header, payload, sig] = parts as [string, string, string]
  const expected = base64url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest()
  )

  try {
    const sigBuf = base64urlDecode(sig)
    const expBuf = base64urlDecode(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return 'invalid'
  } catch {
    return 'invalid'
  }

  let parsed: JwtPayload
  try {
    parsed = JSON.parse(base64urlDecode(payload).toString()) as JwtPayload
  } catch {
    return 'invalid'
  }

  if (parsed.exp !== 0 && parsed.exp < Math.floor(Date.now() / 1000)) return 'expired'
  return 'valid'
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

export function buildSetCookieHeader(token: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `agency_session=${token}`,
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
    'Path=/',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(/(?:^|;\s*)agency_session=([^;]+)/)
  return match?.[1] ?? null
}
