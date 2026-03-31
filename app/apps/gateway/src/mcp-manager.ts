// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * McpManager — manages MCP server connections backed by the mcp_servers DB table.
 *
 * Supports:
 *   - stdio transport: spawns child process, communicates over stdin/stdout
 *   - http transport: sends JSON-RPC requests to an HTTP/SSE endpoint
 *
 * DB config format (stored in mcp_servers.config JSONB):
 *   stdio: { "command": "npx", "args": [...], "env": {} }
 *   remote: { "url": "https://...", "type": "sse" }
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import type { DatabaseClient } from '@agency/orchestrator/db'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape stored in mcp_servers.config JSONB */
export type McpServerDbConfig =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { url: string; type?: string }

/** Internal runtime config — normalised from DB config */
interface McpServerConfig {
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export type McpConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected' | 'pending_restart'

export interface McpConnection {
  name: string
  transport: 'stdio' | 'http'
  status: McpConnectionStatus
  error?: string
  tools: McpTool[]
  connectedAt?: Date
  pid?: number   // stdio only
  url?: string   // http only
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

// ─── McpManager ───────────────────────────────────────────────────────────────

export class McpManager extends EventEmitter {
  private db: DatabaseClient
  private fireHook: ((event: string, data: Record<string, unknown>) => void) | undefined
  private configs: Map<string, McpServerConfig> = new Map()
  private connections: Map<string, McpConnection> = new Map()
  private processes: Map<string, ChildProcess> = new Map()
  private pendingRpc: Map<string, Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>> = new Map()
  private rpcCounter: Map<string, number> = new Map()
  private lineBuffers: Map<string, string> = new Map()

  constructor(db: DatabaseClient, fireHook?: (event: string, data: Record<string, unknown>) => void) {
    super()
    this.db = db
    this.fireHook = fireHook
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const rows = await this.db.query<{ name: string; config: unknown }>(
      'SELECT name, config FROM mcp_servers WHERE enabled = true'
    )
    if (rows.length === 0) return
    console.log(`[McpManager] Connecting to ${rows.length} MCP server(s): ${rows.map(r => r.name).join(', ')}`)
    await Promise.allSettled(rows.map(row => {
      const cfg = this.normalizeConfig(row.config as McpServerDbConfig)
      this.configs.set(row.name, cfg)
      return this.connect(row.name)
    }))
  }

  getConnections(): McpConnection[] {
    return Array.from(this.connections.values())
  }

  getConnection(name: string): McpConnection | undefined {
    return this.connections.get(name)
  }

  async reconnect(name: string): Promise<McpConnection> {
    const cfg = this.configs.get(name)
    if (!cfg) {
      const row = await this.db.queryOne<{ config: unknown }>('SELECT config FROM mcp_servers WHERE name = $1', [name])
      if (!row) throw new Error(`No MCP server named "${name}"`)
      this.configs.set(name, this.normalizeConfig(row.config as McpServerDbConfig))
    }
    void this.fireHook?.('mcp.reconnecting', { serverName: name })
    await this.disconnect(name)
    await this.connect(name)
    return this.connections.get(name)!
  }

  async close(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.disconnect(name)
    }
  }

  /** Add a new MCP server to the DB and connect it */
  async addServer(name: string, dbConfig: McpServerDbConfig): Promise<McpConnection> {
    await this.db.execute(
      `INSERT INTO mcp_servers (name, config, enabled, status)
       VALUES ($1, $2, true, 'disconnected')
       ON CONFLICT (name) DO UPDATE SET config = $2, enabled = true, updated_at = now()`,
      [name, JSON.stringify(dbConfig)]
    )

    const cfg = this.normalizeConfig(dbConfig)
    this.configs.set(name, cfg)

    if (this.connections.has(name)) {
      await this.disconnect(name)
    }

    if (cfg.transport === 'stdio') {
      // Spawning new stdio processes at runtime is unsafe — mark as pending_restart
      this.connections.set(name, {
        name,
        transport: 'stdio',
        status: 'pending_restart',
        tools: [],
      })
      await this.db.execute(
        `UPDATE mcp_servers SET status = 'pending_restart', updated_at = now() WHERE name = $1`,
        [name]
      )
    } else {
      await this.connect(name)
    }

    return this.connections.get(name)!
  }

  /** Remove a server from DB and disconnect */
  async removeServer(name: string): Promise<void> {
    await this.disconnect(name)
    this.configs.delete(name)
    this.connections.delete(name)
    await this.db.execute('DELETE FROM mcp_servers WHERE name = $1', [name])
  }

  /** Enable a server globally — connect if not already connected */
  async enableServer(name: string): Promise<McpConnection> {
    await this.db.execute(
      `UPDATE mcp_servers SET enabled = true, updated_at = now() WHERE name = $1`,
      [name]
    )
    const row = await this.db.queryOne<{ config: unknown }>('SELECT config FROM mcp_servers WHERE name = $1', [name])
    if (!row) throw new Error(`No MCP server named "${name}"`)
    const cfg = this.normalizeConfig(row.config as McpServerDbConfig)
    this.configs.set(name, cfg)
    if (cfg.transport !== 'stdio') {
      await this.connect(name)
    } else {
      this.connections.set(name, {
        name,
        transport: 'stdio',
        status: 'pending_restart',
        tools: [],
      })
      await this.db.execute(
        `UPDATE mcp_servers SET status = 'pending_restart', updated_at = now() WHERE name = $1`,
        [name]
      )
    }
    return this.connections.get(name)!
  }

  /** Disable a server globally — disconnect if connected */
  async disableServer(name: string): Promise<void> {
    await this.db.execute(
      `UPDATE mcp_servers SET enabled = false, updated_at = now() WHERE name = $1`,
      [name]
    )
    await this.disconnect(name)
    this.configs.delete(name)
    this.connections.delete(name)
  }

  /** Call a tool on a connected MCP server */
  async callTool(serverName: string, toolName: string, input: unknown): Promise<unknown> {
    const conn = this.connections.get(serverName)
    if (!conn || conn.status !== 'connected') {
      throw new Error(`MCP server "${serverName}" is not connected (status: ${conn?.status ?? 'unknown'})`)
    }
    try {
      interface CallResult { content?: Array<{ type: string; text?: string }>; isError?: boolean }
      const result = await this.rpcCall(serverName, 'tools/call', { name: toolName, arguments: input }) as CallResult
      void this.fireHook?.('mcp.tool.called', { serverName, toolName })
      if (result?.isError) {
        const errText = result.content?.map(c => c.text ?? '').join('') ?? 'Tool call failed'
        throw new Error(errText)
      }
      if (Array.isArray(result?.content)) {
        const text = result.content.map(c => c.text ?? JSON.stringify(c)).join('\n')
        return text || result
      }
      return result
    } catch (err) {
      void this.fireHook?.('mcp.error', { serverName, toolName, error: (err as Error).message })
      throw err
    }
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  private async connect(name: string): Promise<void> {
    const config = this.configs.get(name)!
    this.connections.set(name, {
      name,
      transport: config.transport,
      status: 'connecting',
      tools: [],
      ...(config.url !== undefined ? { url: config.url } : {}),
    })

    try {
      if (config.transport === 'stdio') {
        await this.connectStdio(name, config)
      } else {
        await this.connectHttp(name, config)
      }
      await this.initializeProtocol(name)
      const tools = await this.fetchTools(name)
      const conn = this.connections.get(name)!
      conn.status = 'connected'
      conn.tools = tools
      conn.connectedAt = new Date()
      console.log(`[McpManager] "${name}" connected — ${tools.length} tool(s)`)
      await this.db.execute(
        `UPDATE mcp_servers SET status = 'connected', error = null, updated_at = now() WHERE name = $1`,
        [name]
      ).catch(() => {/* server may not exist in DB yet during migration */})
      void this.fireHook?.('mcp.connected', { serverName: name, toolCount: tools.length })
    } catch (err) {
      const conn = this.connections.get(name)
      const msg = (err as Error).message
      if (conn) {
        conn.status = 'error'
        conn.error = msg
      }
      console.error(`[McpManager] "${name}" failed to connect:`, msg)
      await this.db.execute(
        `UPDATE mcp_servers SET status = 'error', error = $2, updated_at = now() WHERE name = $1`,
        [name, msg]
      ).catch(() => {/* best effort */})
      void this.fireHook?.('mcp.error', { serverName: name, error: msg })
    }
  }

  private async disconnect(name: string): Promise<void> {
    const proc = this.processes.get(name)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(name)
    }
    this.pendingRpc.delete(name)
    this.rpcCounter.delete(name)
    this.lineBuffers.delete(name)
    const conn = this.connections.get(name)
    if (conn) {
      conn.status = 'disconnected'
      void this.fireHook?.('mcp.disconnected', { serverName: name })
    }
    await this.db.execute(
      `UPDATE mcp_servers SET status = 'disconnected', updated_at = now() WHERE name = $1`,
      [name]
    ).catch(() => {/* best effort */})
  }

  // ─── Stdio transport ──────────────────────────────────────────────────────

  private async connectStdio(name: string, config: McpServerConfig): Promise<void> {
    if (!config.command) throw new Error(`stdio transport requires "command" for server "${name}"`)

    const proc = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!proc.stdout || !proc.stdin) {
      throw new Error(`Failed to spawn process for "${name}"`)
    }

    this.processes.set(name, proc)
    this.pendingRpc.set(name, new Map())
    this.rpcCounter.set(name, 0)
    this.lineBuffers.set(name, '')

    const conn = this.connections.get(name)!
    if (proc.pid !== undefined) conn.pid = proc.pid

    // Line-delimited JSON over stdout
    proc.stdout.on('data', (chunk: Buffer) => {
      const combined = (this.lineBuffers.get(name) ?? '') + chunk.toString('utf-8')
      const lines = combined.split('\n')
      this.lineBuffers.set(name, lines[lines.length - 1]!)
      for (const line of lines.slice(0, -1)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse
          if (msg.id !== undefined) this.resolveRpc(name, msg)
        } catch {
          // ignore non-JSON lines (e.g. startup logs)
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim()
      if (text) console.debug(`[McpManager:${name}:stderr]`, text)
    })

    proc.on('error', (err) => {
      console.warn(`[McpManager] "${name}" process error:`, err.message)
      const c = this.connections.get(name)
      if (c) { c.status = 'error'; c.error = err.message }
      void this.fireHook?.('mcp.error', { serverName: name, error: err.message })
    })

    proc.on('exit', (code) => {
      console.warn(`[McpManager] "${name}" process exited with code ${code}`)
      const c = this.connections.get(name)
      if (c && c.status === 'connected') {
        c.status = 'disconnected'
        c.error = `Process exited with code ${code}`
        void this.fireHook?.('mcp.disconnected', { serverName: name, exitCode: code })
      }
    })
  }

  // ─── HTTP transport ───────────────────────────────────────────────────────

  private async connectHttp(_name: string, config: McpServerConfig): Promise<void> {
    if (!config.url) throw new Error(`http transport requires "url"`)
    // HTTP connections are stateless — just verify the server responds
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping', params: {} }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null)
    // ping may 404 or error — that's fine, server just needs to be reachable
    if (!res) throw new Error(`HTTP MCP server at ${config.url} is not reachable`)
  }

  // ─── MCP protocol ─────────────────────────────────────────────────────────

  private async initializeProtocol(name: string): Promise<void> {
    await this.rpcCall(name, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'agency-gateway', version: '0.2.0' },
    })
    // Send initialized notification (no response expected)
    this.sendNotification(name, 'notifications/initialized')
  }

  private async fetchTools(name: string): Promise<McpTool[]> {
    try {
      const result = await this.rpcCall(name, 'tools/list', {}) as { tools?: McpTool[] }
      return result?.tools ?? []
    } catch {
      return []
    }
  }

  // ─── JSON-RPC helpers ─────────────────────────────────────────────────────

  private async rpcCall(name: string, method: string, params: unknown): Promise<unknown> {
    const config = this.configs.get(name)!
    const id = (this.rpcCounter.get(name) ?? 0) + 1
    this.rpcCounter.set(name, id)
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    if (config.transport === 'http') {
      const res = await fetch(config.url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      })
      const contentType = res.headers.get('content-type') ?? ''
      let data: JsonRpcResponse
      if (contentType.includes('text/event-stream')) {
        // Streamable HTTP MCP: parse SSE response, extract first data line
        const text = await res.text()
        const dataLine = text.split('\n').find(l => l.startsWith('data:'))
        if (!dataLine) throw new Error(`No data line in SSE response`)
        data = JSON.parse(dataLine.slice(5).trim()) as JsonRpcResponse
      } else {
        data = await res.json() as JsonRpcResponse
      }
      if (data.error) throw new Error(data.error.message)
      return data.result
    }

    // stdio: write to stdin and wait for response
    const proc = this.processes.get(name)
    if (!proc?.stdin?.writable) throw new Error(`"${name}" process stdin not available`)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpc.get(name)?.delete(id)
        reject(new Error(`RPC timeout for method "${method}" on server "${name}"`))
      }, 15_000)

      this.pendingRpc.get(name)!.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })

      proc.stdin!.write(JSON.stringify(request) + '\n')
    })
  }

  private sendNotification(name: string, method: string): void {
    const config = this.configs.get(name)
    if (config?.transport !== 'stdio') return
    const proc = this.processes.get(name)
    if (!proc?.stdin?.writable) return
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n')
  }

  private resolveRpc(name: string, msg: JsonRpcResponse): void {
    const pending = this.pendingRpc.get(name)?.get(msg.id)
    if (!pending) return
    this.pendingRpc.get(name)!.delete(msg.id)
    if (msg.error) {
      pending.reject(new Error(msg.error.message))
    } else {
      pending.resolve(msg.result)
    }
  }

  // ─── Config normalization ─────────────────────────────────────────────────

  private normalizeConfig(dbConfig: McpServerDbConfig): McpServerConfig {
    if ('command' in dbConfig) {
      return { transport: 'stdio', command: dbConfig.command, ...(dbConfig.args ? { args: dbConfig.args } : {}), ...(dbConfig.env ? { env: dbConfig.env } : {}) }
    }
    return { transport: 'http', url: dbConfig.url }
  }
}
