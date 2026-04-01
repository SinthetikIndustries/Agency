// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { readFile, writeFile, unlink, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { readConfig } from './config.js'
import { PORTS } from './ports.js'

export const pidFile = join(homedir(), '.agency', 'gateway.pid')
export const dashboardPidFile = join(homedir(), '.agency', 'dashboard.pid')

export class GatewayNotRunningError extends Error {
  constructor(message = 'Gateway is not running') {
    super(message)
    this.name = 'GatewayNotRunningError'
  }
}

export interface GatewayStatus {
  running: boolean
  pid: number | null
  health: {
    status: string
    services: Record<string, string>
    version: string
    uptime: number
  } | null
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function getGatewayPid(): Promise<number | null> {
  try {
    const raw = await readFile(pidFile, 'utf8')
    const pid = parseInt(raw.trim(), 10)
    if (isNaN(pid)) return null
    if (!isProcessRunning(pid)) {
      // Stale PID file — clean it up
      try {
        await unlink(pidFile)
      } catch {
        // ignore
      }
      return null
    }
    return pid
  } catch {
    return null
  }
}

async function pollHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let healthy = false

  while (Date.now() < deadline) {
    await sleep(500)
    try {
      const res = await fetch(url)
      if (res.ok) {
        healthy = true
        break
      }
    } catch {
      // not ready yet
    }
  }

  if (!healthy) {
    throw new Error(`Gateway did not become healthy within ${timeoutMs / 1000} seconds. Check logs for errors.`)
  }
}

async function startGatewayNode(gatewayDir: string, config: Record<string, unknown>): Promise<void> {
  const gateway = (config.gateway ?? {}) as Record<string, unknown>
  const host = (gateway.host as string | undefined) ?? '127.0.0.1'
  const port = (gateway.port as number | undefined) ?? PORTS.GATEWAY

  // Kill any stale process on the gateway port before starting
  killOnPort(port)
  await sleep(500)

  const entryPoint = join(gatewayDir, 'dist', 'index.js')

  const child = spawn('node', [entryPoint], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })

  child.unref()

  const pid = child.pid
  if (pid === undefined) {
    throw new Error('Failed to spawn Gateway process')
  }

  await writeFile(pidFile, String(pid), 'utf8')

  await pollHealth(`http://${host}:${port}/health`, 20_000)
}

async function startGatewayDocker(config: Record<string, unknown>): Promise<void> {
  const composeFile = (config.composeFile as string | undefined)
  if (!composeFile) throw new Error('config.composeFile not set. Run `agency install --standard` first.')

  const result = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error('Docker Compose failed to start')

  const gateway = (config.gateway ?? {}) as Record<string, unknown>
  const host = (gateway.host as string | undefined) ?? '127.0.0.1'
  const port = (gateway.port as number | undefined) ?? PORTS.GATEWAY
  await pollHealth(`http://${host}:${port}/health`, 30_000)
}

export async function startGateway(gatewayDir: string): Promise<void> {
  const config = await readConfig()
  const profile = (config.profile as string | undefined) ?? 'basic'

  if (profile === 'standard' || profile === 'advanced') {
    return startGatewayDocker(config)
  }
  return startGatewayNode(gatewayDir, config)
}

export async function stopGateway(): Promise<void> {
  const config = await readConfig()
  const profile = (config.profile as string | undefined) ?? 'basic'

  if (profile === 'standard' || profile === 'advanced') {
    const composeFile = (config.composeFile as string | undefined)
    if (!composeFile) throw new Error('config.composeFile not set.')

    const result = spawnSync('docker', ['compose', '-f', composeFile, 'down'], {
      stdio: 'inherit',
    })
    if (result.status !== 0) throw new Error('Docker Compose failed to stop')
    return
  }

  // Node process path
  let raw: string
  try {
    raw = await readFile(pidFile, 'utf8')
  } catch {
    throw new GatewayNotRunningError()
  }

  const pid = parseInt(raw.trim(), 10)
  if (isNaN(pid)) {
    throw new GatewayNotRunningError()
  }

  if (!isProcessRunning(pid)) {
    // Process already gone, just clean up
    try {
      await unlink(pidFile)
    } catch {
      // ignore
    }
    throw new GatewayNotRunningError()
  }

  // Send SIGTERM
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    throw new GatewayNotRunningError()
  }

  // Wait up to 10s for process to exit
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    await sleep(300)
    if (!isProcessRunning(pid)) {
      break
    }
  }

  // Clean up PID file
  try {
    await unlink(pidFile)
  } catch {
    // ignore if already gone
  }
}

export async function getDashboardPid(): Promise<number | null> {
  try {
    const raw = await readFile(dashboardPidFile, 'utf8')
    const pid = parseInt(raw.trim(), 10)
    if (isNaN(pid)) return null
    if (!isProcessRunning(pid)) {
      try { await unlink(dashboardPidFile) } catch { /* ignore */ }
      return null
    }
    return pid
  } catch {
    return null
  }
}

export async function startDashboard(appDir: string): Promise<void> {
  // Ensure any stale dashboard processes are gone before starting
  await stopDashboard()

  const child = spawn('pnpm', ['--filter', '@agency/dashboard', 'start'], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  const pid = child.pid
  if (pid === undefined) throw new Error('Failed to spawn Dashboard process')
  await writeFile(dashboardPidFile, String(pid), 'utf8')
  await pollHealth(`http://127.0.0.1:${PORTS.DASHBOARD}`, 30_000)
}

function killOnPort(port: number): void {
  // Use fuser to find and kill any process listening on the given TCP port
  try {
    spawnSync('fuser', ['-k', '-TERM', `${port}/tcp`], { stdio: 'pipe' })
  } catch {
    // fuser not available or no process on port — ignore
  }
}

export async function stopDashboard(): Promise<void> {
  // Kill tracked PID (the pnpm wrapper process)
  try {
    const raw = await readFile(dashboardPidFile, 'utf8')
    const pid = parseInt(raw.trim(), 10)
    if (!isNaN(pid) && isProcessRunning(pid)) {
      try { process.kill(pid, 'SIGTERM') } catch { /* ignore */ }
      const deadline = Date.now() + 5_000
      while (Date.now() < deadline) {
        await sleep(300)
        if (!isProcessRunning(pid)) break
      }
    }
  } catch { /* pid file missing — fine */ }

  // Also kill anything still listening on the dashboard port (catches orphaned next-server)
  killOnPort(PORTS.DASHBOARD)
  await sleep(500)

  try { await unlink(dashboardPidFile) } catch { /* ignore */ }
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  const pid = await getGatewayPid()

  if (pid === null) {
    return { running: false, pid: null, health: null }
  }

  const config = await readConfig()
  const gateway = (config.gateway ?? {}) as Record<string, unknown>
  const host = (gateway.host as string | undefined) ?? '127.0.0.1'
  const port = (gateway.port as number | undefined) ?? PORTS.GATEWAY
  const healthUrl = `http://${host}:${port}/health`

  try {
    const res = await fetch(healthUrl)
    if (res.ok) {
      const health = (await res.json()) as {
        status: string
        services: Record<string, string>
        version: string
        uptime: number
      }
      return { running: true, pid, health }
    }
  } catch {
    // Gateway process is running but health endpoint unreachable
  }

  return { running: true, pid, health: null }
}
