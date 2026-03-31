// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PORTS } from './ports.js'

export interface GatewayConnection {
  url: string
  apiKey: string
}

export async function loadGatewayConnection(): Promise<GatewayConnection> {
  const configPath = join(homedir(), '.agency', 'config.json')
  const credentialsPath = join(homedir(), '.agency', 'credentials.json')

  let config: Record<string, unknown> = {}
  let credentials: Record<string, unknown> = {}

  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>
  } catch {
    // ignore
  }

  try {
    credentials = JSON.parse(await readFile(credentialsPath, 'utf8')) as Record<string, unknown>
  } catch {
    // ignore
  }

  const gateway = (config.gateway ?? {}) as Record<string, unknown>
  const host = (gateway.host as string | undefined) ?? '127.0.0.1'
  const port = (gateway.port as number | undefined) ?? PORTS.GATEWAY
  const url = `http://${host}:${port}`

  const gatewayCredentials = (credentials.gateway ?? {}) as Record<string, unknown>
  const apiKey =
    (gatewayCredentials.apiKey as string | undefined) ??
    process.env.AGENCY_API_KEY ??
    ''

  return { url, apiKey }
}

export async function gatewayFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { url, apiKey } = await loadGatewayConnection()
  const fullUrl = `${url}${path}`

  let response: Response
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(options?.headers ?? {}),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('connect')) {
      throw new Error('Cannot connect to Gateway. Run `agency start` first.')
    }
    throw err
  }

  if (!response.ok) {
    let body = ''
    try {
      body = await response.text()
    } catch {
      // ignore
    }
    throw new Error(`Gateway returned ${response.status} ${response.statusText}${body ? ': ' + body : ''}`)
  }

  return response.json() as Promise<T>
}

export async function gatewayWsUrl(): Promise<string> {
  const { url } = await loadGatewayConnection()
  return url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
}
