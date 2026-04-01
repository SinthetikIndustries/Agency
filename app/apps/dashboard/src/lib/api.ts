// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * Gateway API client for the dashboard.
 * Uses JWT cookie auth (set by POST /auth/login).
 */

import { PORTS } from '@/lib/ports'

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? `http://localhost:${PORTS.GATEWAY}`

// API key — persisted in localStorage so users only log in once.
// The key is set on first login and silently reused to refresh the JWT cookie
// whenever it expires. User never sees the login page again after first setup.
const STORED_KEY = 'agency_api_key'
let _apiKey: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(STORED_KEY) : null
export function getStoredKey(): string | null { return _apiKey }
export const getWsToken = getStoredKey  // alias for backward compat
export function setWsToken(token: string | null): void {
  _apiKey = token
  if (typeof localStorage !== 'undefined') {
    if (token) localStorage.setItem(STORED_KEY, token)
    else localStorage.removeItem(STORED_KEY)
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let _reauthing = false

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const hasBody = options.body != null
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  })

  // Silent re-auth: if JWT expired and we have the stored key, refresh and retry once
  if (res.status === 401 && retry && !_reauthing) {
    const key = getStoredKey()
    if (key && path !== '/auth/login') {
      _reauthing = true
      try {
        const reauth = await fetch(`${GATEWAY_URL}/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: key }),
        })
        _reauthing = false
        if (reauth.ok) return request<T>(path, options, false)
      } catch {
        _reauthing = false
      }
    }
    // Re-auth failed or no key — clear stored key and hit /api/auth/logout, which
    // clears the agency_session cookie server-side before redirecting to /login.
    // Going directly to /login doesn't work: the middleware sees the stale cookie
    // and immediately bounces back to /dashboard, creating an infinite reload loop.
    if (path !== '/auth/login') {
      setWsToken(null)
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .then(() => { window.location.href = '/login' })
          .catch(() => { window.location.href = '/login' })
      }
    }
    throw new ApiError('Session expired', 401)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = JSON.parse(text) as { error?: string }
      if (body.error) msg = body.error
    } catch { /* use status text */ }
    throw new ApiError(msg, res.status)
  }

  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: async (apiKey: string): Promise<{ ok: boolean }> => {
    const result = await request<{ ok: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    })
    setWsToken(apiKey)
    return result
  },

  logout: () => {
    setWsToken(null)
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
  },

  me: () => request<{ sub: string; exp: number }>('/auth/me'),
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded'
  services: Record<string, string>
  version: string
  uptime: number
}

export const health = {
  get: () => request<HealthStatus>('/health'),
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  agentId: string
  client: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface SessionSummary {
  id: string
  agentId: string
  agentSlug: string | null
  agentName: string | null
  client: string
  status: string
  name: string | null
  pinned: boolean
  pinnedAt: string | null
  createdAt: string
  updatedAt: string
}

export const sessions = {
  list: (params?: { agent?: string; limit?: number; client?: string }) => {
    const qs = new URLSearchParams()
    if (params?.agent) qs.set('agent', params.agent)
    if (params?.limit) qs.set('limit', String(params.limit))
    qs.set('client', params?.client ?? 'dashboard')
    return request<{ sessions: SessionSummary[] }>(`/sessions?${qs.toString()}`)
  },

  create: (agentSlug = 'main', client = 'dashboard') =>
    request<{ session: Session }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ agentSlug, client }),
    }),

  delete: (sessionId: string) =>
    request<{ ok: boolean }>(`/sessions/${sessionId}`, { method: 'DELETE' }),

  rename: (sessionId: string, name: string) =>
    request<{ ok: boolean }>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  pin: (sessionId: string, pinned: boolean) =>
    request<{ ok: boolean }>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    }),

  send: (sessionId: string, content: string) =>
    request<{ response: string }>(`/sessions/${sessionId}/send`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  messages: (sessionId: string) =>
    request<{ messages: Array<{ id: string; role: string; content: string; created_at: string }> }>(
      `/sessions/${sessionId}/messages`
    ),
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface AgentModelConfig {
  mode: 'inherit' | 'specific' | 'auto_router'
  specific?: { model: string; provider: string }
  routingProfileId?: string
}

export interface AgentIdentity {
  id: string
  name: string
  slug: string
  parentAgentId: string | null
  lifecycleType: string
  wakeMode: string
  shellPermissionLevel: string
  agentManagementPermission: string
  status: string
  workspacePath: string
  additionalWorkspacePaths: string[]
  createdBy: string
  modelConfig?: AgentModelConfig
}

export interface Agent {
  identity: AgentIdentity
  profile: {
    name: string
    slug: string
    description?: string
    systemPrompt?: string
    modelTier?: string
    allowedTools?: string[]
  }
  lockedWorkspacePaths?: string[]
}

export const agents = {
  list: () => request<{ agents: Agent[] }>('/agents'),
  get: (slug: string) => request<{ agent: Agent }>(`/agents/${slug}`),
  create: (input: {
    name: string
    profileSlug?: string
    lifecycleType?: string
    wakeMode?: string
    shellPermissionLevel?: string
    agentManagementPermission?: string
  }) => request<{ agent: Agent }>('/agents', { method: 'POST', body: JSON.stringify(input) }),
  enable: (slug: string) => request<{ ok: boolean }>(`/agents/${slug}/enable`, { method: 'POST' }),
  disable: (slug: string) => request<{ ok: boolean }>(`/agents/${slug}/disable`, { method: 'POST' }),
  update: (slug: string, patch: {
    name?: string
    lifecycleType?: string
    wakeMode?: string
    shellPermissionLevel?: string
    agentManagementPermission?: string
  }) => request<{ ok: boolean; agent: AgentIdentity }>(`/agents/${slug}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setModelConfig: (slug: string, config: AgentModelConfig) =>
    request<{ ok: boolean; modelConfig: AgentModelConfig }>(
      `/agents/${slug}/model-config`,
      { method: 'PATCH', body: JSON.stringify(config) }
    ),

  addWorkspace: (slug: string, path: string) =>
    request<{ ok: boolean; additionalWorkspacePaths: string[] }>(
      `/agents/${slug}/workspaces`,
      { method: 'POST', body: JSON.stringify({ path }) }
    ),

  removeWorkspace: (slug: string, path: string) =>
    request<{ ok: boolean; additionalWorkspacePaths: string[] }>(
      `/agents/${slug}/workspaces`,
      { method: 'DELETE', body: JSON.stringify({ path }) }
    ),
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export interface Skill {
  id: string
  name: string
  version: string
  status: string
  manifest: { description?: string }
}

export interface LibrarySkill {
  name: string
  version: string
  description: string
  installed: boolean
}

export const skills = {
  list: () => request<{ skills: Skill[]; total: number }>('/skills'),
  library: () => request<{ skills: LibrarySkill[]; total: number }>('/skills/library'),
  install: (name: string) =>
    request<{ ok: boolean; skill: Skill }>('/skills/install', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  remove: (name: string) =>
    request<{ ok: boolean }>(`/skills/${name}`, { method: 'DELETE' }),
  enable: (name: string) =>
    request<{ ok: boolean; skill: Skill }>(`/skills/${encodeURIComponent(name)}/enable`, { method: 'POST' }),
  disable: (name: string) =>
    request<{ ok: boolean; skill: Skill }>(`/skills/${encodeURIComponent(name)}/disable`, { method: 'POST' }),
}

export interface AgentSkill {
  id: string
  name: string
  version: string
  type: string
  manifest: { tools?: string[]; prompts?: string[]; requiredTools?: string[] }
}

export const agentSkills = {
  list: (slug: string) =>
    request<{ skills: AgentSkill[] }>(`/agents/${encodeURIComponent(slug)}/skills`),
  enable: (slug: string, name: string) =>
    request<{ ok: boolean }>(`/agents/${encodeURIComponent(slug)}/skills/${encodeURIComponent(name)}/enable`, { method: 'POST' }),
  disable: (slug: string, name: string) =>
    request<{ ok: boolean }>(`/agents/${encodeURIComponent(slug)}/skills/${encodeURIComponent(name)}/disable`, { method: 'POST' }),
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface WorkspaceFile {
  name: string
  type: 'file' | 'dir'
  size: number | null
  modifiedAt: string | null
}

export const workspace = {
  list: (agentSlug: string, path?: string) =>
    request<{ workspacePath: string; files: WorkspaceFile[] }>(
      `/agents/${agentSlug}/workspace${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),

  readFile: (agentSlug: string, path: string) =>
    request<{ path: string; content: string }>(
      `/agents/${agentSlug}/workspace/file?path=${encodeURIComponent(path)}`
    ),

  writeFile: (agentSlug: string, path: string, content: string) =>
    request<{ ok: boolean }>(`/agents/${agentSlug}/workspace/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export interface Profile {
  slug: string
  name: string
  description: string
  modelTier: string
  builtIn: boolean
}

export const profiles = {
  list: () => request<{ profiles: Profile[] }>('/profiles'),
  create: (data: { name: string; slug: string; description: string; systemPrompt: string; modelTier?: string; allowedTools?: string[] }) =>
    request<{ ok: boolean; profile: Profile }>('/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  attach: (agentSlug: string, profileSlug: string) =>
    request<{ ok: boolean }>(`/agents/${agentSlug}/profile`, {
      method: 'POST',
      body: JSON.stringify({ profileSlug }),
    }),
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export interface InboxDepth {
  agentId: string
  agentSlug: string
  agentName: string
  high: number
  normal: number
  total: number
}

export interface RecentMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  priority: string
  subject: string
  status: string
  createdAt: string
}

export const messaging = {
  status: () =>
    request<{ inboxDepths: InboxDepth[]; recentMessages: RecentMessage[] }>('/messaging/status'),
}

// ─── Models ───────────────────────────────────────────────────────────────────

export const models = {
  list: () =>
    request<{ models: Array<{ name: string; tier?: string; provider: string; isDefault: boolean }>; defaultModel: string; tiers: { cheap: string; strong: string } }>('/models'),
  setDefault: (model: string) =>
    request<{ ok: boolean }>('/models/default', {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }),
  pull: (model: string) =>
    fetch(`${typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_GATEWAY_URL ?? `http://localhost:${PORTS.GATEWAY}`) : `http://localhost:${PORTS.GATEWAY}`}/models/pull`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }),
}

// ─── Vault ────────────────────────────────────────────────────────────────────

export interface VaultStatus {
  enabled: boolean
  documentCount: number
  errorCount: number
  lastSyncAt: string | null
}

export const vault = {
  status: () => request<VaultStatus>('/vault/status'),
  sync: () => request<{ message: string }>('/vault/sync', { method: 'POST' }),
  graphStatus: () =>
    request<{ nodes: number; edges: number; unresolvedLinks: number }>('/vault/graph-status'),
}

// ─── Connectors ───────────────────────────────────────────────────────────────

export interface ConnectorStatus {
  name: string
  enabled: boolean
  healthy: boolean
}

export const connectors = {
  list: () => request<{ connectors: ConnectorStatus[] }>('/connectors'),
}

export const discordConnector = {
  agents: () => request<{ agents: Array<{ slug: string; enabled: boolean }> }>('/connectors/discord/agents'),
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export interface Approval {
  id: string
  agent_id: string
  tool_name: string
  tool_input: string
  reason: string
  status: string
  created_at: string
}

export const approvals = {
  list: () => request<{ approvals: Approval[] }>('/approvals'),
  approve: (id: string, note?: string) =>
    request<{ ok: boolean }>(`/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  reject: (id: string, note?: string) =>
    request<{ ok: boolean }>(`/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  action: string
  actor: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export const audit = {
  list: (params?: { action?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.action) qs.set('action', params.action)
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<{ entries: AuditEntry[] }>(`/audit${q ? `?${q}` : ''}`)
  },
}

// ─── Routing Profiles ─────────────────────────────────────────────────────────

export interface RoutingChainStep {
  model: string
  provider: string
  label?: string
}

export interface RoutingProfile {
  id: string
  name: string
  description: string
  chain: RoutingChainStep[]
  createdAt: string
}

export const routingProfiles = {
  list: () =>
    request<{ profiles: RoutingProfile[] }>('/routing-profiles'),
  create: (data: { name: string; description?: string; chain: RoutingChainStep[] }) =>
    request<{ ok: boolean; profile: RoutingProfile }>('/routing-profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string; chain?: RoutingChainStep[] }) =>
    request<{ ok: boolean; profile: RoutingProfile }>(`/routing-profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/routing-profiles/${id}`, { method: 'DELETE' }),
}

// ─── Me ───────────────────────────────────────────────────────────────────────

export const me = {
  get: (): Promise<{ name: string; onboarded: boolean }> =>
    request('/me'),
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export type ToolType = 'file' | 'shell' | 'browser' | 'http' | 'code' | 'memory' | 'vault' | 'messaging' | 'agent_management'

export interface Tool {
  name: string
  type: ToolType
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  permissions: string[]
  sandboxed: boolean
  timeout: number
  enabled: boolean
}

export const tools = {
  list: () => request<{ tools: Tool[] }>('/tools'),
  enable: (name: string) =>
    request<{ ok: boolean }>(`/tools/${encodeURIComponent(name)}/enable`, { method: 'POST' }),
  disable: (name: string) =>
    request<{ ok: boolean }>(`/tools/${encodeURIComponent(name)}/disable`, { method: 'POST' }),
}

// ─── MCP ──────────────────────────────────────────────────────────────────────

export interface McpTool {
  name: string
  description?: string
}

export interface McpServer {
  name: string
  config: Record<string, unknown>
  enabled: boolean
  status: string
  error: string | null
  tools: McpTool[]
  connectedAt: string | null
}

export interface AgentMcpServer {
  name: string
  config: Record<string, unknown>
  globallyEnabled: boolean
  status: string
  agentEnabled: boolean
}

export const mcp = {
  list: () => request<{ servers: McpServer[] }>('/mcp/servers'),
  add: (name: string, config: Record<string, unknown>) =>
    request<{ ok: boolean; server: McpServer }>('/mcp/servers', {
      method: 'POST',
      body: JSON.stringify({ name, config }),
    }),
  remove: (name: string) =>
    request<{ ok: boolean }>(`/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  enable: (name: string) =>
    request<{ ok: boolean; server: McpServer }>(`/mcp/servers/${encodeURIComponent(name)}/enable`, { method: 'POST' }),
  disable: (name: string) =>
    request<{ ok: boolean }>(`/mcp/servers/${encodeURIComponent(name)}/disable`, { method: 'POST' }),
  reconnect: (name: string) =>
    request<{ ok: boolean; server: McpServer }>(`/mcp/servers/${encodeURIComponent(name)}/reconnect`, { method: 'POST' }),
}

export const agentMcp = {
  list: (slug: string) =>
    request<{ servers: AgentMcpServer[] }>(`/agents/${encodeURIComponent(slug)}/mcp`),
  enable: (slug: string, name: string) =>
    request<{ ok: boolean }>(`/agents/${encodeURIComponent(slug)}/mcp/${encodeURIComponent(name)}/enable`, { method: 'POST' }),
  disable: (slug: string, name: string) =>
    request<{ ok: boolean }>(`/agents/${encodeURIComponent(slug)}/mcp/${encodeURIComponent(name)}/disable`, { method: 'POST' }),
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export interface Hook {
  id: string
  name: string
  event: string
  command: string
  matcher: Record<string, unknown> | null
  enabled: boolean
  created_at: string
}

export interface HookEventDef {
  event: string
  description: string
  blocker: boolean
  category: string
}

export const hooks = {
  list: () => request<{ hooks: Hook[] }>('/hooks'),
  create: (body: { name: string; event: string; command: string; matcher?: Record<string, unknown> | null; enabled?: boolean }) =>
    request<{ hook: Hook }>('/hooks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, patch: { name?: string; command?: string; matcher?: Record<string, unknown> | null; enabled?: boolean }) =>
    request<{ hook: Hook }>(`/hooks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/hooks/${id}`, { method: 'DELETE' }),
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export interface QueueStat {
  name: string
  waiting: number
  active: number
  delayed: number
  failed: number
  completed: number
}

export interface WorkerStatus {
  name: string
  status: 'running' | 'stopped' | 'restarting'
  pid?: number | null
  startedAt: string | null
  restartCount: number
}

export const queue = {
  stats: () => request<{ queues: QueueStat[] }>('/queue/stats'),
  workers: () => request<{ workers: WorkerStatus[] }>('/queue/workers'),
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export const onboarding = {
  submit: (body: {
    name: string; sex: string; timezone: string; country: string
    state: string; city: string; role: string; autonomy: string; goals: string
  }): Promise<{ ok: boolean; sessionId: string }> =>
    request('/onboarding', { method: 'POST', body: JSON.stringify(body) }),
}

// ─── Schedules ────────────────────────────────────────────────────────────────

export interface ScheduledTask {
  id: string
  agentSlug: string
  label: string
  prompt: string
  schedule: string
  type: 'recurring' | 'once'
  enabled: boolean
  humanReadableSchedule: string
  lastRunAt?: string
  nextRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface ScheduledRun {
  id: string
  taskId: string
  sessionId: string | null
  status: 'running' | 'completed' | 'failed'
  error?: string
  startedAt: string
  finishedAt?: string
}

export const schedules = {
  list: (params?: { agentSlug?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.agentSlug) qs.set('agentSlug', params.agentSlug)
    if (params?.limit) qs.set('limit', String(params.limit))
    return request<{ tasks: ScheduledTask[] }>(`/schedules?${qs.toString()}`)
  },
  create: (body: { agentSlug: string; label: string; prompt: string; schedule: string; type: 'recurring' | 'once' }) =>
    request<{ task: ScheduledTask }>('/schedules', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{ label: string; prompt: string; schedule: string; type: 'recurring' | 'once'; enabled: boolean }>) =>
    request<{ task: ScheduledTask }>(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<void>(`/schedules/${id}`, { method: 'DELETE' }),
  runs: (id: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : ''
    return request<{ runs: ScheduledRun[] }>(`/schedules/${id}/runs${qs}`)
  },
}
