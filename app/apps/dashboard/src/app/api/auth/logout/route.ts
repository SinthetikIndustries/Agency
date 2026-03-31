// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { NextResponse } from 'next/server'
import { PORTS } from '@/lib/ports'

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? `http://localhost:${PORTS.GATEWAY}`

export async function POST(request: Request) {
  // Tell the gateway to invalidate the session
  try {
    await fetch(`${GATEWAY_URL}/auth/logout`, {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '' },
    })
  } catch { /* gateway may be unreachable — still clear local cookie */ }

  // Clear the cookie from the dashboard's origin so the browser definitely drops it
  const res = NextResponse.redirect(new URL('/login', request.url))
  res.cookies.set('agency_session', '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
  })
  return res
}
