// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import { loadConfig, loadCredentials, agencyDir, PORTS } from '@agency/config'
import { createToolRegistry } from '@agency/tool-registry'
import type { VaultStore, DiagnosticsReport, InvokeService } from '@agency/tool-registry'
import { ModelRouter } from '@agency/model-router'
import { Orchestrator } from '@agency/orchestrator'
import { PostgresClient } from '@agency/orchestrator/db'
import { QueueClient } from '@agency/shared-worker'
import { startVaultSync } from '@agency/vault-sync'
import type { VaultSync } from '@agency/vault-sync'
import { MessagingService } from '@agency/messaging'
import { MemoryStore } from '@agency/memory'
import type { AgencyConfig, AgencyCredentials, HealthStatus, Session, AgentModelConfig, BuiltInAgentSlug } from '@agency/shared-types'
import { BUILT_IN_AGENTS } from '@agency/shared-types'
import { loadRoutingProfiles, registerRoutingProfileRoutes, type RoutingProfile } from './routing-profiles.js'
import { registerVaultRoutes } from './vault-routes.js'
import { registerBrainRoutes } from './brain-routes.js'
import { registerAgentConfigRoutes } from './agent-config-routes.js'
import { registerMemoryRoutes } from './memory-routes.js'
import { registerMeRoutes } from './me-routes.js'
import { registerOnboardingRoutes } from './onboarding-routes.js'
import { SkillsManager } from './skills-manager.js'
import { registerSkillRoutes } from './skill-routes.js'
import { registerAgentSkillRoutes } from './agent-skill-routes.js'
import { registerGroupRoutes } from './groups-routes.js'
import { registerWorkspaceRoutes } from './workspace-routes.js'
import { registerToolRoutes } from './tool-routes.js'
import { registerMcpRoutes } from './mcp-routes.js'
import { HooksManager } from './hooks-manager.js'
import { registry, metrics } from './metrics.js'
import { AuditLogger } from './audit.js'
import { signJwt, verifyJwt, verifyJwtWithReason, buildSetCookieHeader, parseCookieToken } from './jwt-auth.js'
import { ConnectorRegistry } from './connectors/registry.js'
import { TagParserSession } from './tag-parser.js'
import { SchedulerService } from './scheduler.js'
import { registerSchedulerRoutes } from './scheduler-routes.js'
import { McpManager } from './mcp-manager.js'
import { isInsideWorkspace } from './path-utils.js'
import { rankSessionsByRelevance } from './session-search.js'
import { generatePromptSuggestions } from './prompt-suggestions.js'
import { getCoordinatorInjection } from './coordinator-session.js'
import { classifyToolInvocation } from './permission-classifier.js'
import { buildVerificationPrompt, parseVerdict } from '@agency/orchestrator'
import { ProactiveLoop, buildProactiveSystemPrompt } from './proactive-mode.js'

// ─── First-Run Bootstrap ──────────────────────────────────────────────────────

const FIRST_RUN_BOOTSTRAP = [
  'SYSTEM: This is the first time this agent has been started on this system.',
  'Before responding to the user\'s message normally, run the onboarding process:',
  '',
  '1. Greet the user warmly and briefly explain what you are and what you can do',
  '2. Tell them you\'d like to ask a few quick questions to get set up',
  '3. Ask: What\'s your name?',
  '4. Ask: What do you do / what\'s your main focus or role?',
  '5. Ask: What are you hoping to use me for most?',
  '6. Ask: Any preferences for how I communicate with you? (detail level, tone, etc.)',
  '7. Ask: Anything else you\'d like me to know about you or how you work?',
  '8. After they answer, thank them and write what you learned into your context files',
  '   using the file_write tool:',
  '   - Update user.md with everything you learned about them',
  '   - Update identity.md if they gave you a custom name',
  '',
  'Keep the conversation natural — don\'t present this as a rigid form.',
  'Once onboarding is complete, continue with normal operation.',
].join('\n')

// ─── /clear Command ───────────────────────────────────────────────────────────

const HEARTBEAT_BLANK = '# Heartbeat\n\n## Current Session\n_No active tasks_\n\n## Tasks\n<!-- Write your tasks here at the start of each request. Check them off as you complete them. -->\n'
const SCRATCH_BLANK = '# Scratch\n\n<!-- Temporary working notes. Cleared at session end or on /clear. -->\n'

async function handleClearCommand(db: PostgresClient, sessionId: string, workspacePath: string | undefined): Promise<void> {
  await db.query('DELETE FROM messages WHERE session_id = $1', [sessionId])
  if (workspacePath) {
    const configDir = join(workspacePath, 'config')
    try {
      await writeFile(join(configDir, 'heartbeat.md'), HEARTBEAT_BLANK, 'utf-8')
      await writeFile(join(configDir, 'scratch.md'), SCRATCH_BLANK, 'utf-8')
    } catch { /* workspace missing, skip */ }
  }
}

// ─── Log Buffer ───────────────────────────────────────────────────────────────

const MAX_LOG_LINES = 1000
const MAX_MESSAGE_LENGTH = 100_000 // 100 KB — enough for large pastes, blocks abuse

interface LogLine {
  ts: string
  service: string
  level: string
  msg: string
}

class LogBuffer extends EventEmitter {
  private lines: LogLine[] = []

  append(service: string, level: string, msg: string): void {
    const line: LogLine = { ts: new Date().toISOString(), service, level, msg }
    this.lines.push(line)
    if (this.lines.length > MAX_LOG_LINES) this.lines.shift()
    this.emit('line', line)
  }

  tail(service: string, n = 100): LogLine[] {
    const filtered = service === 'all' ? this.lines : this.lines.filter(l => l.service === service)
    return filtered.slice(-n)
  }
}

const logBuffer = new LogBuffer()

// ─── Console Patch ────────────────────────────────────────────────────────────
// Applied early so startup errors are captured in logBuffer before Fastify init.

const origLog = console.log.bind(console)
const origWarn = console.warn.bind(console)
const origErr = console.error.bind(console)
console.log = (...args: unknown[]) => {
  const msg = args.map(String).join(' ')
  logBuffer.append('gateway', 'info', msg)
  origLog(...args)
}
console.warn = (...args: unknown[]) => {
  const msg = args.map(String).join(' ')
  logBuffer.append('gateway', 'warn', msg)
  origWarn(...args)
}
console.error = (...args: unknown[]) => {
  const msg = args.map(String).join(' ')
  logBuffer.append('gateway', 'error', msg)
  origErr(...args)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppServices {
  config: AgencyConfig
  credentials: AgencyCredentials
  db: PostgresClient
  modelRouter: ModelRouter
  orchestrator: Orchestrator
  messagingService: MessagingService | null
  memoryStore: MemoryStore | null
  vaultSync: VaultSync | null
  skillsManager: SkillsManager
  auditLogger: AuditLogger
  connectorRegistry: ConnectorRegistry
  schedulerService?: SchedulerService
  mcpManager?: McpManager
  hooksManager: HooksManager
  startTime: Date
}

// ─── Session Helpers ──────────────────────────────────────────────────────────

async function createSession(db: PostgresClient, agentId: string, client = 'cli', coordinatorMode = false): Promise<Session> {
  const id = randomUUID()
  await db.execute(
    'INSERT INTO sessions (id, agent_id, client, status, coordinator_mode) VALUES ($1, $2, $3, $4, $5)',
    [id, agentId, client, 'active', coordinatorMode]
  )
  return {
    id,
    agentId,
    client,
    status: 'active',
    coordinatorMode,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

async function getSession(db: PostgresClient, id: string): Promise<Session | null> {
  const row = await db.queryOne<Record<string, string>>(
    'SELECT * FROM sessions WHERE id = $1',
    [id]
  )
  if (!row) return null
  const base: Session = {
    id: row['id']!,
    agentId: row['agent_id']!,
    client: row['client']!,
    status: row['status'] as Session['status'],
    pinned: (row['pinned'] as unknown) === true || row['pinned'] === 'true',
    createdAt: new Date(row['created_at']!),
    updatedAt: new Date(row['updated_at']!),
  }
  if (row['name']) base.name = row['name']
  if (row['pinned_at']) base.pinnedAt = new Date(row['pinned_at'])
  if ((row['coordinator_mode'] as unknown) === true || row['coordinator_mode'] === 'true') base.coordinatorMode = true
  return base
}

async function getSessionMessages(db: PostgresClient, sessionId: string) {
  return db.query<Record<string, string>>(
    'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId]
  )
}

async function saveMessage(db: PostgresClient, sessionId: string, role: string, content: string): Promise<void> {
  await db.execute(
    'INSERT INTO messages (id, session_id, role, content) VALUES ($1, $2, $3, $4)',
    [randomUUID(), sessionId, role, content]
  )
}

// ─── PID Management ───────────────────────────────────────────────────────────

const pidFile = join(agencyDir, 'gateway.pid')

async function writePid(): Promise<void> {
  await writeFile(pidFile, String(process.pid), 'utf-8')
}

async function removePid(): Promise<void> {
  try { await unlink(pidFile) } catch { /* already gone */ }
}

// ─── Gateway Factory ──────────────────────────────────────────────────────────

export async function createGateway(): Promise<void> {
  // ── 0. Uncaught exception hook — needs hooksManager once ready ───────────────
  // Set up after hooksManager init; see below.

  // ── 1. Load config ──────────────────────────────────────────────────────────
  console.log('[Gateway] Loading configuration...')
  const config = await loadConfig()
  const credentials = await loadCredentials()

  // ── 2. Connect to Postgres ──────────────────────────────────────────────────
  const postgresUrl = credentials.postgres?.url ?? process.env['DATABASE_URL']
  if (!postgresUrl) {
    throw new Error(
      'Postgres URL not configured. Set credentials.postgres.url or DATABASE_URL environment variable.'
    )
  }
  console.log('[Gateway] Connecting to Postgres...')
  const db = new PostgresClient(postgresUrl)
  await db.queryOne('SELECT 1', [])  // connectivity check

  // ── 3. Load routing profiles ────────────────────────────────────────────────
  const routingProfilesMap = await loadRoutingProfiles(db)

  // ── 4. Initialize sub-daemons ───────────────────────────────────────────────
  let queueClient: QueueClient | undefined = undefined
  const redisUrl = credentials.redis?.url ?? config.redis?.url
  if (config.profile !== 'basic' || redisUrl) {
    console.log('[Gateway] Initializing Queue Client (BullMQ)...')
    queueClient = new QueueClient()
    await queueClient.init()
  }

  // ── 4b. VaultSync (optional) ────────────────────────────────────────────────
  // vault-sync disabled — brain system replaces file-based vault
  let vaultSync = null as VaultSync | null
  const rawVaultPath =
    process.env['AGENCY_VAULT_PATH'] ??
    config.daemons.vaultSync.vaultPath ??
    join(homedir(), '.agency', 'vault')
  const vaultPath = rawVaultPath.replace(/^~/, homedir())
  // if (config.daemons.vaultSync.enabled) {
  //   try {
  //     await mkdir(vaultPath, { recursive: true })
  //     console.log('[Gateway] Initializing VaultSync daemon...')
  //     vaultSync = await startVaultSync({
  //       connectionString: postgresUrl,
  //       vaultPath,
  //       watchDebounceMs: 500,
  //     })
  //     console.log('[Gateway] VaultSync daemon started, watching:', vaultPath)
  //   } catch (err) {
  //     console.error('[Gateway] VaultSync initialization failed (continuing without vault sync):', err)
  //   }
  // }

  // ── 4c. MessagingService (init before createToolRegistry) ──────────────────
  let messagingService: MessagingService | null = null
  if (redisUrl) {
    try {
      console.log('[Gateway] Initializing MessagingService...')
      messagingService = new MessagingService({
        redisUrl,
        postgresConnectionString: postgresUrl,
      })
    } catch (err) {
      console.error('[Gateway] MessagingService initialization failed:', err)
    }
  }

  // ── 4d. MemoryStore + ToolRegistry ─────────────────────────────────────────
  console.log('[Gateway] Initializing MemoryStore...')
  const memoryStore = new MemoryStore(postgresUrl)

  const vaultStore: VaultStore = {
    db: { query: (sql: string, params?: unknown[]) => db.query(sql, params) },
    vaultPath,
  }

  console.log('[Gateway] Initializing Model Router...')

  const auditLogger = new AuditLogger(db)

  // Derive gateway URL for self-calls — available before app.listen()
  const gwHost = (config as any).gateway?.host ?? '127.0.0.1'
  const gwPort = (config as any).gateway?.port ?? PORTS.GATEWAY
  const gatewayBaseUrl = `http://${gwHost === '0.0.0.0' ? '127.0.0.1' : gwHost}:${gwPort}`
  const gatewayApiKey = (credentials as any).gateway?.apiKey ?? ''

  const connectorRegistry = new ConnectorRegistry(
    gatewayBaseUrl,
    gatewayApiKey,
    auditLogger,
    (level: string, msg: string) => level === 'error' ? console.error(msg) : console.log(msg),
    (event: string, context: Record<string, unknown>) => { void hooksManager.fire(event, context) }
  )

  const invokeService: InvokeService = {
    async invoke(agentSlug: string, prompt: string, depth: number) {
      void hooksManager.fire('agent.spawned', { agentSlug, invokeDepth: depth + 1 })
      const sessionRes = await fetch(`${gatewayBaseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gatewayApiKey}` },
        body: JSON.stringify({ agentSlug, client: 'agent_invoke' }),
      })
      if (!sessionRes.ok) throw new Error(`Failed to create session for "${agentSlug}": ${sessionRes.status}`)
      const { session } = await sessionRes.json() as { session: { id: string } }

      const sendRes = await fetch(`${gatewayBaseUrl}/sessions/${session.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayApiKey}`,
          'X-Invoke-Depth': String(depth + 1),
        },
        body: JSON.stringify({ content: prompt }),
      })
      if (!sendRes.ok) throw new Error(`agent_invoke send failed for "${agentSlug}": ${sendRes.status}`)
      const data = await sendRes.json() as { response: string }

      const agentRes = await fetch(`${gatewayBaseUrl}/agents/${agentSlug}`, {
        headers: { 'Authorization': `Bearer ${gatewayApiKey}` },
      })
      const agentName = agentRes.ok
        ? ((await agentRes.json()) as { agent?: { name?: string } }).agent?.name ?? agentSlug
        : agentSlug

      return { response: data.response ?? '', agentName }
    },
  }

  // ── Diagnostics provider (wired after modelRouter/orchestrator init) ─────────
  // We build this as a closure that captures services after they are ready.
  // The provider is passed to createToolRegistry so the system_diagnose tool
  // can call it. It is also used by GET /diagnostics.
  let resolvedDiagnosticsProvider: (() => Promise<DiagnosticsReport>) | null = null

  const toolRegistry = createToolRegistry(queueClient, {
    memoryStore,
    ...(messagingService ? { messagingService } : {}),
    invokeService,
    discordService: connectorRegistry,
    vaultStore,
    brainStore: {
      gatewayUrl: `http://localhost:${gwPort}`,
      apiKey: gatewayApiKey,
    },
    diagnosticsProvider: () => {
      if (!resolvedDiagnosticsProvider) {
        return Promise.resolve({
          timestamp: new Date().toISOString(),
          system: {
            nodeVersion: process.versions.node,
            platform: process.platform,
            processUptime: Math.floor(process.uptime()),
            memoryMb: { heapUsed: 0, heapTotal: 0, rss: 0 },
          },
          services: {
            orchestrator: { status: 'initializing' },
            modelRouter: { status: 'initializing' },
            vaultSync: { status: 'initializing' },
            database: { status: 'initializing' },
            redis: { status: 'initializing' },
          },
          agents: [],
          pendingApprovals: 0,
          config: { profile: config.profile, defaultModel: config.modelRouter.defaultModel, enabledProviders: [] },
        })
      }
      return resolvedDiagnosticsProvider()
    },
  })
  const modelRouter = new ModelRouter(config.modelRouter, credentials)

  const hooksManager = new HooksManager(db)

  // Wire gateway.start and gateway.error now that hooksManager is ready
  void hooksManager.fire('gateway.start', {})
  process.on('uncaughtException', (err) => {
    void hooksManager.fire('gateway.error', { error: err.message, stack: err.stack })
  })
  process.on('unhandledRejection', (reason) => {
    void hooksManager.fire('gateway.error', { error: String(reason) })
  })

  // ── McpManager ─────────────────────────────────────────────────────────────
  const mcpManager = new McpManager(db, hooksManager.fire.bind(hooksManager))
  console.log('[Gateway] Initializing MCP servers...')
  await mcpManager.initialize()
  // Register each connected MCP tool in the tool registry
  for (const conn of mcpManager.getConnections()) {
    if (conn.status !== 'connected') continue
    for (const tool of conn.tools) {
      const toolName = `${conn.name}_${tool.name}`
      if (toolRegistry.get(toolName) !== undefined) {
        console.warn(`[MCP] Tool name collision: "${toolName}" from server "${conn.name}" already registered. Skipping.`)
        continue
      }
      toolRegistry.register(
        {
          name: toolName,
          type: 'http',
          description: tool.description ?? `MCP tool: ${tool.name} (${conn.name})`,
          inputSchema: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
          permissions: [],
          sandboxed: false,
          timeout: 30_000,
        },
        async (input) => mcpManager.callTool(conn.name, tool.name, input)
      )
    }
  }
  // Add MCP tool names to every agent profile's allowed_tools
  const mcpToolNames = mcpManager.getConnections()
    .filter(c => c.status === 'connected')
    .flatMap(c => c.tools.map(t => `${c.name}_${t.name}`))
  if (mcpToolNames.length > 0) {
    const profiles = await db.query<{ id: string; allowed_tools: string }>(
      'SELECT id, allowed_tools FROM agent_profiles'
    )
    for (const profile of profiles) {
      const raw: unknown = profile.allowed_tools
      const existing: string[] = Array.isArray(raw) ? raw as string[] : typeof raw === 'string' && raw ? (raw.startsWith('[') ? JSON.parse(raw) as string[] : raw.split(',').map((s: string) => s.trim()).filter(Boolean)) : []
      const merged = [...new Set([...existing, ...mcpToolNames])]
      if (merged.length !== existing.length) {
        await db.execute(
          'UPDATE agent_profiles SET allowed_tools = $1 WHERE id = $2',
          [JSON.stringify(merged), profile.id]
        )
      }
    }
    console.log(`[Gateway] MCP: registered ${mcpToolNames.length} tool(s) across all profiles: ${mcpToolNames.join(', ')}`)
  }

  console.log('[Gateway] Initializing Orchestrator...')
  const orchestrator = new Orchestrator(db, modelRouter, toolRegistry, hooksManager.fire.bind(hooksManager), memoryStore ?? undefined, classifyToolInvocation)
  await orchestrator.initialize()

  console.log('[Gateway] Initializing SkillsManager...')
  const skillsManager = new SkillsManager(db, {
    bundledSkillsDir: (config as any).skills?.bundledSkillsDir,
  })
  await skillsManager.initialize()

  // ── Wire diagnostics provider ───────────────────────────────────────────────
  resolvedDiagnosticsProvider = async (): Promise<DiagnosticsReport> => {
    const mem = process.memoryUsage()
    const heapUsed = Math.round(mem.heapUsed / 1024 / 1024)
    const heapTotal = Math.round(mem.heapTotal / 1024 / 1024)
    const rss = Math.round(mem.rss / 1024 / 1024)

    // Orchestrator
    const orchStatus = await orchestrator.healthCheck().catch(() => 'error')
    const allAgents = orchestrator.listAgents()
    let activeSessions = 0
    try {
      const rows = await db.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM sessions WHERE status = 'active'"
      )
      activeSessions = parseInt(rows[0]?.count ?? '0', 10)
    } catch { /* non-fatal */ }

    // Model router providers
    let providerHealth: Record<string, string> = {}
    let activeProviders: string[] = []
    try {
      providerHealth = await modelRouter.healthCheck()
      activeProviders = Object.entries(providerHealth)
        .filter(([, s]) => s === 'ok')
        .map(([p]) => p)
    } catch { /* non-fatal */ }

    // Vault sync
    let vaultDocCount = 0
    let vaultErrorCount = 0
    let vaultLastSyncAt: string | null = null
    if (vaultSync) {
      try {
        const rows = await db.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM vault_documents'
        )
        vaultDocCount = parseInt(rows[0]?.count ?? '0', 10)
      } catch { /* non-fatal */ }
    }

    // Database ping
    let dbStatus = 'ok'
    let dbError: string | undefined
    try {
      await db.query('SELECT 1')
    } catch (err) {
      dbStatus = 'error'
      dbError = err instanceof Error ? err.message : String(err)
    }

    // Redis ping
    let redisStatus = 'disabled'
    let redisError: string | undefined
    const activeRedisUrl = credentials.redis?.url ?? config.redis?.url
    if (activeRedisUrl) {
      try {
        const { createConnection } = await import('node:net')
        const u = new URL(activeRedisUrl)
        const host = u.hostname || 'localhost'
        const port = parseInt(u.port || String(PORTS.REDIS), 10)
        await new Promise<void>((resolve, reject) => {
          const socket = createConnection({ host, port })
          const timer = setTimeout(() => { socket.destroy(); reject(new Error('timeout')) }, 3000)
          socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve() })
          socket.on('error', (err) => { clearTimeout(timer); reject(err) })
        })
        redisStatus = 'ok'
      } catch (err) {
        redisStatus = 'error'
        redisError = err instanceof Error ? err.message : String(err)
      }
    }

    // Pending approvals
    let pendingApprovals = 0
    try {
      const rows = await db.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM approvals WHERE status = 'pending'"
      )
      pendingApprovals = parseInt(rows[0]?.count ?? '0', 10)
    } catch { /* non-fatal */ }

    // Enabled providers from config
    const enabledProviders = Object.entries(config.modelRouter.providers)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k)

    return {
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.versions.node,
        platform: process.platform,
        processUptime: Math.floor(process.uptime()),
        memoryMb: { heapUsed, heapTotal, rss },
      },
      services: {
        orchestrator: {
          status: orchStatus,
          agentCount: allAgents.length,
          activeSessions,
        },
        modelRouter: {
          status: Object.values(providerHealth).some(s => s === 'ok') ? 'ok' : 'degraded',
          providers: activeProviders,
          providerHealth,
        },
        vaultSync: {
          status: vaultSync ? 'ok' : 'disabled',
          docCount: vaultDocCount,
          errorCount: vaultErrorCount,
          lastSyncAt: vaultLastSyncAt,
        },
        database: { status: dbStatus, ...(dbError ? { error: dbError } : {}) },
        redis: { status: redisStatus, ...(redisError ? { error: redisError } : {}) },
      },
      agents: allAgents.map(a => ({
        slug: a.identity.slug,
        name: a.identity.name,
        status: a.identity.status,
        profile: a.profile.slug,
      })),
      pendingApprovals,
      config: {
        profile: config.profile,
        defaultModel: config.modelRouter.defaultModel,
        enabledProviders,
      },
    }
  }

  // ── 4e. SchedulerService ────────────────────────────────────────────────────
  let schedulerService: SchedulerService | undefined
  try {
    console.log('[Gateway] Initializing Scheduler...')
    schedulerService = new SchedulerService(
      db,
      orchestrator,
      (level, msg) => level === 'error' ? console.error(msg) : console.log(msg),
      hooksManager.fire.bind(hooksManager)
    )
    await schedulerService.start()
    console.log('[Gateway] Scheduler started.')
  } catch (err) {
    console.error('[Gateway] Scheduler initialization failed (continuing without scheduler):', err)
    schedulerService = undefined
  }

  const services: AppServices = {
    config,
    credentials,
    db,
    modelRouter,
    orchestrator,
    messagingService,
    memoryStore,
    vaultSync,
    skillsManager,
    auditLogger,
    connectorRegistry,
    ...(schedulerService ? { schedulerService } : {}),
    mcpManager,
    hooksManager,
    startTime: new Date(),
  }

  // ── 5. Build Fastify app ────────────────────────────────────────────────────
  const loggerOptions: any = { level: config.gateway.logLevel }
  if (process.env['NODE_ENV'] !== 'production') {
    loggerOptions.transport = { target: 'pino-pretty', options: { colorize: true } }
  }
  const app = Fastify({ logger: loggerOptions })

  await app.register(fastifyCors, { origin: true, credentials: true })
  await app.register(fastifyRateLimit, {
    max: config.gateway.rateLimit.max,
    timeWindow: config.gateway.rateLimit.timeWindow,
    allowList: (request) => {
      // Don't rate-limit WebSocket upgrade connections
      return request.headers.upgrade?.toLowerCase() === 'websocket'
    },
  })
  await app.register(fastifyWebsocket)

  // ── 6. Auth Hook ────────────────────────────────────────────────────────────
  const PUBLIC_ROUTES = new Set(['/health', '/metrics', '/auth/login'])

  // JWT secret for dashboard sessions
  const jwtSecret = (credentials as any).gateway?.jwtSecret ?? credentials.gateway?.apiKey ?? 'changeme'
  const sessionMaxAgeHours = (config as any).dashboard?.sessionMaxAgeHours ?? 0
  // 0 = indefinite: JWT has no expiry check, cookie Max-Age set to 10 years
  const dashboardMaxAgeSeconds = sessionMaxAgeHours === 0 ? 315_360_000 : sessionMaxAgeHours * 3600
  const isSecure = (config as any).dashboard?.secure === true

  app.addHook('onResponse', (request, reply, done) => {
    const route = request.url.split('?')[0]!
    const method = request.method
    const status = String(reply.statusCode)
    metrics.httpRequestsTotal.inc({ method, route, status })
    metrics.httpRequestDurationMs.set(
      Math.round(reply.elapsedTime),
      { method, route, status }
    )
    done()
  })

  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0]!
    if (PUBLIC_ROUTES.has(url)) return

    const expectedKey = credentials.gateway?.apiKey ?? ''

    // 1. Bearer API key (CLI / programmatic access)
    const authHeader = request.headers['authorization'] ?? ''
    const bearerToken = authHeader.replace('Bearer ', '').trim()
    if (expectedKey && bearerToken === expectedKey) return

    // 2. Dashboard JWT cookie
    const cookieToken = parseCookieToken(request.headers['cookie'])
    if (cookieToken) {
      const cookieResult = verifyJwtWithReason(cookieToken, jwtSecret)
      if (cookieResult === 'valid') return
      if (cookieResult === 'expired') {
        void hooksManager.fire('auth.token.expired', { url: request.url, ip: request.ip })
      }
    }

    // 3. ?token= query parameter — used by WebSocket connections from the browser,
    //    which cannot send custom headers. Accepts either the raw API key or a JWT.
    const queryToken = (request.query as Record<string, string>)['token'] ?? ''
    if (queryToken) {
      if (expectedKey && queryToken === expectedKey) return
      const queryResult = verifyJwtWithReason(queryToken, jwtSecret)
      if (queryResult === 'valid') return
      if (queryResult === 'expired') {
        void hooksManager.fire('auth.token.expired', { url: request.url, ip: request.ip })
      }
    }

    void hooksManager.fire('auth.failed', {
      url: request.url,
      method: request.method,
      ip: request.ip,
    })
    await reply.status(401).send({ error: 'Unauthorized' })
  })

  // ── 7. Routes ───────────────────────────────────────────────────────────────

  // Vault routes plugin (registered after auth middleware)
  await app.register(registerVaultRoutes, { db, vaultSync })

  // Brain routes plugin
  await app.register(registerBrainRoutes, { db, ollamaUrl: config.modelRouter.providers.ollama.endpoint ?? `http://localhost:2005` })

  // Agent config routes
  await app.register(registerAgentConfigRoutes, { db })

  // Memory lifecycle routes
  await app.register(registerMemoryRoutes, { db })

  // Me route
  registerMeRoutes(app, { db })

  // Onboarding route
  registerOnboardingRoutes(app)

  // Routing profiles routes
  registerRoutingProfileRoutes(app, db, routingProfilesMap)
  orchestrator.setRoutingProfileLookup((id: string) => routingProfilesMap.get(id) ?? null)

  // Scheduler routes
  if (services.schedulerService) {
    registerSchedulerRoutes(app, services.schedulerService, (slug) => orchestrator.getAgent(slug), services.hooksManager)
  }

  // Health
  app.get('/health', async (_request, _reply): Promise<HealthStatus> => {
    const orchestratorStatus = await orchestrator.healthCheck()
    // Check postgres connectivity
    let postgresStatus: 'ok' | 'error' | 'disabled' = 'ok'
    try { await db.queryOne('SELECT 1', []) } catch { postgresStatus = 'error' }
    // Check redis connectivity via queueClient
    let redisStatus: 'ok' | 'error' | 'disabled' = queueClient ? 'ok' : 'disabled'
    if (queueClient) {
      try { await queueClient.getStats([]) } catch { redisStatus = 'error' }
    }
    return {
      status: orchestratorStatus === 'ok' && postgresStatus === 'ok' ? 'ok' : 'degraded',
      services: {
        orchestrator: orchestratorStatus,
        modelRouter: 'ok',
        postgres: postgresStatus,
        redis: redisStatus,
        messaging: messagingService ? 'ok' : 'disabled',
        vaultSync: vaultSync ? 'ok' : 'disabled',
      },
      version: '0.2.0',
      uptime: Math.floor((Date.now() - services.startTime.getTime()) / 1000),
    }
  })

  app.get('/health/:service', async (request, reply) => {
    const { service } = request.params as { service: string }
    const health = await orchestrator.healthCheck()
    const status = service === 'orchestrator' ? health : (service === 'modelRouter' ? 'ok' : 'disabled')
    return { service, status }
  })

  // Full diagnostics — authenticated, main agent only via system_diagnose tool,
  // or directly via Bearer token for the CLI / dashboard.
  app.get('/diagnostics', async (_request, _reply): Promise<DiagnosticsReport> => {
    if (!resolvedDiagnosticsProvider) {
      return {
        timestamp: new Date().toISOString(),
        system: { nodeVersion: process.versions.node, platform: process.platform, processUptime: 0, memoryMb: { heapUsed: 0, heapTotal: 0, rss: 0 } },
        services: { orchestrator: { status: 'initializing' }, modelRouter: { status: 'initializing' }, vaultSync: { status: 'initializing' }, database: { status: 'initializing' }, redis: { status: 'initializing' } },
        agents: [],
        pendingApprovals: 0,
        config: { profile: config.profile, defaultModel: config.modelRouter.defaultModel, enabledProviders: [] },
      }
    }
    return resolvedDiagnosticsProvider()
  })

  // Prometheus metrics (public — no auth required)
  app.get('/metrics', async (_request, reply) => {
    metrics.uptimeSeconds.set(Math.floor((Date.now() - services.startTime.getTime()) / 1000))
    metrics.skillsInstalled.set(services.skillsManager.list().length)
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    return reply.send(registry.render())
  })

  // Dashboard auth
  app.post('/auth/login', async (request, reply) => {
    const body = request.body as { apiKey?: string } | undefined
    const expectedKey = credentials.gateway?.apiKey ?? ''
    if (!expectedKey || body?.apiKey !== expectedKey) {
      void services.hooksManager.fire('auth.failed', { reason: 'Invalid API key' })
      return reply.status(401).send({ error: 'Invalid API key' })
    }
    const token = signJwt(jwtSecret, dashboardMaxAgeSeconds)
    reply.header('Set-Cookie', buildSetCookieHeader(token, dashboardMaxAgeSeconds, isSecure))
    void services.auditLogger.log({ action: 'auth.login', actor: 'dashboard' })
    void services.hooksManager.fire('auth.login', {})
    return { ok: true }
  })

  app.post('/auth/logout', async (_request, reply) => {
    reply.header('Set-Cookie', buildSetCookieHeader('', 0, isSecure))
    void services.auditLogger.log({ action: 'auth.logout', actor: 'dashboard' })
    void services.hooksManager.fire('auth.logout', {})
    return { ok: true }
  })

  app.get('/auth/me', async (request, reply) => {
    const cookieToken = parseCookieToken(request.headers['cookie'])
    const payload = cookieToken ? verifyJwt(cookieToken, jwtSecret) : null
    if (!payload) return reply.status(401).send({ error: 'Not authenticated' })
    return { sub: payload.sub, exp: payload.exp }
  })

  // Audit log
  app.get('/audit', async (request, reply) => {
    const q = request.query as Record<string, string>
    try {
      const opts: Parameters<typeof services.auditLogger.query>[0] = {
        limit: q['limit'] ? parseInt(q['limit']) : 100,
        offset: q['offset'] ? parseInt(q['offset']) : 0,
      }
      if (q['action']) opts.action = q['action'] as any
      if (q['actor']) opts.actor = q['actor']
      if (q['targetType']) opts.targetType = q['targetType']
      if (q['targetId']) opts.targetId = q['targetId']
      const rows = await services.auditLogger.query(opts)
      return { entries: rows, total: rows.length }
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // Sessions
  app.post('/sessions', async (request, reply) => {
    const body = request.body as { agentSlug?: string; client?: string; coordinatorMode?: boolean } | undefined
    const agentSlug = body?.agentSlug ?? 'main'
    const client = body?.client ?? 'cli'
    const coordinatorMode = body?.coordinatorMode ?? false
    const agent = orchestrator.getAgent(agentSlug)
    if (!agent) {
      return reply.status(404).send({ error: `Agent not found: ${agentSlug}` })
    }
    const session = await createSession(db, agent.identity.id, client, coordinatorMode)
    metrics.sessionsTotal.inc({ client })
    metrics.sessionsActive.inc({ agent: agentSlug })
    void services.auditLogger.log({
      action: 'session.create',
      actor: 'user',
      targetType: 'session',
      targetId: session.id,
      details: { agentSlug, client },
    })
    void services.hooksManager.fire('session.created', { sessionId: session.id, agentSlug, client })
    return { session }
  })

  app.get('/sessions', async (request) => {
    const { agent, client, limit: limitParam } = request.query as { agent?: string; client?: string; limit?: string }
    const maxLimit = Math.min(parseInt(limitParam ?? '50', 10), 200)

    const conditions: string[] = []
    const params: unknown[] = []
    if (agent) {
      params.push(agent)
      conditions.push(`a.slug = $${params.length}`)
    }
    if (client) {
      params.push(client)
      conditions.push(`s.client = $${params.length}`)
    }
    params.push(maxLimit)
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await db.query<Record<string, string>>(
      `SELECT s.*, a.slug as agent_slug, a.name as agent_name
       FROM sessions s
       LEFT JOIN agent_identities a ON a.id = s.agent_id
       ${where}
       ORDER BY s.pinned DESC, s.pinned_at ASC NULLS LAST, s.created_at DESC LIMIT $${params.length}`,
      params
    )
    return {
      sessions: rows.map(r => ({
        id: r['id']!, agentId: r['agent_id']!, agentSlug: r['agent_slug'] ?? null,
        agentName: r['agent_name'] ?? null, client: r['client']!,
        status: r['status']!, name: r['name'] ?? null,
        pinned: r['pinned'] === 'true', pinnedAt: r['pinned_at'] ?? null,
        createdAt: r['created_at']!, updatedAt: r['updated_at']!,
      })),
    }
  })

  app.patch('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; pinned?: boolean } | undefined
    const session = await getSession(db, id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    if (body?.name !== undefined) {
      const trimmed = body.name.trim()
      if (!trimmed) return reply.status(400).send({ error: 'name cannot be empty' })
      await db.execute(
        'UPDATE sessions SET name = $1, updated_at = NOW() WHERE id = $2',
        [trimmed, id]
      )
    }

    if (body?.pinned !== undefined) {
      await db.execute(
        'UPDATE sessions SET pinned = $1, pinned_at = $2, updated_at = NOW() WHERE id = $3',
        [body.pinned, body.pinned ? new Date().toISOString() : null, id]
      )
    }

    return { ok: true }
  })

  app.get('/sessions/:id/info', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = await getSession(db, id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })
    return { session }
  })

  app.get('/sessions/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = await getSession(db, id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })
    const rawMessages = await getSessionMessages(db, id)
    const messages = rawMessages.map(m => ({
      id: m['id']!,
      role: m['role'] as 'user' | 'assistant',
      content: m['content'] as string,
      createdAt: m['created_at'] as string,
    }))
    return { messages }
  })

  app.get('/sessions/search', async (request, reply) => {
    const query = (request.query as { q?: string }).q
    if (!query || query.trim().length < 2) return reply.send({ sessions: [] })

    const rows = await db.query<{
      id: string; name: string | null; agent_id: string; created_at: string; first_msg: string | null
    }>(`
      SELECT s.id, s.name, s.agent_id, s.created_at::text,
             (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY created_at LIMIT 1) AS first_msg
      FROM sessions s
      ORDER BY s.created_at DESC
      LIMIT 100
    `)

    const candidates = rows.map(r => ({
      id: r.id,
      name: r.name,
      agentId: r.agent_id,
      createdAt: r.created_at,
      firstMessage: r.first_msg,
      excerpt: null,
    }))

    const rankedIds = await rankSessionsByRelevance(query.trim(), candidates, modelRouter).catch(() => [])
    const rankedSessions = rankedIds.map(id => candidates.find(c => c.id === id)).filter(Boolean)
    return reply.send({ sessions: rankedSessions })
  })

  app.get('/sessions/:id/suggestions', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await db.query<{ role: string; content: string }>(
      `SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 6`,
      [id]
    )
    const messages = rows.reverse()
    const suggestions = await generatePromptSuggestions(messages, modelRouter).catch(() => [])
    return reply.send({ suggestions })
  })

  // Check for first-run onboarding (reads disk only once)
  let firstRunHandled = false

  app.post('/sessions/:id/send', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { content: string; model?: string }
    const invokeDepth = parseInt((request.headers['x-invoke-depth'] as string) ?? '0') || 0
    if (!body?.content) return reply.status(400).send({ error: 'content is required' })
    if (body.content.length > MAX_MESSAGE_LENGTH) {
      return reply.status(413).send({ error: `Message too large (max ${MAX_MESSAGE_LENGTH} characters)` })
    }

    const session = await getSession(db, id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    // Intercept /clear command before routing to orchestrator
    if (body.content.trim() === '/clear') {
      const agentSlug = session.agentId === 'main' ? 'main' : session.agentId
      const agentWorkspace = orchestrator.getAgent(agentSlug)?.identity.workspacePath
      await handleClearCommand(db, id, agentWorkspace)
      return { response: 'Session cleared.' }
    }

    const rawMessages = await getSessionMessages(db, id)
    const messages = rawMessages.map(m => ({
      id: m['id']!,
      sessionId: m['session_id']!,
      role: m['role'] as 'user' | 'assistant',
      content: m['content']!,
      createdAt: new Date(m['created_at']!),
    }))

    // Fire session.message hook (blocker) before saving — non-zero exit blocks delivery
    const msgHookResult = await services.hooksManager.fire('session.message', {
      sessionId: id,
      agentSlug: session.agentId,
      content: body.content,
    })
    if (msgHookResult.blocked) {
      return reply.status(403).send({ error: msgHookResult.reason ?? 'Blocked by session.message hook' })
    }

    await saveMessage(db, id, 'user', body.content)

    // Check for first-run onboarding (reads disk only once)
    let systemInjection: string | undefined
    if (!firstRunHandled) {
      const configPath = join(homedir(), '.agency', 'config.json')
      try {
        const rawCfg = JSON.parse(await readFile(configPath, 'utf-8'))
        if (rawCfg.firstRun === true) {
          systemInjection = FIRST_RUN_BOOTSTRAP
          rawCfg.firstRun = false
          await writeFile(configPath, JSON.stringify(rawCfg, null, 2), 'utf-8')
        }
      } catch { /* config not readable, skip */ }
      firstRunHandled = true
    }

    let fullResponse = ''
    const runOpts: Record<string, unknown> = {
      ...(systemInjection ? { systemInjection } : {}),
      invokeDepth,
    }
    try {
      for await (const chunk of orchestrator.run(session, body.content, messages as never, body.model, runOpts)) {
        if (chunk.type === 'text') fullResponse += chunk.text
      }
      void services.hooksManager.fire('session.complete', { sessionId: id, agentSlug: session.agentId })
    } catch (err) {
      void services.hooksManager.fire('session.error', { sessionId: id, agentSlug: session.agentId, error: (err as Error).message })
      throw err
    }

    await saveMessage(db, id, 'assistant', fullResponse)

    // Auto-name the session after the 3rd user message
    const userMessageCount = messages.filter(m => m.role === 'user').length + 1 // +1 for the one just saved
    if (userMessageCount === 3 && !session.name) {
      void (async () => {
        try {
          const agentRow = await db.queryOne<Record<string, string>>(
            'SELECT name FROM agent_identities WHERE id = $1',
            [session.agentId]
          )
          const agentDisplayName = agentRow?.['name'] ?? session.agentId
          const convoContext = [
            ...messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
            `User: ${body.content}`,
            `Assistant: ${fullResponse}`,
          ].join('\n').slice(0, 2000)

          const titleRes = await modelRouter.complete({
            model: modelRouter.resolveModel(config.modelRouter.defaultModel),
            messages: [{
              role: 'user',
              content: `Given this conversation, write a short title (3-6 words, no punctuation at end) that summarizes the topic. Only output the title, nothing else.\n\n${convoContext}`,
            }],
            maxTokens: 20,
          })
          const shortTitle = titleRes.content
            .filter((b): b is import('@agency/shared-types').TextBlock => b.type === 'text')
            .map(b => b.text).join('').trim().replace(/[.!?]+$/, '')
          if (shortTitle) {
            await db.execute(
              'UPDATE sessions SET name = $1, updated_at = NOW() WHERE id = $2',
              [`${agentDisplayName} | ${shortTitle}`, id]
            )
          }
        } catch (err) {
          console.error('[Session] Auto-naming failed:', err)
        }
      })()
    }

    return { response: fullResponse }
  })

  app.post('/sessions/:id/verify', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { taskDescription: string; filesChanged: string[]; approach?: string }

    if (!body.taskDescription || !body.filesChanged?.length) {
      return reply.status(400).send({ error: 'taskDescription and filesChanged are required' })
    }

    const session = await db.queryOne<{ agent_id: string }>(
      'SELECT agent_id FROM sessions WHERE id = $1',
      [id]
    )
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    const verifySessionId = randomUUID()
    await db.execute(
      'INSERT INTO sessions (id, agent_id, client, status) VALUES ($1, $2, $3, $4)',
      [verifySessionId, session.agent_id, 'verification', 'active']
    )

    const verificationPrompt = buildVerificationPrompt(body)

    const chunks: string[] = []
    try {
      for await (const chunk of orchestrator.run(
        { id: verifySessionId, agentId: session.agent_id } as any,
        verificationPrompt,
        [],
        undefined,
        { systemInjection: 'CRITICAL: You are in VERIFICATION-ONLY mode. You CANNOT edit, write, or create any files in the project directory.' }
      )) {
        if (chunk.type === 'text') chunks.push(chunk.text)
      }
    } finally {
      await db.execute('UPDATE sessions SET status = $1 WHERE id = $2', ['completed', verifySessionId])
    }

    const report = chunks.join('')
    const verdict = parseVerdict(report)

    return reply.send({ verdict, report, sessionId: verifySessionId })
  })

  app.delete('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = await getSession(db, id)
    if (!session) return reply.status(404).send({ error: 'Session not found' })
    await db.query('DELETE FROM messages WHERE session_id = $1', [id])
    await db.query('DELETE FROM sessions WHERE id = $1', [id])
    void services.hooksManager.fire('session.deleted', { sessionId: id })
    return { ok: true }
  })

  // Focus state tracking — true when socket is open, false when closed
  const focusMap = new Map<string, boolean>()

  // WebSocket streaming session
  app.get('/sessions/:id', { websocket: true }, async (socket, request) => {
    const { id } = request.params as { id: string }
    console.log('[WS] connection opened for session', id, 'readyState:', socket.readyState)
    focusMap.set(id, true)

    socket.on('error', (err) => console.error('[WS] socket error:', err))

    // Buffer messages that arrive before async setup completes
    const earlyMessages: unknown[] = []
    const earlyListener = (raw: unknown) => earlyMessages.push(raw)
    socket.on('message', earlyListener)

    let session: Session | null = null
    try {
      session = await getSession(db, id)
    } catch (err) {
      console.error('[WS] getSession threw:', err)
      socket.close()
      return
    }

    if (!session) {
      console.log('[WS] session not found:', id)
      socket.send(JSON.stringify({ type: 'error', error: 'Session not found' }))
      socket.close()
      return
    }

    console.log('[WS] session found, waiting for messages')

    // Away summary: if session has been idle 30+ minutes, send a brief recap
    const AWAY_THRESHOLD_MS = 30 * 60 * 1000
    const lastActivity = new Date((session as unknown as { updated_at?: string; created_at: string }).updated_at ?? (session as unknown as { created_at: string }).created_at).getTime()
    if (Date.now() - lastActivity > AWAY_THRESHOLD_MS) {
      const recentMsgs = await db.query<{ role: string; content: string }>(
        `SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [session.id]
      ).catch(() => [])
      if (recentMsgs.length > 0) {
        const transcript = recentMsgs.reverse().map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
        modelRouter.complete({
          model: modelRouter.resolveModel('cheap'),
          messages: [{
            role: 'user',
            content: `Write 1-2 sentences recapping this session for a returning user. Start with "Last session:". Be specific about what was worked on.\n\n${transcript}`,
          }],
          maxTokens: 100,
        }).then(response => {
          const recap = typeof response.content === 'string'
            ? response.content
            : (response.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: 'away_summary', text: recap.trim() }))
          }
        }).catch(() => { /* non-fatal */ })
      }
    }

    // Switch from early-buffer listener to real handler
    socket.off('message', earlyListener)
    // Serialize message handling per session to prevent race conditions
    let messageQueue = Promise.resolve()
    const handleMessage = (raw: any) => {
      messageQueue = messageQueue.then(async () => {
        let data: { content: string; model?: string }
        try {
          data = JSON.parse(raw.toString()) as { content: string; model?: string }
        } catch {
          socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
          return
        }

        if (!data.content) {
          socket.send(JSON.stringify({ type: 'error', error: 'content is required' }))
          return
        }
        if (data.content.length > MAX_MESSAGE_LENGTH) {
          socket.send(JSON.stringify({ type: 'error', error: `Message too large (max ${MAX_MESSAGE_LENGTH} characters)` }))
          return
        }

        const rawMessages = await getSessionMessages(db, id)
        const messages = rawMessages.map(m => ({
          id: m['id']!,
          sessionId: m['session_id']!,
          role: m['role'] as 'user' | 'assistant',
          content: m['content']!,
          createdAt: new Date(m['created_at']!),
        }))

        // Intercept /clear command before routing to orchestrator
        if (data.content.trim() === '/clear') {
          const wsAgentSlug = session.agentId === 'main' ? 'main' : session.agentId
          const wsAgentWorkspace = orchestrator.getAgent(wsAgentSlug)?.identity.workspacePath
          await handleClearCommand(db, id, wsAgentWorkspace)
          socket.send(JSON.stringify({ type: 'text', text: 'Session cleared.' }))
          socket.send(JSON.stringify({ type: 'done' }))
          return
        }

        await saveMessage(db, id, 'user', data.content)

        // Check for first-run onboarding (reads disk only once)
        let wsSystemInjection: string | undefined
        if (!firstRunHandled) {
          const wsCfgPath = join(homedir(), '.agency', 'config.json')
          try {
            const wsRawCfg = JSON.parse(await readFile(wsCfgPath, 'utf-8'))
            if (wsRawCfg.firstRun === true) {
              wsSystemInjection = FIRST_RUN_BOOTSTRAP
              wsRawCfg.firstRun = false
              await writeFile(wsCfgPath, JSON.stringify(wsRawCfg, null, 2), 'utf-8')
            }
          } catch { /* config not readable, skip */ }
          firstRunHandled = true
        }

        // Apply coordinator injection when session is in coordinator mode
        if (session.coordinatorMode) {
          const workerRows = await db.query<{ slug: string }>(
            `SELECT slug FROM agents WHERE status = 'active' AND id != $1`,
            [session.agentId]
          ).catch(() => [] as { slug: string }[])
          wsSystemInjection = getCoordinatorInjection(true, workerRows.map(r => r.slug), wsSystemInjection)
        }

        let fullResponse = ''
        const wsRunOpts = wsSystemInjection ? { systemInjection: wsSystemInjection } : undefined
        const tagParser = new TagParserSession()
        try {
          for await (const chunk of orchestrator.run(session, data.content, messages as never, data.model, wsRunOpts)) {
            if (chunk.type === 'text' && chunk.text) {
              const { text, events } = tagParser.push(chunk.text)
              if (text) {
                socket.send(JSON.stringify({ type: 'text', text }))
                fullResponse += text
              }
              for (const evt of events) {
                socket.send(JSON.stringify(evt))
              }
            } else {
              socket.send(JSON.stringify(chunk))
            }
            if (chunk.type === 'tool_call') metrics.toolCallsTotal.inc({ tool: chunk.toolName })
            else if (chunk.type === 'tool_result' && !chunk.success) metrics.toolCallErrorsTotal.inc({ tool: chunk.toolName })
          }
          const { text: finalText, events: finalEvents } = tagParser.done()
          if (finalText) {
            socket.send(JSON.stringify({ type: 'text', text: finalText }))
            fullResponse += finalText
          }
          for (const evt of finalEvents) {
            socket.send(JSON.stringify(evt))
          }
        } catch (err) {
          socket.send(JSON.stringify({ type: 'error', error: String(err) }))
        }

        if (fullResponse) {
          await saveMessage(db, id, 'assistant', fullResponse)
        }
      }).catch((err) => {
        console.error('[WS] Unhandled message handler error:', err)
        socket.send(JSON.stringify({ type: 'error', error: 'Internal error' }))
      })
    }
    socket.on('message', handleMessage)

    // Proactive loop — start for agents with proactive:true
    const agentSlugForProactive = session.agentId === 'main' ? 'main' : session.agentId
    const agentForProactive = orchestrator.getAgent(agentSlugForProactive)
    if (agentForProactive?.profile.behaviorSettings.proactive === true) {
      const intervalMs = (agentForProactive.profile.behaviorSettings.proactiveIntervalSeconds ?? 60) * 1000
      const loop = new ProactiveLoop({
        agentSlug: agentSlugForProactive,
        sessionId: id,
        tickIntervalMs: intervalMs,
        isFocused: () => focusMap.get(id) ?? false,
        onTick: async (tickMessage) => {
          const tickMessages = await db.query<{ role: string; content: string; id: string; session_id: string; created_at: string }>(
            'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
            [id]
          )
          for await (const chunk of orchestrator.run(
            session,
            tickMessage,
            tickMessages as never,
            undefined,
            { systemInjection: buildProactiveSystemPrompt() }
          )) {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify(chunk))
            }
          }
        },
      })
      loop.start()
      socket.on('close', () => {
        focusMap.set(id, false)
        loop.stop()
      })
    } else {
      socket.on('close', () => focusMap.set(id, false))
    }

    // Replay any messages that arrived during async setup
    for (const msg of earlyMessages) handleMessage(msg)
  })

  // Agents
  const relWs = (p: string) => p.startsWith(agencyDir + '/') ? p.slice(agencyDir.length + 1) : p
  const withRelativeWs = <T extends { identity: { workspacePath: string; additionalWorkspacePaths: string[] } }>(
    agent: T, extra?: { lockedWorkspacePaths?: string[] }
  ) => ({
    ...agent,
    identity: {
      ...agent.identity,
      workspacePath: relWs(agent.identity.workspacePath),
      additionalWorkspacePaths: agent.identity.additionalWorkspacePaths.map(relWs),
    },
    ...(extra?.lockedWorkspacePaths ? { lockedWorkspacePaths: extra.lockedWorkspacePaths.map(relWs) } : {}),
  })

  app.get('/agents', async () => {
    return { agents: orchestrator.listAgents().map(a => withRelativeWs(a)) }
  })

  app.get('/agents/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    const allPrimaries = new Set(
      orchestrator.listAgents()
        .filter(a => a.identity.slug !== slug)
        .map(a => a.identity.workspacePath)
    )
    const lockedWorkspacePaths = agent.identity.additionalWorkspacePaths.filter(p => allPrimaries.has(p))
    return { agent: withRelativeWs(agent, { lockedWorkspacePaths }) }
  })

  // POST /agents/architect — generate agent spec from description
  app.post('/agents/architect', async (req, reply) => {
    const body = req.body as { description?: string }
    if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
      return reply.status(400).send({ error: 'description is required' })
    }
    try {
      const spec = await orchestrator.architectAgent(body.description.trim())
      return reply.send(spec)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ error: `Architect failed: ${msg}` })
    }
  })

  app.post('/agents', async (request, reply) => {
    const body = request.body as {
      name?: string
      profileSlug?: string
      lifecycleType?: string
      wakeMode?: string
      shellPermissionLevel?: string
      agentManagementPermission?: string
    }
    if (!body?.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    try {
      const createInput: Parameters<typeof orchestrator.createAgent>[0] = {
        name: body.name.trim(),
        lifecycleType: (body.lifecycleType ?? 'dormant') as 'always_on' | 'dormant',
      }
      if (body.profileSlug) createInput.profileSlug = body.profileSlug
      if (body.shellPermissionLevel) createInput.shellPermissionLevel = body.shellPermissionLevel
      const result = await orchestrator.createAgent(createInput)
      // Apply wakeMode and agentManagementPermission if provided (createAgent defaults them)
      if (body.wakeMode || body.agentManagementPermission) {
        await orchestrator.updateAgentIdentity(result.agent.slug, {
          ...(body.wakeMode ? { wakeMode: body.wakeMode as import('@agency/shared-types').WakeMode } : {}),
          ...(body.agentManagementPermission ? { agentManagementPermission: body.agentManagementPermission as import('@agency/shared-types').AgentManagementPermission } : {}),
        })
      }
      const created = orchestrator.getAgent(result.agent.slug)
      return reply.status(201).send({ agent: created ? withRelativeWs(created) : created })
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  app.post('/agents/:slug/enable', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    await orchestrator.enableAgent(slug)
    void services.hooksManager.fire('agent.enabled', { agentSlug: slug })
    return { ok: true }
  })

  app.post('/agents/:slug/disable', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    if (BUILT_IN_AGENTS.includes(slug as BuiltInAgentSlug)) return reply.status(400).send({ error: 'Cannot disable a built-in agent' })
    await orchestrator.disableAgent(slug)
    void services.hooksManager.fire('agent.disabled', { agentSlug: slug })
    return { ok: true }
  })

  app.patch('/agents/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as {
      name?: string
      lifecycleType?: string
      wakeMode?: string
      shellPermissionLevel?: string
      agentManagementPermission?: string
    }
    if (!body || Object.keys(body).length === 0) return reply.status(400).send({ error: 'No fields to update' })
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    try {
      await orchestrator.updateAgentIdentity(slug, body as Parameters<typeof orchestrator.updateAgentIdentity>[1])
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
    return { ok: true, agent: orchestrator.getAgent(slug)?.identity }
  })

  app.patch('/agents/:slug/model-config', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as AgentModelConfig
    if (!body?.mode || !['inherit', 'specific', 'auto_router'].includes(body.mode)) {
      return reply.status(400).send({ error: 'Invalid mode' })
    }
    if (body.mode === 'specific' && (!body.specific?.model || !body.specific?.provider)) {
      return reply.status(400).send({ error: 'specific.model and specific.provider are required when mode is "specific"' })
    }
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })

    await db.execute(
      'UPDATE agent_identities SET model_config=$1 WHERE slug=$2',
      [JSON.stringify(body), slug]
    )
    orchestrator.setAgentModelConfig(slug, body)
    return { ok: true, modelConfig: body }
  })

  // Agent workspace browser
  app.get('/agents/:slug/workspace', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const query = request.query as { path?: string; root?: string }
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    const { readdir, stat } = await import('node:fs/promises')
    const { join, resolve, normalize } = await import('node:path')

    // Resolve which workspace root to use
    const primaryWs = agent.identity.workspacePath
    let ws = primaryWs
    if (query.root) {
      const additionalPaths = agent.identity.additionalWorkspacePaths ?? []
      const absRoot = resolve(agencyDir, query.root)
      if (!additionalPaths.includes(absRoot)) {
        return reply.status(403).send({ error: 'Root path is not a configured workspace' })
      }
      ws = absRoot
    }

    const subPath = query.path ? normalize(query.path) : ''
    const targetDir = subPath ? resolve(join(ws, subPath)) : ws
    if (!isInsideWorkspace(ws, targetDir)) return reply.status(403).send({ error: 'Path is outside workspace' })
    try {
      const entries = await readdir(targetDir, { withFileTypes: true })
      const files = await Promise.all(
        entries.map(async e => {
          const info = await stat(join(targetDir, e.name)).catch(() => null)
          return {
            name: e.name,
            type: e.isDirectory() ? 'dir' : 'file',
            size: info && !e.isDirectory() ? info.size : null,
            modifiedAt: info ? info.mtime.toISOString() : null,
          }
        })
      )
      return { workspacePath: targetDir, files }
    } catch {
      return reply.status(500).send({ error: 'Failed to read workspace' })
    }
  })

  app.get('/agents/:slug/workspace/file', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const query = request.query as { path?: string; root?: string }
    const filePath = query.path
    if (!filePath) return reply.status(400).send({ error: 'path is required' })
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    const { readFile } = await import('node:fs/promises')
    const { join, resolve, normalize } = await import('node:path')

    const primaryWs = agent.identity.workspacePath
    let ws = primaryWs
    if (query.root) {
      const additionalPaths = agent.identity.additionalWorkspacePaths ?? []
      const absRoot = resolve(agencyDir, query.root)
      if (!additionalPaths.includes(absRoot)) {
        return reply.status(403).send({ error: 'Root path is not a configured workspace' })
      }
      ws = absRoot
    }

    const abs = resolve(join(ws, normalize(filePath)))
    if (!isInsideWorkspace(ws, abs)) return reply.status(403).send({ error: 'Path is outside workspace' })
    try {
      const content = await readFile(abs, 'utf8')
      return { path: filePath, content }
    } catch {
      return reply.status(404).send({ error: 'File not found' })
    }
  })

  app.put('/agents/:slug/workspace/file', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const query = request.query as { path?: string }
    const filePath = query.path
    const body = request.body as { content?: string } | undefined
    if (!filePath) return reply.status(400).send({ error: 'path is required' })
    if (body?.content === undefined) return reply.status(400).send({ error: 'content is required' })
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    const { writeFile } = await import('node:fs/promises')
    const { join, resolve, normalize } = await import('node:path')
    const ws = agent.identity.workspacePath
    const abs = resolve(join(ws, normalize(filePath)))
    if (!isInsideWorkspace(ws, abs)) return reply.status(403).send({ error: 'Path is outside workspace' })
    // Only allow editing markdown files in workspace root (context files)
    const EDITABLE = new Set(['identity.md', 'soul.md', 'user.md'])
    if (!EDITABLE.has(filePath)) return reply.status(403).send({ error: 'Only context files can be edited via API' })
    await writeFile(abs, body.content, 'utf8')
    void services.auditLogger.log({ action: 'agent.context_edit', actor: 'user', targetType: 'agent', targetId: slug, details: { file: filePath } })
    return { ok: true }
  })

  // Profiles
  app.get('/profiles', async () => {
    const profiles = await orchestrator.listAllProfiles()
    return { profiles }
  })

  app.post('/profiles', async (request, reply) => {
    const body = request.body as {
      name?: string; slug?: string; description?: string; systemPrompt?: string
      modelTier?: string; allowedTools?: string[]; tags?: string[]
    } | undefined
    if (!body?.name || !body?.slug || !body?.systemPrompt) {
      return reply.status(400).send({ error: 'name, slug, and systemPrompt are required' })
    }
    const createOpts: Parameters<typeof orchestrator.createProfile>[0] = {
      name: body.name,
      slug: body.slug,
      description: body.description ?? '',
      systemPrompt: body.systemPrompt,
      modelTier: body.modelTier === 'cheap' ? 'cheap' : 'strong',
    }
    if (body.allowedTools) createOpts.allowedTools = body.allowedTools
    if (body.tags) createOpts.tags = body.tags
    const profile = await orchestrator.createProfile(createOpts)
    void services.auditLogger.log({ action: 'profile.create', actor: 'user', targetType: 'profile', targetId: profile.id })
    return { ok: true, profile }
  })

  app.post('/agents/:slug/profile', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    if (BUILT_IN_AGENTS.includes(slug as BuiltInAgentSlug)) return reply.status(400).send({ error: 'Built-in agent profiles are fixed and cannot be changed.' })
    const body = request.body as { profileSlug?: string } | undefined
    const profileSlug = body?.profileSlug
    if (!profileSlug) return reply.status(400).send({ error: 'profileSlug is required' })
    await orchestrator.switchProfile(slug, profileSlug)
    void services.hooksManager.fire('agent.profile.changed', { agentSlug: slug, profileSlug })
    return { ok: true }
  })

  app.post('/agents/:slug/workspaces', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as { path?: string } | undefined
    if (!body?.path) return reply.status(400).send({ error: 'path is required' })
    if (!body.path.startsWith('/')) return reply.status(400).send({ error: 'path must be absolute' })
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    try {
      await orchestrator.addWorkspacePath(slug, body.path)
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
    void services.auditLogger.log({ action: 'agent.workspace_add', actor: 'user', targetType: 'agent', targetId: slug, details: { path: body.path } })
    return { ok: true, additionalWorkspacePaths: (orchestrator.getAgent(slug)?.identity.additionalWorkspacePaths ?? []).map(relWs) }
  })

  app.delete('/agents/:slug/workspaces', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const body = request.body as { path?: string } | undefined
    if (!body?.path) return reply.status(400).send({ error: 'path is required' })
    const agent = orchestrator.getAgent(slug)
    if (!agent) return reply.status(404).send({ error: 'Agent not found' })
    try {
      await orchestrator.removeWorkspacePath(slug, body.path)
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
    void services.auditLogger.log({ action: 'agent.workspace_remove', actor: 'user', targetType: 'agent', targetId: slug, details: { path: body.path } })
    return { ok: true, additionalWorkspacePaths: (orchestrator.getAgent(slug)?.identity.additionalWorkspacePaths ?? []).map(relWs) }
  })

  // Approvals
  app.get('/approvals', async () => {
    const approvals = await db.query(
      "SELECT * FROM approvals WHERE status='pending' ORDER BY requested_at DESC"
    )
    return { approvals }
  })

  app.get('/approvals/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const approval = await db.queryOne('SELECT * FROM approvals WHERE id=$1', [id])
    if (!approval) return reply.status(404).send({ error: 'Approval not found' })
    return { approval }
  })

  app.post('/approvals/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { note?: string } | undefined
    const note = body?.note

    // Step 1: Atomically claim the approval (prevents double-execution)
    const claimed = await db.queryOne<{ id: string; tool_name: string; tool_input: unknown; agent_id: string; session_id: string }>(
      `UPDATE approvals SET status='processing' WHERE id=$1 AND status='pending' RETURNING id, tool_name, tool_input, agent_id, session_id`,
      [id]
    )
    if (!claimed) {
      const existing = await db.queryOne<{ status: string }>('SELECT status FROM approvals WHERE id=$1', [id])
      if (!existing) return reply.status(404).send({ error: 'Approval not found' })
      return reply.status(409).send({ error: `Approval already ${existing.status}` })
    }

    // Step 2: Execute side effect
    let sideEffect: unknown = null
    try {
      if (claimed.tool_name === 'agent_create') {
        const rawInput = typeof claimed.tool_input === 'string'
          ? JSON.parse(claimed.tool_input)
          : claimed.tool_input
        if (!rawInput || typeof rawInput !== 'object' || typeof (rawInput as any).slug !== 'string') {
          throw new Error('Invalid tool_input for agent_create: missing slug')
        }
        sideEffect = await services.orchestrator.createAgent(rawInput as Parameters<typeof services.orchestrator.createAgent>[0])
      } else if (claimed.tool_name === 'agent_delete') {
        const rawInput = typeof claimed.tool_input === 'string'
          ? JSON.parse(claimed.tool_input)
          : claimed.tool_input
        if (!rawInput || typeof rawInput !== 'object' || typeof (rawInput as any).slug !== 'string') {
          throw new Error('Invalid tool_input for agent_delete: missing slug')
        }
        sideEffect = await services.orchestrator.deleteAgent(rawInput as { slug: string })
      }
      // Step 3: Mark approved on success
      await db.execute(
        `UPDATE approvals SET status='approved', resolved_at=NOW(), note=$2 WHERE id=$1`,
        [id, note ?? null]
      )
      metrics.approvalOutcomesTotal.inc({ decision: 'approved' })
      void services.auditLogger.log({ action: 'approval.approve', actor: 'user', targetType: 'approval', targetId: id, details: { tool: claimed.tool_name } })
      void services.hooksManager.fire('approval.approved', { approvalId: id, toolName: claimed.tool_name })
      return reply.send({ ok: true, result: sideEffect })
    } catch (err) {
      // Step 4: Reset to pending so it can be retried
      await db.execute(
        `UPDATE approvals SET status='pending', note=$2 WHERE id=$1`,
        [id, `Side effect failed: ${String(err)}`]
      )
      return reply.status(500).send({ error: `Side effect failed: ${String(err)}` })
    }
  })

  app.post('/approvals/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { note?: string } | undefined

    // Verify the approval exists and is in a rejectable state
    const existing = await db.queryOne<{ status: string }>(
      'SELECT status FROM approvals WHERE id=$1',
      [id]
    )
    if (!existing) return reply.status(404).send({ error: 'Approval not found' })
    if (existing.status !== 'pending') {
      return reply.status(409).send({ error: `Approval already ${existing.status}` })
    }

    await db.execute(
      "UPDATE approvals SET status='rejected', resolved_at=NOW(), note=$2 WHERE id=$1",
      [id, body?.note ?? null]
    )
    metrics.approvalOutcomesTotal.inc({ decision: 'rejected' })
    void services.auditLogger.log({ action: 'approval.reject', actor: 'user', targetType: 'approval', targetId: id })
    void services.hooksManager.fire('approval.rejected', { approvalId: id })
    return { ok: true }
  })

  // Logs
  app.get('/logs/:service', async (request, _reply) => {
    const { service } = request.params as { service: string }
    const query = request.query as { n?: string }
    const parsed = parseInt(query.n ?? '100', 10)
    const n = Math.min(isNaN(parsed) ? 100 : parsed, MAX_LOG_LINES)
    return { lines: logBuffer.tail(service, n) }
  })

  app.get('/logs/:service/stream', { websocket: true }, async (socket, request) => {
    const { service } = request.params as { service: string }

    // Send buffered history first
    const history = logBuffer.tail(service, 50)
    for (const line of history) {
      socket.send(JSON.stringify(line))
    }

    // Stream new lines
    const onLine = (line: LogLine) => {
      if (service === 'all' || line.service === service) {
        socket.send(JSON.stringify(line))
      }
    }
    logBuffer.on('line', onLine)

    socket.on('close', () => {
      logBuffer.off('line', onLine)
    })
  })

  // Models
  app.get('/models', async (_request, _reply) => {
    const { modelRouter: mr } = services.config
    const allModels = await services.modelRouter.listAllModels()
    return {
      models: allModels.map(m => ({
        ...m,
        isDefault: m.name === mr.defaultModel,
      })),
      defaultModel: mr.defaultModel,
      tiers: mr.tiers,
    }
  })

  app.post('/models/pull', async (request, reply) => {
    const body = request.body as { model?: string } | undefined
    if (!body?.model) return reply.status(400).send({ error: 'model is required' })
    if (!services.modelRouter.ollamaEnabled) {
      return reply.status(503).send({ error: 'Ollama is not enabled in config' })
    }
    // Stream pull progress as newline-delimited JSON
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    })
    try {
      for await (const line of services.modelRouter.pullOllamaModel(body.model)) {
        reply.raw.write(line + '\n')
      }
      reply.raw.end()
    } catch (err) {
      reply.raw.write(JSON.stringify({ error: String(err) }) + '\n')
      reply.raw.end()
    }
    return reply
  })

  app.post('/models/test', async (request, reply) => {
    const body = request.body as { model?: string } | undefined
    const model = body?.model ?? services.config.modelRouter.defaultModel
    const start = Date.now()
    try {
      const response = await services.modelRouter.complete({
        model: services.modelRouter.resolveModel(model),
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        maxTokens: 10,
      })
      return { ok: true, model, latencyMs: Date.now() - start, response: response.content }
    } catch (err) {
      return reply.status(500).send({ ok: false, error: String(err) })
    }
  })

  app.put('/models/default', async (request, reply) => {
    const body = request.body as { model: string } | undefined
    if (!body?.model) return reply.status(400).send({ error: 'model is required' })
    services.config.modelRouter.defaultModel = body.model
    services.config.modelRouter.tiers.cheap = body.model
    services.config.modelRouter.tiers.strong = body.model
    // Persist to config.json so the change survives restart
    const configPath = join(homedir(), '.agency', 'config.json')
    try {
      const raw = JSON.parse(await readFile(configPath, 'utf-8'))
      raw.modelRouter = raw.modelRouter ?? {}
      raw.modelRouter.defaultModel = body.model
      raw.modelRouter.tiers = { ...raw.modelRouter.tiers, cheap: body.model, strong: body.model }
      await writeFile(configPath, JSON.stringify(raw, null, 2), 'utf-8')
    } catch (err) {
      console.error('[Gateway] Failed to persist default model to config:', err)
      // Non-fatal — in-memory update succeeded
    }
    void services.hooksManager.fire('config.changed', { key: 'modelRouter.defaultModel', value: body.model })
    return { ok: true, defaultModel: body.model }
  })

  // Connectors
  app.get('/connectors', async () => {
    return { connectors: services.connectorRegistry.list() }
  })

  app.get('/connectors/discord/agents', async () => {
    try {
      const { readFile } = await import('node:fs/promises')
      const { homedir } = await import('node:os')
      const { join: pathJoin } = await import('node:path')
      const raw = await readFile(pathJoin(homedir(), '.agency', 'config.json'), 'utf8')
      const cfg = JSON.parse(raw) as Record<string, unknown>
      const discordCfg = (cfg['connectors'] as Record<string, unknown> | undefined)?.['discord'] as Record<string, unknown> | undefined
      const agentsCfg = (discordCfg?.['agents'] ?? {}) as Record<string, { enabled?: boolean }>
      const agentEntries = Object.entries(agentsCfg).map(([slug, agentCfg]) => ({
        slug,
        enabled: agentCfg?.enabled ?? false,
      }))
      return { agents: agentEntries }
    } catch {
      return { agents: [] }
    }
  })

  app.post('/connectors/:name/enable', async (request, reply) => {
    const { name } = request.params as { name: string }
    const body = request.body as Record<string, unknown> | undefined
    const cfg = (services.config as any).connectors?.[name] as Record<string, unknown> | undefined

    try {
      if (name === 'discord') {
        const token = (body?.['token'] ?? cfg?.['token']) as string | undefined
        if (!token) return reply.status(400).send({ error: 'token is required for Discord connector' })
        const discordCfg: import('./connectors/discord.js').DiscordConfig = { token }
        const da = (body?.['defaultAgent'] ?? cfg?.['defaultAgent']) as string | undefined
        const ac = (body?.['allowedChannels'] ?? cfg?.['allowedChannels']) as string[] | undefined
        const ar = (body?.['allowedRoles'] ?? cfg?.['allowedRoles']) as string[] | undefined
        if (da) discordCfg.defaultAgent = da
        if (ac) discordCfg.allowedChannels = ac
        if (ar) discordCfg.allowedRoles = ar
        await services.connectorRegistry.enableDiscord(discordCfg)
      } else {
        return reply.status(404).send({ error: `Unknown connector: ${name}` })
      }
      void services.auditLogger.log({ action: 'connector.enable', actor: 'user', targetType: 'connector', targetId: name })
      void services.hooksManager.fire('connector.connected', { connectorName: name })
      return { ok: true, connector: name, enabled: true }
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  app.post('/connectors/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      await services.connectorRegistry.disableConnector(name)
      void services.auditLogger.log({ action: 'connector.disable', actor: 'user', targetType: 'connector', targetId: name })
      void services.hooksManager.fire('connector.disconnected', { connectorName: name })
      return { ok: true, connector: name, enabled: false }
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // Skills
  registerSkillRoutes(app, services.skillsManager, services.auditLogger, services.hooksManager)
  registerAgentSkillRoutes(app, db, services.skillsManager, services.auditLogger, services.hooksManager)
  await registerGroupRoutes(app, db, services.auditLogger)
  await registerWorkspaceRoutes(app, db)

  app.get('/skills', async () => {
    const skills = services.skillsManager.list()
    return { skills, total: skills.length }
  })

  app.get('/skills/library', async () => {
    const skills = await services.skillsManager.listLocalLibrary()
    return { skills, total: skills.length }
  })

  app.post('/skills/install', async (request, reply) => {
    const body = request.body as { name?: string; localPath?: string } | undefined
    const name = body?.name?.trim()
    if (!name) return reply.status(400).send({ error: 'name is required' })
    if (!body?.localPath) return reply.status(400).send({ error: 'localPath is required' })
    try {
      const skill = await services.skillsManager.install(name, { localPath: body.localPath })
      void services.auditLogger.log({ action: 'skill.install', actor: 'user', targetType: 'skill', targetId: name, details: { version: skill.version } })
      void services.hooksManager.fire('skill.installed', { skillName: name, version: skill.version })
      return { ok: true, skill }
    } catch (err) {
      const msg = (err as Error).message
      const status = msg.includes('already installed') ? 409 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  app.delete('/skills/:name', async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      await services.skillsManager.remove(name)
      void services.auditLogger.log({ action: 'skill.remove', actor: 'user', targetType: 'skill', targetId: name })
      void services.hooksManager.fire('skill.removed', { skillName: name })
      return { ok: true, name, status: 'pending_restart' }
    } catch (err) {
      const msg = (err as Error).message
      const status = msg.includes('not installed') ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // Messaging
  app.get('/messaging/status', async (_request, reply) => {
    if (!services.messagingService) {
      return reply.status(503).send({ error: 'Messaging service not available (Redis not configured)' })
    }
    try {
      const agentList = orchestrator.listAgents()
      const agentIds = agentList.map(a => a.identity.id)
      const [depths, recent] = await Promise.all([
        services.messagingService.getInboxDepths(agentIds),
        services.messagingService.getRecentMessages(50),
      ])
      // Map agentId -> slug/name for UI
      const idToAgent = new Map(agentList.map(a => [a.identity.id, { slug: a.identity.slug, name: a.identity.name }]))
      return {
        inboxDepths: depths.map(d => ({
          ...d,
          agentSlug: idToAgent.get(d.agentId)?.slug ?? d.agentId,
          agentName: idToAgent.get(d.agentId)?.name ?? d.agentId,
        })),
        recentMessages: recent,
      }
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // ── Queue Monitor ─────────────────────────────────────────────────────────
  const QUEUE_NAMES = ['queue:shell', 'queue:browser', 'queue:code', 'queue:planner', 'queue:ingestion']

  app.get('/queue/stats', async (_request, reply) => {
    if (!queueClient) {
      return reply.status(503).send({ error: 'Queue client not available (Redis not configured)' })
    }
    try {
      const queues = await queueClient.getStats(QUEUE_NAMES)
      return { queues }
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  app.get('/queue/workers', async (_request, reply) => {
    if (!queueClient) {
      return reply.status(503).send({ error: 'Queue client not available (Redis not configured)' })
    }
    try {
      const rawWorkers = await queueClient.getQueueWorkers(QUEUE_NAMES)
      // Group by queue and deduplicate by addr to build worker list
      const seenAddrs = new Set<string>()
      const workers: Array<{ name: string; status: 'running'; pid: null; startedAt: null; restartCount: number }> = []
      for (const w of rawWorkers) {
        if (!seenAddrs.has(w.addr)) {
          seenAddrs.add(w.addr)
          const workerName = w.queueName.replace('queue:', '') + '-worker'
          workers.push({ name: workerName, status: 'running', pid: null, startedAt: null, restartCount: 0 })
        }
      }
      return { workers }
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // ── Tools ─────────────────────────────────────────────────────────────────
  registerToolRoutes(app, db, toolRegistry, services.auditLogger, services.hooksManager)

  // ── Hooks ─────────────────────────────────────────────────────────────────
  app.get('/hooks', async () => {
    return { hooks: await services.hooksManager.list() }
  })

  app.post('/hooks', async (request, reply) => {
    const body = request.body as { name?: string; event?: string; command?: string; matcher?: Record<string, unknown> | null; enabled?: boolean } | undefined
    if (!body?.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    if (!body?.event?.trim()) return reply.status(400).send({ error: 'event is required' })
    if (!body?.command?.trim()) return reply.status(400).send({ error: 'command is required' })
    try {
      const hook = await services.hooksManager.create({
        name: body.name.trim(),
        event: body.event.trim(),
        command: body.command.trim(),
        matcher: body.matcher ?? null,
        enabled: body.enabled ?? true,
      })
      return reply.status(201).send({ hook })
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  app.patch('/hooks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; command?: string; matcher?: Record<string, unknown> | null; enabled?: boolean } | undefined
    try {
      const hook = await services.hooksManager.update(id, body ?? {})
      return { hook }
    } catch (err) {
      const msg = (err as Error).message
      return reply.status(msg.includes('not found') ? 404 : 500).send({ error: msg })
    }
  })

  app.delete('/hooks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await services.hooksManager.delete(id)
      return { ok: true }
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // ── MCP ───────────────────────────────────────────────────────────────────
  registerMcpRoutes(app, db, mcpManager, services.auditLogger, services.hooksManager)

  // ── 8. Start listening ──────────────────────────────────────────────────────
  const { host, port } = config.gateway
  await app.listen({ host, port })
  await writePid()

  console.log(`[Gateway] Ready on http://${host}:${port}`)
  void hooksManager.fire('gateway.ready', { host, port })

  // ── 9. Init ConnectorRegistry from config ────────────────────────────────────
  const agentNameRows = await db.query<{ slug: string; name: string }>(
    `SELECT slug, name FROM agent_identities`
  )
  const agentNames: Record<string, string> = {}
  for (const row of agentNameRows) agentNames[row.slug] = row.name

  try {
    await connectorRegistry.initFromConfig(
      config as unknown as Record<string, unknown>,
      credentials as unknown as Record<string, unknown>,
      agentNames
    )
  } catch (err) {
    console.error('[Gateway] Connector init error (continuing):', err)
  }

  // ── 10. Approval expiry cleanup (fires approval.timeout / approval.expired) ───
  const APPROVAL_TTL_MS = 30 * 60 * 1000 // 30 minutes
  const approvalCleanupInterval = setInterval(() => {
    void (async () => {
      try {
        const expired = await db.query<{ id: string }>(
          `SELECT id FROM approvals
           WHERE status = 'pending'
             AND requested_at < NOW() - INTERVAL '30 minutes'`
        )
        for (const row of expired) {
          await db.execute(
            `UPDATE approvals SET status = 'expired', resolved_at = NOW() WHERE id = $1`,
            [row.id]
          )
          void hooksManager.fire('approval.timeout', { approvalId: row.id })
          void hooksManager.fire('approval.expired', { approvalId: row.id })
        }
      } catch (err) {
        console.warn('[Gateway] Approval cleanup error:', err)
      }
    })()
  }, APPROVAL_TTL_MS)
  approvalCleanupInterval.unref()

  // ── 11. Session timeout cleanup ───────────────────────────────────────────────
  const SESSION_TTL_HOURS = 24
  const sessionCleanupInterval = setInterval(() => {
    void (async () => {
      try {
        const timedOut = await db.query<{ id: string; agent_id: string }>(
          `SELECT id, agent_id FROM sessions
           WHERE status = 'active'
             AND updated_at < NOW() - INTERVAL '${SESSION_TTL_HOURS} hours'`
        )
        for (const row of timedOut) {
          await db.execute(
            `UPDATE sessions SET status = 'timeout', updated_at = NOW() WHERE id = $1`,
            [row.id]
          )
          void hooksManager.fire('session.timeout', { sessionId: row.id, agentId: row.agent_id })
        }
      } catch (err) {
        console.warn('[Gateway] Session timeout cleanup error:', err)
      }
    })()
  }, 60 * 60 * 1000) // every hour
  sessionCleanupInterval.unref()

  // ── 12. Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Gateway] Received ${signal}, shutting down...`)
    clearInterval(approvalCleanupInterval)
    clearInterval(sessionCleanupInterval)
    void hooksManager.fire('gateway.stop', { signal })
    await connectorRegistry.stopAll().catch((err: unknown) => console.error('[Gateway] Error stopping connectors:', err))
    await app.close().catch((err: unknown) => console.error('[Gateway] Error closing app:', err))
    if (schedulerService) await schedulerService.stop().catch((err: unknown) => console.error('[Gateway] Error stopping scheduler:', err))
    if (queueClient) await queueClient.close().catch((err: unknown) => console.error('[Gateway] Error closing queue client:', err))
    await mcpManager.close().catch((err: unknown) => console.error('[Gateway] Error closing MCP manager:', err))
    if (vaultSync) await vaultSync.stop().catch((err: unknown) => console.error('[Gateway] Error stopping vault sync:', err))
    if (messagingService) await messagingService.close().catch((err: unknown) => console.error('[Gateway] Error closing messaging service:', err))
    if (memoryStore) await memoryStore.close().catch((err: unknown) => console.error('[Gateway] Error closing memory store:', err))
    await removePid()
    await db.close().catch((err: unknown) => console.error('[Gateway] Error closing database:', err))
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGHUP', () => {
    console.log('[Gateway] SIGHUP received — signaling config reload')
    void hooksManager.fire('config.reloaded', { signal: 'SIGHUP' })
  })
}

createGateway().catch(err => {
  console.error('[Gateway] Fatal error:', err)
  process.exit(1)
})
