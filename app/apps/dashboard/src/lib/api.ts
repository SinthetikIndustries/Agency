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

  search: (query: string) =>
    request<{ sessions: Array<{ id: string; name: string | null; agentId: string; createdAt: string; firstMessage: string | null }> }>(
      `/sessions/search?q=${encodeURIComponent(query)}`
    ),

  suggestions: (sessionId: string) =>
    request<{ suggestions: string[] }>(`/sessions/${sessionId}/suggestions`),

  verify: (sessionId: string, body: { taskDescription: string; filesChanged: string[]; approach?: string }) =>
    request<{ verdict: 'PASS' | 'FAIL' | 'PARTIAL' | null; report: string; sessionId: string }>(
      `/sessions/${sessionId}/verify`,
      { method: 'POST', body: JSON.stringify(body) }
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
  autonomousMode?: boolean
  agencyPermissions?: Record<string, string>
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

export interface AgentWorkspaceSecondary {
  path: string
  agentName: string
  agentSlug: string
}

export interface AgentWorkspaceGroup {
  path: string
  groupId: string
  groupName: string
  isSystemGroup: boolean
}

export interface AgentWorkspaceContext {
  primary: { path: string }
  secondary: AgentWorkspaceSecondary[]
  groupWorkspaces: AgentWorkspaceGroup[]
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
    autonomousMode?: boolean
    agencyPermissions?: Record<string, string>
  }) => request<{ ok: boolean; agent: AgentIdentity }>(`/agents/${slug}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setModelConfig: (slug: string, config: AgentModelConfig) =>
    request<{ ok: boolean; modelConfig: AgentModelConfig }>(
      `/agents/${slug}/model-config`,
      { method: 'PATCH', body: JSON.stringify(config) }
    ),

  workspaces: (slug: string) =>
    request<AgentWorkspaceContext>(`/agents/${slug}/workspaces`),

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
  list: (agentSlug: string, path?: string, root?: string) => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    if (root) params.set('root', root)
    const qs = params.toString()
    return request<{ workspacePath: string; files: WorkspaceFile[] }>(
      `/agents/${agentSlug}/workspace${qs ? `?${qs}` : ''}`
    )
  },

  readFile: (agentSlug: string, path: string, root?: string) => {
    const params = new URLSearchParams({ path })
    if (root) params.set('root', root)
    return request<{ path: string; content: string }>(
      `/agents/${agentSlug}/workspace/file?${params.toString()}`
    )
  },

  writeFile: (agentSlug: string, path: string, content: string, root?: string) => {
    const params = new URLSearchParams({ path })
    if (root) params.set('root', root)
    return request<{ ok: boolean }>(`/agents/${agentSlug}/workspace/file?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    })
  },
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

// ─── Brain types ─────────────────────────────────────────────────────────────

export interface BrainNode {
  id: string
  type: string
  label: string
  content: string | null
  metadata: Record<string, unknown>
  confidence: number
  source: string
  created_at: string
  updated_at: string
  version: number
  degree?: number   // included in graph payload
}

export interface BrainEdge {
  id: string
  from_id: string
  to_id: string
  type: string
  weight: number
  bidirectional: boolean
  metadata: Record<string, unknown>
  source: string
  created_at: string
}

export interface BrainGraphNode extends BrainNode {
  degree: number
}

// ─── Brain API ───────────────────────────────────────────────────────────────

export const brain = {
  status: () =>
    request<{ nodeCount: number; edgeCount: number; lastUpdated: string | null }>('/brain/status'),

  graph: () =>
    request<{ nodes: BrainGraphNode[]; edges: BrainEdge[] }>('/brain/graph'),

  nodes: (params?: { type?: string; source?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.type) q.set('type', params.type)
    if (params?.source) q.set('source', params.source)
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return request<{ nodes: BrainNode[]; count: number }>(`/brain/nodes${qs ? '?' + qs : ''}`)
  },

  getNode: (id: string) =>
    request<BrainNode>(`/brain/nodes/${id}`),

  createNode: (data: {
    label: string; type?: string; content?: string
    metadata?: Record<string, unknown>; confidence?: number; source?: string
  }) =>
    request<BrainNode>('/brain/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateNode: (id: string, data: Partial<BrainNode>) =>
    request<BrainNode>(`/brain/nodes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteNode: (id: string) =>
    request<{ ok: boolean }>(`/brain/nodes/${id}`, { method: 'DELETE' }),

  createEdge: (data: {
    from_id: string; to_id: string; type?: string
    weight?: number; bidirectional?: boolean
  }) =>
    request<BrainEdge>('/brain/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteEdge: (id: string) =>
    request<{ ok: boolean }>(`/brain/edges/${id}`, { method: 'DELETE' }),

  search: (q: string, options?: { limit?: number; type?: string }) => {
    const params = new URLSearchParams({ q })
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.type) params.set('type', options.type)
    return request<{
      results: Array<BrainNode & { score: number }>
      count: number
      semantic: boolean
    }>(`/brain/search?${params}`)
  },

  traverse: (id: string, depth = 2) =>
    request<{
      nodes: Array<BrainNode & { depth: number; via_edge_type: string | null }>
      count: number
      rootId: string
    }>(`/brain/traverse/${id}?depth=${depth}`),

  history: (id: string) =>
    request<{ history: Array<{
      id: string; content: string | null; confidence: number
      changed_by: string; changed_at: string; version: number
    }>; nodeId: string }>(`/brain/nodes/${id}/history`),

  candidates: () =>
    request<{ candidates: Array<{
      node_a_id: string; node_a_label: string
      node_b_id: string; node_b_label: string
      shared_neighbors: number
    }>; count: number }>('/brain/candidates'),
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
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH'
  explanation?: string
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
    name: string; nickname: string; sex: string; timezone: string; country: string
    state: string; city: string; role: string; autonomy: string; goals: string
  }): Promise<{ ok: boolean }> =>
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

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface WorkspaceGroup {
  id: string
  name: string
  description: string | null
  hierarchyType: string
  goals: string[]
  workspacePath: string
  memoryPath: string
  memberCount?: number
  createdAt: string
  updatedAt: string
}

export interface GroupMember {
  agentId: string
  role: string
  joinedAt: string
  agentName?: string
  agentSlug?: string
}

export const groups = {
  list: () => request<{ groups: WorkspaceGroup[] }>('/groups'),
  create: (body: { name: string; slug?: string; description?: string; hierarchyType?: string; goals?: string[] }) =>
    request<{ group: WorkspaceGroup }>('/groups', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => request<{ group: WorkspaceGroup; members: GroupMember[] }>(`/groups/${id}`),
  update: (id: string, body: { name?: string; description?: string; hierarchyType?: string; goals?: string[] }) =>
    request<{ group: WorkspaceGroup }>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ success: boolean }>(`/groups/${id}`, { method: 'DELETE' }),
  addMember: (groupId: string, body: { agentId: string; role?: string }) =>
    request<{ success: boolean }>(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify(body) }),
  removeMember: (groupId: string, agentId: string) =>
    request<{ success: boolean }>(`/groups/${groupId}/members/${agentId}`, { method: 'DELETE' }),
}

export const architect = {
  generate: (description: string) =>
    request<{ name: string; slug: string; identity: string; soul: string; suggestedProfile: string; reasoning: string }>(
      '/agents/architect',
      { method: 'POST', body: JSON.stringify({ description }) }
    ),
}
