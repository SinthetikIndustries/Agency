// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

/**
 * @agency/shared-types
 * Core TypeScript interfaces and enums for the Agency platform.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type ShellPermissionLevel = 'none' | 'per_command' | 'session_destructive' | 'session_only' | 'full'
export type LifecycleType = 'always_on' | 'dormant'
export type WakeMode = 'auto' | 'high_priority' | 'explicit'
export type AgentStatus = 'active' | 'disabled' | 'deleted'
export type AgentManagementPermission = 'approval_required' | 'autonomous'
export type ModelTier = 'cheap' | 'strong'
export type MessageRole = 'user' | 'assistant' | 'tool'
export type SessionStatus = 'active' | 'completed' | 'error'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timed_out'
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused'
export type ToolType = 'file' | 'shell' | 'browser' | 'http' | 'code' | 'memory' | 'vault' | 'messaging' | 'agent_management'
export type BehaviorTone = 'professional' | 'casual' | 'technical'
export type BehaviorVerbosity = 'concise' | 'normal' | 'detailed'

// ─── Built-In Agents ─────────────────────────────────────────────────────────

export const BUILT_IN_AGENTS = ['orchestrator', 'main'] as const;
export type BuiltInAgentSlug = typeof BUILT_IN_AGENTS[number];

export type PermissionLevel = 'deny' | 'request' | 'autonomous';

export interface AgencyPermissions {
  agentCreate: PermissionLevel;
  agentDelete: PermissionLevel;
  agentUpdate: PermissionLevel;
  groupCreate: PermissionLevel;
  groupUpdate: PermissionLevel;
  groupDelete: PermissionLevel;
  shellRun: PermissionLevel;
  allowRules?: string[];
  denyRules?: string[];
}

// ─── Agent Identity ───────────────────────────────────────────────────────────

export interface AgentIdentity {
  id: string               // stable UUID
  name: string             // human-readable display name
  slug: string             // URL/CLI-safe identifier
  parentAgentId: string | null  // null for main agent; UUID of parent for sub-agents
  lifecycleType: LifecycleType
  wakeMode: WakeMode
  currentProfileId: string
  shellPermissionLevel: ShellPermissionLevel
  agentManagementPermission: AgentManagementPermission
  agencyPermissions: AgencyPermissions
  autonomousMode: boolean
  workspacePath: string    // absolute path to agent's workspace
  additionalWorkspacePaths: string[]  // extra directories this agent can read/write
  status: AgentStatus
  createdBy: string        // 'system' | agent_id | 'user'
  createdAt: Date
  updatedAt: Date
  modelConfig?: AgentModelConfig
}

// ─── Model Config ─────────────────────────────────────────────────────────────

export interface RoutingChainStep {
  model: string
  provider: string
  label?: string
}

export interface AgentModelConfig {
  mode: 'inherit' | 'specific' | 'auto_router'
  specific?: { model: string; provider: string }
  routingProfileId?: string
}

// ─── Agent Profile ────────────────────────────────────────────────────────────

export interface AgentBehaviorSettings {
  tone: BehaviorTone
  verbosity: BehaviorVerbosity
  proactive: boolean
  proactiveIntervalSeconds?: number  // default 60
}

export interface AgentProfile {
  id: string
  name: string
  slug: string
  description: string
  systemPrompt: string
  modelTier: ModelTier
  modelOverride?: string | undefined
  allowedTools: string[]
  behaviorSettings: AgentBehaviorSettings
  tags: string[]
  builtIn: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AgentWithProfile {
  identity: AgentIdentity
  profile: AgentProfile
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  agentId: string
  client: string           // 'cli' | 'dashboard' | 'discord'
  status: SessionStatus
  name?: string
  pinned?: boolean
  pinnedAt?: Date
  coordinatorMode?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  content: string
  isError: boolean
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  toolCalls?: ToolCall[] | undefined
  toolResults?: ToolResult[] | undefined
  createdAt: Date
}

// ─── Model Router ─────────────────────────────────────────────────────────────

export interface CompletionMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema
}

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface CompletionRequest {
  model: string
  messages: CompletionMessage[]
  system?: string | undefined
  systemBlocks?: SystemBlock[] | undefined
  betaHeaders?: string[] | undefined
  tools?: ToolDefinition[] | undefined
  maxTokens?: number | undefined
  temperature?: number | undefined
}

export interface CompletionResponse {
  id: string
  model: string
  content: ContentBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  inputTokens: number
  outputTokens: number
}

export interface CompletionChunk {
  type: 'text_delta' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_stop' | 'message_stop' | 'usage'
  text?: string | undefined
  toolCallId?: string | undefined
  toolName?: string | undefined
  inputDelta?: string | undefined
  inputTokens?: number | undefined
  outputTokens?: number | undefined
}

export interface ModelAdapter {
  id: string
  name: string
  models: string[]
  complete(request: CompletionRequest): Promise<CompletionResponse>
  stream(request: CompletionRequest): AsyncGenerator<CompletionChunk>
  isAvailable(): Promise<boolean>
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

export interface ToolManifest {
  name: string
  type: ToolType
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown> | undefined
  permissions: string[]
  sandboxed: boolean
  timeout: number
}

export interface ToolContext {
  agentId: string
  sessionId: string
  workflowId?: string | undefined
  workspacePath: string
  additionalWorkspacePaths?: string[]
  invokeDepth?: number   // current agent_invoke nesting depth; undefined = 0
  shellPermissionLevel: ShellPermissionLevel
  sessionGrantActive: boolean
  agentManagementPermission: AgentManagementPermission
  agencyPermissions: AgencyPermissions
  autonomousMode: boolean
}

export interface ToolDispatchResult {
  success: boolean
  output: unknown
  error?: string | undefined
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export type SkillType = 'tool' | 'prompt'

export interface SkillManifestSummary {
  tools: string[]
  prompts: string[]
  requiredTools: string[]
}

export interface ActiveSkill {
  id: string
  name: string
  version: string
  type: SkillType
  anthropicBuiltinType: string | null
  anthropicBetaHeader: string | null
  manifest: SkillManifestSummary
  installedAt: Date
  config: Record<string, unknown>
}

// ─── BullMQ Worker Jobs ───────────────────────────────────────────────────────

export type WorkerQueueName = 'queue:shell' | 'queue:browser' | 'queue:code' | 'queue:planner' | 'queue:ingestion'

export interface ToolJobContext {
  sessionId: string
  workflowId?: string | undefined
  stepId?: string | undefined
  agentId: string
  workspacePath: string
  shellPermissionLevel: ShellPermissionLevel
  sessionGrantActive: boolean
  agentManagementPermission: AgentManagementPermission
  agencyPermissions: AgencyPermissions
  autonomousMode: boolean
}

export interface ToolJob {
  machineId?: string | undefined
  toolName: string
  input: Record<string, unknown>
  context: ToolJobContext
  timeout: number
  maxAttempts: number
}

// ─── Task Notifications ───────────────────────────────────────────────────────

export interface TaskNotification {
  taskId: string
  status: 'completed' | 'failed' | 'killed'
  summary: string
  result?: string
  usage?: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
}

export function formatTaskNotification(n: TaskNotification): string {
  return [
    `<task-notification>`,
    `<task-id>${n.taskId}</task-id>`,
    `<status>${n.status}</status>`,
    `<summary>${n.summary}</summary>`,
    n.result ? `<result>${n.result}</result>` : '',
    n.usage ? `<usage><total_tokens>${n.usage.totalTokens}</total_tokens><tool_uses>${n.usage.toolUses}</tool_uses><duration_ms>${n.usage.durationMs}</duration_ms></usage>` : '',
    `</task-notification>`,
  ].filter(Boolean).join('\n')
}

export function parseTaskNotification(text: string): TaskNotification | null {
  const taskId = text.match(/<task-id>(.*?)<\/task-id>/)?.[1]
  const status = text.match(/<status>(.*?)<\/status>/)?.[1] as TaskNotification['status'] | undefined
  const summary = text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
  const result = text.match(/<result>([\s\S]*?)<\/result>/)?.[1]
  if (!taskId || !status || !summary) return null
  const notification: TaskNotification = { taskId, status, summary }
  if (result !== undefined) notification.result = result
  return notification
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface RunContext {
  session: Session
  agent: AgentWithProfile
  messages: Message[]
  currentMessage: string
}

export interface OrchestratorRunResult {
  sessionId: string
  messageId: string
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export interface Approval {
  id: string
  agentId: string
  sessionId: string
  prompt: string          // human-readable description of what needs approval
  toolName?: string | undefined
  toolInput?: Record<string, unknown> | undefined
  status: ApprovalStatus
  requestedAt: Date
  resolvedAt?: Date | undefined
  resolvedBy?: string | undefined
  note?: string | undefined
}

// ─── Gateway API ──────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  services: Record<string, 'ok' | 'degraded' | 'error' | 'disabled'>
  version: string
  uptime: number
}

export interface CreateSessionRequest {
  agentSlug?: string | undefined
  client?: string | undefined
}

export interface SendMessageRequest {
  content: string
}

export interface CreateSessionResponse {
  session: Session
}

// ─── Config (lightweight, for shared use) ────────────────────────────────────

export interface GatewayConfig {
  port: number
  host: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  auth: {
    jwtSecret: string
    jwtExpiryHours: number
  }
  rateLimit: {
    max: number
    timeWindow: string
  }
}

export interface ModelRouterConfig {
  defaultModel: string
  tiers: {
    cheap: string
    strong: string
  }
  providers: {
    anthropic: { enabled: boolean }
    openai: { enabled: boolean }
    ollama: { enabled: boolean; endpoint: string }
    openrouter: { enabled: boolean }
    ollamaCloud?: { enabled: boolean; endpoint?: string }
  }
  fallback: {
    cheap: string | null
    strong: string | null
  }
  embedding: {
    provider: string
    model: string
  }
}

export interface AgencyConfig {
  gateway: GatewayConfig
  profile: 'basic' | 'standard' | 'advanced' | 'development'
  modelRouter: ModelRouterConfig
  daemons: {
    orchestrator: { enabled: boolean }
    modelRouter: { enabled: boolean }
    vaultSync: { enabled: boolean; vaultPath?: string }
  }
  orchestrator: {
    defaultAgent: string
    maxWorkflowSteps: number
    approvalTimeoutSeconds: number
  }
  redis: {
    url: string
  }
}

export interface AgencyCredentials {
  anthropic?: { apiKey: string } | undefined
  openai?: { apiKey: string } | undefined
  openrouter?: { apiKey: string } | undefined
  ollamaCloud?: { apiKey: string } | undefined
  postgres?: { url: string } | undefined
  redis?: { url: string } | undefined
  gateway?: { apiKey: string } | undefined
  discord?: { agents: Record<string, string> } | undefined
}
