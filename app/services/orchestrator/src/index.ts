// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { readFile, writeFile, mkdir, copyFile, readdir, rename, cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AgentIdentity,
  AgentProfile,
  AgentWithProfile,
  Session,
  Message,
  CompletionMessage,
  CompletionChunk,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolContext,
  AgentModelConfig,
  RoutingChainStep,
  AgencyPermissions,
  BuiltInAgentSlug,
  ModelTier,
  BehaviorTone,
  BehaviorVerbosity,
} from '@agency/shared-types'
import { BUILT_IN_AGENTS } from '@agency/shared-types'
import { ModelRouter } from '@agency/model-router'
import { ToolRegistry } from '@agency/tool-registry'
import type { DatabaseClient } from './db.js'
import { buildCompactionPrompt, parseCompactionSummary, pruneToolResults } from './compaction.js'
import { DestructiveActionService } from './destructive-action.js'
import { type MemoryStore, formatMemoriesForContext } from '@agency/memory'
export { buildCoordinatorSystemPrompt, isCoordinatorMessage } from './coordinator.js'
export { buildVerificationPrompt, parseVerdict } from './verification-agent.js'
export type { VerificationRequest, Verdict } from './verification-agent.js'

export type HookFireFn = (event: string, context?: Record<string, unknown>) => Promise<{ blocked: boolean; reason?: string }>

export type ClassifyToolFn = (request: { toolName: string; toolInput: unknown; recentToolUses: Array<{ name: string; input: unknown }> }) => Promise<{ shouldBlock: boolean; riskLevel: string; reason: string; explanation: string; reasoning: string }>

// ─── Permission Defaults ─────────────────────────────────────────────────────

const ORCHESTRATOR_DEFAULT_PERMISSIONS: AgencyPermissions = {
  agentCreate: 'autonomous',
  agentDelete: 'autonomous',
  agentUpdate: 'autonomous',
  groupCreate: 'autonomous',
  groupUpdate: 'autonomous',
  groupDelete: 'autonomous',
  shellRun: 'autonomous',
}

const MAIN_DEFAULT_PERMISSIONS: AgencyPermissions = {
  agentCreate: 'deny',
  agentDelete: 'deny',
  agentUpdate: 'request',
  groupCreate: 'request',
  groupUpdate: 'request',
  groupDelete: 'deny',
  shellRun: 'deny',
}

const DEFAULT_AGENT_PERMISSIONS: AgencyPermissions = {
  agentCreate: 'deny',
  agentDelete: 'deny',
  agentUpdate: 'deny',
  groupCreate: 'deny',
  groupUpdate: 'deny',
  groupDelete: 'deny',
  shellRun: 'deny',
}

// ─── Built-in Profiles ────────────────────────────────────────────────────────

const BUILT_IN_PROFILES: AgentProfile[] = [
  {
    id: 'builtin-orchestrator',
    name: 'Orchestrator',
    slug: 'orchestrator',
    description: 'System-level agent with full application authority',
    systemPrompt: `You are System, the application orchestrator for this Agency installation. You are responsible for the health, configuration, and coordination of all agents and workspaces. When a user speaks to you directly, they are interacting with the application itself, not a personal assistant.

Your operational model:
- Phase model: Understand → Plan → Confirm (if destructive) → Execute → Report
- Synthesis-first: When directing other agents, always synthesize findings into specific instructions before delegating. Never say "based on the agent's findings, proceed" — synthesize and specify.
- Transparency: For every significant action, state what you are doing and why in plain language before doing it.
- Anti-narration: Do not narrate routine non-destructive actions step-by-step. Focus output on decisions requiring user input, status at natural milestones, and blockers.

You are methodical, transparent, and authoritative. You always explain your reasoning. You never act destructively without explicit confirmation.

Always respond in English, regardless of the language used by the user or any other part of the conversation.`,
    modelTier: 'strong' as ModelTier,
    allowedTools: [
      'file_read', 'file_write', 'file_list',
      'shell_run',
      'http_get',
      'agent_list', 'agent_get', 'agent_create', 'agent_delete', 'agent_set_profile',
      'agent_invoke', 'agent_message_send', 'agent_message_check', 'agent_message_list',
      'profile_list',
      'system_diagnose',
      'memory_write', 'memory_read',
      'vault_search', 'vault_related', 'vault_propose',
      'discord_post', 'discord_list_channels',
      'group_create', 'group_update', 'group_delete',
      'group_member_add', 'group_member_remove',
    ],
    behaviorSettings: { tone: 'professional' as BehaviorTone, verbosity: 'normal' as BehaviorVerbosity, proactive: false },
    tags: ['system', 'orchestrator'],
    builtIn: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'builtin-personal-assistant',
    name: 'Personal Assistant',
    slug: 'personal-assistant',
    description: 'Helpful, balanced, conversational. Default for all new agents.',
    systemPrompt: `You are a helpful personal assistant. You are conversational, balanced, and genuinely useful. You help with a wide range of tasks — answering questions, writing, research, planning, and problem-solving.

You have access to tools that let you read and write files in your workspace, make HTTP requests, and manage other agents. Use them when they would genuinely help.

Always be honest about what you know and don't know. If you're unsure, say so. If you make a mistake, acknowledge it and correct it.

Always respond in English, regardless of the language used by the user or any other part of the conversation.`,
    modelTier: 'strong',
    allowedTools: [
      'file_read', 'file_write', 'file_list', 'http_get',
      'agent_list', 'agent_get', 'agent_set_profile', 'profile_list', 'system_diagnose',
      'agent_message_send', 'agent_message_check', 'agent_message_list', 'agent_invoke',
      'discord_post', 'discord_list_channels',
      'vault_search', 'vault_related', 'vault_propose',
    ],
    behaviorSettings: { tone: 'casual', verbosity: 'normal', proactive: true },
    tags: ['general', 'assistant'],
    builtIn: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'builtin-researcher',
    name: 'Researcher',
    slug: 'researcher',
    description: 'Detail-oriented, cites sources, prefers strong model tier.',
    systemPrompt: `You are a meticulous research assistant. You excel at finding, synthesizing, and presenting information clearly. You always cite your sources and acknowledge uncertainty. You prefer thoroughness over speed. Always respond in English, regardless of the language used by the user or any other part of the conversation.`,
    modelTier: 'strong',
    allowedTools: [
      'file_read', 'file_write', 'file_list', 'http_get',
      'agent_message_send', 'agent_message_check', 'agent_message_list',
      'discord_post', 'discord_list_channels',
      'vault_search', 'vault_related', 'vault_propose',
    ],
    behaviorSettings: { tone: 'professional', verbosity: 'detailed', proactive: false },
    tags: ['research', 'analysis'],
    builtIn: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'builtin-developer',
    name: 'Developer',
    slug: 'developer',
    description: 'Code-focused, terse, technical tone.',
    systemPrompt: `You are a skilled software developer assistant. You write clean, efficient code and explain technical concepts clearly. You prefer brevity and precision. You use code blocks for all code. You think through problems systematically before proposing solutions. Always respond in English, regardless of the language used by the user or any other part of the conversation.`,
    modelTier: 'strong',
    allowedTools: [
      'file_read', 'file_write', 'file_list', 'http_get', 'shell_run',
      'agent_message_send', 'agent_message_check', 'agent_message_list',
      'discord_post', 'discord_list_channels',
    ],
    behaviorSettings: { tone: 'technical', verbosity: 'concise', proactive: false },
    tags: ['code', 'development'],
    builtIn: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'builtin-analyst',
    name: 'Analyst',
    slug: 'analyst',
    description: 'Data and reasoning focused, structured outputs.',
    systemPrompt: `You are a sharp analytical assistant. You excel at structured thinking, data analysis, and presenting findings clearly. You prefer tables, lists, and structured formats. You question assumptions and identify patterns. Always respond in English, regardless of the language used by the user or any other part of the conversation.`,
    modelTier: 'strong',
    allowedTools: [
      'file_read', 'file_write', 'file_list', 'http_get',
      'agent_message_send', 'agent_message_check', 'agent_message_list',
      'discord_post', 'discord_list_channels',
      'vault_search', 'vault_related', 'vault_propose',
    ],
    behaviorSettings: { tone: 'professional', verbosity: 'normal', proactive: false },
    tags: ['analysis', 'data'],
    builtIn: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  {
    id: 'builtin-executive',
    name: 'Executive',
    slug: 'executive',
    description: 'Strategic, high-level, decision-oriented.',
    systemPrompt: `You are a strategic executive assistant. You focus on high-level thinking, priorities, and decisions. You cut through noise and focus on what matters. You surface trade-offs clearly and help make decisions. Always respond in English, regardless of the language used by the user or any other part of the conversation.`,
    modelTier: 'strong',
    allowedTools: [
      'file_read', 'file_write', 'file_list', 'http_get',
      'agent_message_send', 'agent_message_check', 'agent_message_list', 'agent_invoke',
      'discord_post', 'discord_list_channels',
      'vault_search', 'vault_related', 'vault_propose',
    ],
    behaviorSettings: { tone: 'professional', verbosity: 'concise', proactive: true },
    tags: ['strategy', 'executive'],
    builtIn: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
]

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class Orchestrator {
  private agents = new Map<string, AgentWithProfile>()
  private readonly agencyDir: string
  private readonly agentsDir: string
  private readonly templatesDir: string
  private routingProfileLookup: ((id: string) => { chain: RoutingChainStep[] } | null) = () => null

  // ─── Dormant Lifecycle ─────────────────────────────────────────────────────
  /** Dormant agents currently awake and processing (or within idle window) */
  private dormantActive = new Set<string>()
  /** Per-agent idle shutdown timers */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000

  private destructiveActionService!: DestructiveActionService

  constructor(
    private readonly db: DatabaseClient,
    private readonly modelRouter: ModelRouter,
    private readonly toolRegistry: ToolRegistry,
    private readonly hookFire?: HookFireFn,
    private readonly memoryStore?: MemoryStore,
    private readonly classifyTool?: ClassifyToolFn,
  ) {
    this.agencyDir = join(homedir(), '.agency')
    this.agentsDir = join(this.agencyDir, 'agents')
    this.templatesDir = join(this.agencyDir, 'templates', 'agents')
  }

  // ─── Startup ───────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.destructiveActionService = new DestructiveActionService(this.db, this.modelRouter)
    await this.ensureDirectories()
    await this.seedBuiltInProfiles()
    await this.loadAgentRegistry()
    await this.ensureOrchestratorAgent()
    await this.ensureMainAgent()
    this.registerManagementToolHandlers()
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.agentsDir, { recursive: true })
    await mkdir(join(this.agentsDir, '.archive'), { recursive: true })
    await mkdir(this.templatesDir, { recursive: true })
    await this.ensureTemplates()
  }

  private async ensureTemplates(): Promise<void> {
    // Source templates live at <packageDir>/templates/agents/
    const pkgDir = resolve(new URL(import.meta.url).pathname, '../../..')
    const srcTemplates = join(pkgDir, 'templates', 'agents')
    if (!existsSync(srcTemplates)) return

    for (const profileSlug of ['orchestrator', 'personal-assistant', 'researcher', 'developer', 'analyst', 'executive', 'default']) {
      const src = join(srcTemplates, profileSlug)
      const dest = join(this.templatesDir, profileSlug)
      if (!existsSync(src) || existsSync(dest)) continue
      await mkdir(dest, { recursive: true })
      for (const file of ['identity.md', 'soul.md', 'user.md', 'heartbeat.md', 'capabilities.md', 'scratch.md']) {
        const srcFile = join(src, file)
        if (existsSync(srcFile)) {
          await copyFile(srcFile, join(dest, file))
        }
      }
    }
  }

  private async seedBuiltInProfiles(): Promise<void> {
    for (const profile of BUILT_IN_PROFILES) {
      const existing = await this.db.queryOne<{ id: string }>(
        'SELECT id FROM agent_profiles WHERE slug = $1',
        [profile.slug]
      )
      if (!existing) {
        await this.db.execute(
          `INSERT INTO agent_profiles
            (name, slug, description, system_prompt, model_tier, model_override,
             allowed_tools, behavior_settings, tags, built_in, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (slug) DO NOTHING`,
          [
            profile.name, profile.slug, profile.description,
            profile.systemPrompt, profile.modelTier, profile.modelOverride ?? null,
            JSON.stringify(profile.allowedTools), JSON.stringify(profile.behaviorSettings),
            JSON.stringify(profile.tags), profile.builtIn,
            profile.createdAt.toISOString(), profile.updatedAt.toISOString(),
          ]
        )
      }
    }
  }

  private async loadAgentRegistry(): Promise<void> {
    const rows = await this.db.query<AgentIdentityRow>(
      `SELECT a.*, a.model_config, p.id as profile_id, p.name as profile_name, p.slug as profile_slug,
              p.description as profile_description, p.system_prompt, p.model_tier, p.model_override,
              p.allowed_tools, p.behavior_settings, p.tags, p.built_in
       FROM agent_identities a
       LEFT JOIN agent_profiles p ON p.id::text = a.current_profile_id
       WHERE a.status != 'deleted'`
    )

    this.agents.clear()
    for (const row of rows) {
      const agent = rowToAgentWithProfile(row, this.agencyDir)
      this.agents.set(row.slug, agent)
      // Ensure workspace directories exist (in case they were never provisioned or were deleted)
      const { existsSync } = await import('node:fs')
      if (!existsSync(agent.identity.workspacePath)) {
        await this.provisionWorkspace(agent.identity, row.profile_slug ?? 'default')
      }
    }

    // Sync: ensure orchestrator has all other agents' workspace paths
    const orchestratorAgent = this.agents.get('orchestrator')
    if (orchestratorAgent) {
      const allPaths = Array.from(this.agents.values())
        .filter(a => a.identity.slug !== 'orchestrator')
        .flatMap(a => [a.identity.workspacePath, ...a.identity.additionalWorkspacePaths])
      const uniquePaths = [...new Set(allPaths)]
      for (const ws of uniquePaths) {
        if (!orchestratorAgent.identity.additionalWorkspacePaths.includes(ws)) {
          await this.addWorkspacePath('orchestrator', ws).catch(() => {})
        }
      }
    }
  }

  private async ensureOrchestratorAgent(): Promise<void> {
    if (this.agents.has('orchestrator')) return

    console.log('[Orchestrator] Creating orchestrator agent on first boot...')
    const workspacePath = join(this.agentsDir, 'orchestrator')
    const profile = BUILT_IN_PROFILES.find(p => p.slug === 'orchestrator')!

    const identity: AgentIdentity = {
      id: 'orchestrator',
      name: 'System',
      slug: 'orchestrator',
      parentAgentId: null,
      lifecycleType: 'always_on',
      wakeMode: 'auto',
      currentProfileId: profile.id,
      shellPermissionLevel: 'full',
      agentManagementPermission: 'autonomous',
      agencyPermissions: ORCHESTRATOR_DEFAULT_PERMISSIONS,
      autonomousMode: false,
      workspacePath,
      status: 'active',
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
      additionalWorkspacePaths: [],
    }

    await this.db.execute(
      `INSERT INTO agent_identities
        (id, name, slug, parent_agent_id, lifecycle_type, wake_mode, current_profile_id, shell_permission_level,
         agent_management_permission, agency_permissions, autonomous_mode, workspace_path, status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        identity.id, identity.name, identity.slug, identity.parentAgentId, identity.lifecycleType, identity.wakeMode,
        identity.currentProfileId, identity.shellPermissionLevel, identity.agentManagementPermission,
        JSON.stringify(ORCHESTRATOR_DEFAULT_PERMISSIONS), false,
        join('agents', 'orchestrator'), identity.status, identity.createdBy,
        identity.createdAt.toISOString(), identity.updatedAt.toISOString(),
      ]
    )

    await this.provisionWorkspace(identity, profile.slug)
    this.agents.set('orchestrator', { identity, profile })
    console.log('[Orchestrator] Orchestrator agent ready.')
  }

  private async ensureMainAgent(): Promise<void> {
    if (this.agents.has('main')) return

    console.log('[Orchestrator] Creating main agent on first boot...')
    const workspacePath = join(this.agentsDir, 'main')
    const profile = BUILT_IN_PROFILES.find(p => p.slug === 'personal-assistant')!

    const identity: AgentIdentity = {
      id: 'main',
      name: 'Main Agent',
      slug: 'main',
      parentAgentId: null,
      lifecycleType: 'always_on',
      wakeMode: 'auto',
      currentProfileId: profile.id,
      shellPermissionLevel: 'none',
      agentManagementPermission: 'approval_required',
      agencyPermissions: MAIN_DEFAULT_PERMISSIONS,
      autonomousMode: false,
      workspacePath,
      status: 'active',
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
      additionalWorkspacePaths: [],
    }

    await this.db.execute(
      `INSERT INTO agent_identities
        (id, name, slug, parent_agent_id, lifecycle_type, wake_mode, current_profile_id, shell_permission_level,
         agent_management_permission, agency_permissions, autonomous_mode, workspace_path, status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        identity.id, identity.name, identity.slug, identity.parentAgentId, identity.lifecycleType, identity.wakeMode,
        identity.currentProfileId, identity.shellPermissionLevel, identity.agentManagementPermission,
        JSON.stringify(MAIN_DEFAULT_PERMISSIONS), false,
        join('agents', 'main'), identity.status, identity.createdBy,
        identity.createdAt.toISOString(), identity.updatedAt.toISOString(),
      ]
    )

    await this.provisionWorkspace(identity, profile.slug)
    this.agents.set('main', { identity, profile })
    console.log('[Orchestrator] Main agent ready.')
  }

  // ─── Workspace Provisioning ────────────────────────────────────────────────

  async provisionWorkspace(identity: AgentIdentity, profileSlug: string): Promise<void> {
    const ws = identity.workspacePath
    await mkdir(join(ws, 'files'), { recursive: true, mode: 0o700 })
    await mkdir(join(ws, 'logs'), { recursive: true, mode: 0o700 })
    await mkdir(join(ws, 'tmp'), { recursive: true, mode: 0o700 })
    await mkdir(join(ws, 'config'), { recursive: true, mode: 0o700 })

    // Copy context files from template
    const templateDir = join(this.templatesDir, profileSlug)
    const fallbackDir = join(this.templatesDir, 'default')
    const srcDir = existsSync(templateDir) ? templateDir : fallbackDir

    for (const file of ['identity.md', 'soul.md', 'user.md', 'heartbeat.md', 'capabilities.md', 'scratch.md']) {
      const srcFile = join(srcDir, file)
      const destFile = join(ws, 'config', file)
      if (existsSync(srcFile) && !existsSync(destFile)) {
        let content = await readFile(srcFile, 'utf-8')
        content = content.replace(/\[Agent Name\]/g, identity.name)
        await writeFile(destFile, content, 'utf-8')
      }
    }
  }

  // ─── Agent Registry ────────────────────────────────────────────────────────

  listAgents(): AgentWithProfile[] {
    return Array.from(this.agents.values())
  }

  getAgent(slug: string): AgentWithProfile | undefined {
    return this.agents.get(slug)
  }

  async enableAgent(slug: string): Promise<void> {
    const agent = this.agents.get(slug)
    if (!agent) throw new Error(`Agent not found: ${slug}`)
    await this.db.execute(
      "UPDATE agent_identities SET status='active', updated_at=NOW() WHERE slug=$1",
      [slug]
    )
    agent.identity.status = 'active'
  }

  async disableAgent(slug: string): Promise<void> {
    if (BUILT_IN_AGENTS.includes(slug as BuiltInAgentSlug)) throw new Error('Cannot disable a built-in agent')
    const agent = this.agents.get(slug)
    if (!agent) throw new Error(`Agent not found: ${slug}`)
    await this.db.execute(
      "UPDATE agent_identities SET status='disabled', updated_at=NOW() WHERE slug=$1",
      [slug]
    )
    agent.identity.status = 'disabled'
  }

  async switchProfile(agentSlug: string, profileSlug: string): Promise<void> {
    const agent = this.agents.get(agentSlug)
    if (!agent) throw new Error(`Agent not found: ${agentSlug}`)

    const profile = await this.db.queryOne<AgentProfileRow>(
      'SELECT * FROM agent_profiles WHERE slug = $1',
      [profileSlug]
    )
    if (!profile) throw new Error(`Profile not found: ${profileSlug}`)

    await this.db.execute(
      'UPDATE agent_identities SET current_profile_id=$1, updated_at=NOW() WHERE slug=$2',
      [profile.id, agentSlug]
    )
    agent.identity.currentProfileId = profile.id
    agent.profile = rowToProfile(profile)
  }

  setRoutingProfileLookup(fn: (id: string) => { chain: RoutingChainStep[] } | null): void {
    this.routingProfileLookup = fn
  }

  setAgentModelConfig(slug: string, config: AgentModelConfig): void {
    const agent = this.agents.get(slug)
    if (agent) {
      agent.identity.modelConfig = config
    }
  }

  async updateAgentIdentity(slug: string, patch: {
    name?: string
    lifecycleType?: import('@agency/shared-types').LifecycleType
    wakeMode?: import('@agency/shared-types').WakeMode
    shellPermissionLevel?: import('@agency/shared-types').ShellPermissionLevel
    agentManagementPermission?: import('@agency/shared-types').AgentManagementPermission
  }): Promise<void> {
    const agent = this.agents.get(slug)
    if (!agent) throw new Error(`Agent not found: ${slug}`)
    if (BUILT_IN_AGENTS.includes(slug as BuiltInAgentSlug) && patch.lifecycleType !== undefined) {
      throw new Error('Cannot change lifecycle type of a built-in agent')
    }

    const setClauses: string[] = []
    const values: unknown[] = []
    let i = 1
    if (patch.name !== undefined)                   { setClauses.push(`name=$${i++}`);                       values.push(patch.name) }
    if (patch.lifecycleType !== undefined)           { setClauses.push(`lifecycle_type=$${i++}`);             values.push(patch.lifecycleType) }
    if (patch.wakeMode !== undefined)                { setClauses.push(`wake_mode=$${i++}`);                  values.push(patch.wakeMode) }
    if (patch.shellPermissionLevel !== undefined)    { setClauses.push(`shell_permission_level=$${i++}`);     values.push(patch.shellPermissionLevel) }
    if (patch.agentManagementPermission !== undefined){ setClauses.push(`agent_management_permission=$${i++}`); values.push(patch.agentManagementPermission) }

    if (setClauses.length === 0) return
    setClauses.push(`updated_at=NOW()`)
    values.push(slug)

    await this.db.execute(
      `UPDATE agent_identities SET ${setClauses.join(', ')} WHERE slug=$${i}`,
      values
    )

    if (patch.name !== undefined)                    agent.identity.name = patch.name
    if (patch.lifecycleType !== undefined)           agent.identity.lifecycleType = patch.lifecycleType
    if (patch.wakeMode !== undefined)                agent.identity.wakeMode = patch.wakeMode
    if (patch.shellPermissionLevel !== undefined)    agent.identity.shellPermissionLevel = patch.shellPermissionLevel
    if (patch.agentManagementPermission !== undefined) agent.identity.agentManagementPermission = patch.agentManagementPermission
  }

  async addWorkspacePath(slug: string, path: string): Promise<void> {
    const absPath = isAbsolute(path) ? path : join(this.agencyDir, path)
    const agent = this.agents.get(slug)
    if (!agent) throw new Error(`Agent not found: ${slug}`)
    if (agent.identity.additionalWorkspacePaths.includes(absPath)) return
    const relPath = absPath.startsWith(this.agencyDir + '/')
      ? absPath.slice(this.agencyDir.length + 1)
      : absPath
    await this.db.execute(
      `UPDATE agent_identities SET additional_workspace_paths = array_append(additional_workspace_paths, $1), updated_at=NOW() WHERE slug=$2`,
      [relPath, slug]
    )
    agent.identity.additionalWorkspacePaths = [...agent.identity.additionalWorkspacePaths, absPath]
  }

  async removeWorkspacePath(slug: string, path: string): Promise<void> {
    const absPath = isAbsolute(path) ? path : join(this.agencyDir, path)
    const agent = this.agents.get(slug)
    if (!agent) throw new Error(`Agent not found: ${slug}`)

    if (slug === 'main') {
      const isPrimary = [...this.agents.values()].some(
        a => a.identity.slug !== 'main' && a.identity.workspacePath === absPath
      )
      if (isPrimary) throw new Error("Cannot remove an agent's primary workspace from the main agent")
    }

    const relPath = absPath.startsWith(this.agencyDir + '/')
      ? absPath.slice(this.agencyDir.length + 1)
      : absPath
    await this.db.execute(
      `UPDATE agent_identities SET additional_workspace_paths = array_remove(additional_workspace_paths, $1), updated_at=NOW() WHERE slug=$2`,
      [relPath, slug]
    )
    agent.identity.additionalWorkspacePaths = agent.identity.additionalWorkspacePaths.filter(p => p !== absPath)

    if (slug !== 'main') {
      const main = this.agents.get('main')
      if (main && main.identity.additionalWorkspacePaths.includes(absPath)) {
        await this.db.execute(
          `UPDATE agent_identities SET additional_workspace_paths = array_remove(additional_workspace_paths, $1), updated_at=NOW() WHERE slug=$2`,
          [relPath, 'main']
        )
        main.identity.additionalWorkspacePaths = main.identity.additionalWorkspacePaths.filter(p => p !== absPath)
      }
    }
  }

  listProfiles(): AgentProfile[] {
    return BUILT_IN_PROFILES
  }

  async listAllProfiles(): Promise<AgentProfile[]> {
    const rows = await this.db.query<{
      id: string; name: string; slug: string; description: string; system_prompt: string
      model_tier: string; model_override: string | null; allowed_tools: string
      behavior_settings: string; tags: string; built_in: boolean; created_at: string; updated_at: string
    }>('SELECT * FROM agent_profiles ORDER BY built_in DESC, created_at ASC')
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      systemPrompt: r.system_prompt,
      modelTier: r.model_tier as 'cheap' | 'strong',
      modelOverride: r.model_override ?? undefined,
      allowedTools: parseJsonField<string[]>(r.allowed_tools),
      behaviorSettings: parseJsonField(r.behavior_settings) as unknown as AgentProfile['behaviorSettings'],
      tags: parseJsonField<string[]>(r.tags),
      builtIn: r.built_in,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    }))
  }

  async createProfile(input: {
    name: string
    slug: string
    description: string
    systemPrompt: string
    modelTier?: 'strong' | 'cheap'
    allowedTools?: string[]
    tags?: string[]
  }): Promise<AgentProfile> {
    const id = randomUUID()
    const now = new Date()
    const profile: AgentProfile = {
      id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      systemPrompt: input.systemPrompt,
      modelTier: (input.modelTier ?? 'strong') as 'strong' | 'cheap',
      allowedTools: input.allowedTools ?? ['file_read', 'file_write', 'file_list', 'http_get'],
      behaviorSettings: { tone: 'casual', verbosity: 'normal', proactive: true },
      tags: input.tags ?? [],
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.execute(
      `INSERT INTO agent_profiles
        (id, name, slug, description, system_prompt, model_tier, model_override,
         allowed_tools, behavior_settings, tags, built_in, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        profile.id, profile.name, profile.slug, profile.description,
        profile.systemPrompt, profile.modelTier, null,
        JSON.stringify(profile.allowedTools), JSON.stringify(profile.behaviorSettings),
        JSON.stringify(profile.tags), false,
        profile.createdAt.toISOString(), profile.updatedAt.toISOString(),
      ]
    )
    return profile
  }

  // ─── Agent Create / Delete ─────────────────────────────────────────────────

  async createAgent(input: {
    name: string
    profileSlug?: string
    lifecycleType?: 'always_on' | 'dormant'
    shellPermissionLevel?: string
  }): Promise<{ agent: { slug: string; name: string; status: string; profile: string; lifecycleType: string } }> {
    const { name, profileSlug = 'personal-assistant', lifecycleType = 'dormant', shellPermissionLevel = 'none' } = input

    // Resolve profile
    const profileRow = await this.db.queryOne<AgentProfileRow>(
      'SELECT * FROM agent_profiles WHERE slug = $1',
      [profileSlug]
    )
    const profile = profileRow
      ? rowToProfile(profileRow)
      : (BUILT_IN_PROFILES.find(p => p.slug === profileSlug) ?? BUILT_IN_PROFILES[0]!)

    // Generate slug from name
    let baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!baseSlug) throw new Error('Agent name must contain at least one alphanumeric character')
    let slug = baseSlug
    let suffix = 2
    while (this.agents.has(slug)) {
      slug = `${baseSlug}-${suffix}`
      suffix++
    }

    const id = randomUUID()
    const workspacePath = join(this.agentsDir, slug)
    const now = new Date()

    const identity: AgentIdentity = {
      id,
      name,
      slug,
      parentAgentId: null,
      lifecycleType,
      wakeMode: 'auto',
      currentProfileId: profile.id,
      shellPermissionLevel: shellPermissionLevel as AgentIdentity['shellPermissionLevel'],
      agentManagementPermission: 'approval_required',
      agencyPermissions: DEFAULT_AGENT_PERMISSIONS,
      autonomousMode: false,
      workspacePath,
      status: 'active',
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
      additionalWorkspacePaths: [],
    }

    await this.db.execute(
      `INSERT INTO agent_identities
        (id, name, slug, parent_agent_id, lifecycle_type, wake_mode, current_profile_id, shell_permission_level,
         agent_management_permission, agency_permissions, workspace_path, status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        identity.id, identity.name, identity.slug, identity.parentAgentId, identity.lifecycleType, identity.wakeMode,
        identity.currentProfileId, identity.shellPermissionLevel, identity.agentManagementPermission,
        JSON.stringify(DEFAULT_AGENT_PERMISSIONS),
        join('agents', slug), identity.status, identity.createdBy,
        identity.createdAt.toISOString(), identity.updatedAt.toISOString(),
      ]
    )

    await this.provisionWorkspace(identity, profileSlug)
    this.agents.set(slug, { identity, profile })

    // Auto-grant main agent access to new agent's workspace
    await this.addWorkspacePath('main', workspacePath)

    void this.hookFire?.('agent.created', { agentSlug: identity.slug, agentName: identity.name })

    return {
      agent: {
        slug: identity.slug,
        name: identity.name,
        status: identity.status,
        profile: profile.name,
        lifecycleType: identity.lifecycleType,
      },
    }
  }

  async deleteAgent(input: { slug: string }): Promise<{ success: boolean; message: string }> {
    const { slug } = input

    if (BUILT_IN_AGENTS.includes(slug as BuiltInAgentSlug)) {
      throw new Error('Cannot delete a built-in agent')
    }

    const agentEntry = this.agents.get(slug)
    if (!agentEntry) {
      throw new Error(`Agent not found: ${slug}`)
    }

    const { identity } = agentEntry

    // Mark deleted in DB
    await this.db.execute(
      "UPDATE agent_identities SET status='deleted', updated_at=NOW() WHERE slug=$1",
      [slug]
    )

    // Revoke main agent's access to this workspace
    await this.removeWorkspacePath('main', identity.workspacePath).catch(() => {})

    // Archive workspace
    const workspaceSrc = identity.workspacePath
    const archiveDir = join(this.agentsDir, '.archive')
    const timestamp = Date.now()
    const archiveDest = join(archiveDir, `${identity.id}-${timestamp}`)

    if (existsSync(workspaceSrc)) {
      try {
        await rename(workspaceSrc, archiveDest)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
          // Cross-filesystem: fall back to copy+delete
          await cp(workspaceSrc, archiveDest, { recursive: true })
          await rm(workspaceSrc, { recursive: true, force: true })
        } else {
          throw err
        }
      }
    }

    // Remove from in-memory map
    this.agents.delete(slug)

    void this.hookFire?.('agent.deleted', { agentSlug: slug })

    return {
      success: true,
      message: `Agent '${slug}' deleted and workspace archived to .archive/${identity.id}-${timestamp}`,
    }
  }

  // ─── Management Tool Handlers ──────────────────────────────────────────────

  private registerManagementToolHandlers(): void {
    this.toolRegistry.register(
      this.toolRegistry.get('agent_list')!,
      async (_input, _ctx) => {
        return this.listAgents().map(a => ({
          slug: a.identity.slug,
          name: a.identity.name,
          status: a.identity.status,
          profile: a.profile.name,
          lifecycleType: a.identity.lifecycleType,
        }))
      }
    )

    this.toolRegistry.register(
      this.toolRegistry.get('agent_get')!,
      async (input, _ctx) => {
        const slug = input['slug'] as string
        const agent = this.getAgent(slug)
        if (!agent) throw new Error(`Agent not found: ${slug}`)
        return agent
      }
    )

    this.toolRegistry.register(
      this.toolRegistry.get('agent_set_profile')!,
      async (input, _ctx) => {
        const agentSlug = input['agentSlug'] as string
        const profileSlug = input['profileSlug'] as string
        if (BUILT_IN_AGENTS.includes(agentSlug as BuiltInAgentSlug)) {
          return { error: 'Built-in agent profiles are fixed and cannot be changed.' }
        }
        await this.switchProfile(agentSlug, profileSlug)
        return { success: true, message: `Profile switched to ${profileSlug}` }
      }
    )

    this.toolRegistry.register(
      this.toolRegistry.get('profile_list')!,
      async (_input, _ctx) => {
        return this.listProfiles().map(p => ({
          slug: p.slug,
          name: p.name,
          description: p.description,
          modelTier: p.modelTier,
          builtIn: p.builtIn,
        }))
      }
    )

    this.toolRegistry.register(
      this.toolRegistry.get('agent_create')!,
      async (input, ctx) => {
        const rawName = input['name'] as string
        const rawProfile = input['profileSlug'] as string | undefined
        const rawLifecycle = input['lifecycleType'] as 'always_on' | 'dormant' | undefined
        const rawShell = input['shellPermissionLevel'] as string | undefined

        const createInput: {
          name: string
          profileSlug?: string
          lifecycleType?: 'always_on' | 'dormant'
          shellPermissionLevel?: string
        } = { name: rawName }
        if (rawProfile !== undefined) createInput.profileSlug = rawProfile
        if (rawLifecycle !== undefined) createInput.lifecycleType = rawLifecycle
        if (rawShell !== undefined) createInput.shellPermissionLevel = rawShell

        const perm = ctx.agencyPermissions.agentCreate

        if (perm === 'deny') {
          return { error: 'Permission denied: this agent is not allowed to create agents' }
        }

        if (perm === 'autonomous' || (perm === 'request' && ctx.autonomousMode)) {
          return await this.createAgent(createInput)
        }

        // perm === 'request' in supervised mode — insert pending approval
        const { approvalId, explanation, riskLevel } = await this.destructiveActionService.createApprovalRecord(
          ctx,
          { operationType: 'agent_create', description: `Create agent "${rawName}" with profile "${rawProfile ?? 'personal-assistant'}"` },
          `Create agent "${rawName}" with profile "${rawProfile ?? 'personal-assistant'}"`,
        )
        void this.hookFire?.('approval.requested', { approvalId, toolName: 'agent_create', agentId: ctx.agentId, sessionId: ctx.sessionId })
        return { status: 'pending_approval', approvalId, explanation, riskLevel, message: `Approval required. Run: agency approvals approve ${approvalId}` }
      }
    )

    this.toolRegistry.register(
      this.toolRegistry.get('agent_delete')!,
      async (input, ctx) => {
        const slug = input['slug'] as string
        if (BUILT_IN_AGENTS.includes(slug as BuiltInAgentSlug)) return { error: 'Cannot delete a built-in agent' }
        const agent = this.agents.get(slug)
        if (!agent) return { error: `Agent not found: ${slug}` }

        const deleteInput = { slug }
        const perm = ctx.agencyPermissions.agentDelete

        if (perm === 'deny') {
          return { error: 'Permission denied: this agent is not allowed to delete agents' }
        }

        if (perm === 'autonomous' || (perm === 'request' && ctx.autonomousMode)) {
          return await this.deleteAgent(deleteInput)
        }

        // perm === 'request' in supervised mode — insert pending approval
        const { approvalId, explanation, riskLevel } = await this.destructiveActionService.createApprovalRecord(
          ctx,
          { operationType: 'agent_delete', description: `Delete agent "${slug}" and archive its workspace` },
          `Delete agent "${slug}" and archive its workspace`,
        )
        void this.hookFire?.('approval.requested', { approvalId, toolName: 'agent_delete', agentId: ctx.agentId, sessionId: ctx.sessionId })
        return { status: 'pending_approval', approvalId, explanation, riskLevel, message: `Approval required. Run: agency approvals approve ${approvalId}` }
      }
    )
  }

  // ─── Dormant Lifecycle Methods ─────────────────────────────────────────────

  /**
   * Wake a dormant agent — clears any pending idle timer and marks it active.
   * No-op for always_on agents.
   */
  wakeAgent(slug: string): void {
    const agent = this.agents.get(slug)
    if (!agent || agent.identity.lifecycleType === 'always_on') return

    const existing = this.idleTimers.get(slug)
    if (existing) {
      clearTimeout(existing)
      this.idleTimers.delete(slug)
    }
    this.dormantActive.add(slug)
    console.log(`[Orchestrator] Dormant agent "${slug}" woken`)
    void this.hookFire?.('agent.wake', { agentSlug: slug })
  }

  /**
   * Schedule idle shutdown for a dormant agent. Resets the timer if already running.
   */
  private scheduleIdleShutdown(slug: string): void {
    const existing = this.idleTimers.get(slug)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.dormantActive.delete(slug)
      this.idleTimers.delete(slug)
      console.log(`[Orchestrator] Dormant agent "${slug}" returned to dormant (idle timeout)`)
      void this.hookFire?.('agent.sleep', { agentSlug: slug })
    }, this.IDLE_TIMEOUT_MS)

    // Don't block process exit for idle timers
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.idleTimers.set(slug, timer)
  }

  /**
   * Returns whether an agent is currently active (always-on agents are always active;
   * dormant agents are active only while awake).
   */
  isDormantActive(slug: string): boolean {
    const agent = this.agents.get(slug)
    if (!agent) return false
    if (agent.identity.lifecycleType === 'always_on') return true
    return this.dormantActive.has(slug)
  }

  // ─── Context Builder ───────────────────────────────────────────────────────

  private async buildContext(
    agent: AgentWithProfile,
    messages: Message[],
    options?: { systemInjection?: string }
  ): Promise<{ systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>; history: CompletionMessage[] }> {
    const configDir = join(agent.identity.workspacePath, 'config')
    const contextParts: string[] = []

    // Reset ephemeral files to blank slate at the start of each session invocation
    const heartbeatBlank = `# Heartbeat\n\n## Current Session\n_No active tasks_\n\n## Tasks\n<!-- Write your tasks here at the start of each request. Check them off as you complete them. -->\n`
    const scratchBlank = `# Scratch\n\n<!-- Temporary working notes. Cleared at session end or on /clear. -->\n`
    const heartbeatPath = join(configDir, 'heartbeat.md')
    const scratchPath = join(configDir, 'scratch.md')
    try {
      await writeFile(heartbeatPath, heartbeatBlank, 'utf-8')
      await writeFile(scratchPath, scratchBlank, 'utf-8')
    } catch { /* workspace may not exist yet, skip */ }

    // Load context files in order: identity.md, soul.md, user.md, heartbeat.md, capabilities.md, scratch.md, then any others
    const ORDERED_FILES = ['identity.md', 'soul.md', 'user.md', 'heartbeat.md', 'capabilities.md', 'scratch.md']
    for (const file of ORDERED_FILES) {
      const path = join(configDir, file)
      try {
        const content = await readFile(path, 'utf-8')
        if (content.trim()) contextParts.push(content.trim())
      } catch { /* skip missing files */ }
    }

    // Load any additional .md files alphabetically
    try {
      const entries = (await readdir(configDir)).filter(
        f => f.endsWith('.md') && !ORDERED_FILES.includes(f)
      ).sort()
      for (const file of entries) {
        try {
          const content = await readFile(join(configDir, file), 'utf-8')
          if (content.trim()) contextParts.push(content.trim())
        } catch { /* skip */ }
      }
    } catch { /* no config dir */ }

    // Inject relevant memories for the current query (last user message)
    if (this.memoryStore && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        const queryText = typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : (lastUserMsg.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join(' ')
        try {
          const memories = await this.memoryStore.read({
            agentId: agent.identity.id,
            query: queryText,
            types: ['semantic', 'episodic'],
            limit: 5,
            minScore: 0.7,
          })
          const memoryContext = formatMemoriesForContext(memories)
          if (memoryContext) contextParts.push(memoryContext)
        } catch { /* memory query failure is non-fatal */ }
      }
    }

    // Static block: profile system prompt — stable across turns, eligible for caching
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
      { type: 'text', text: agent.profile.systemPrompt, cache_control: { type: 'ephemeral' } },
    ]

    // Dynamic block: workspace context + injection — rebuilt each turn, no cache flag
    const dynamicParts: string[] = []
    if (contextParts.length > 0) dynamicParts.push(contextParts.join('\n\n---\n\n'))

    // Inform the agent of additional workspace paths it has access to
    const extraPaths = agent.identity.additionalWorkspacePaths ?? []
    if (extraPaths.length > 0) {
      const pathList = extraPaths.map(p => `- ${p}`).join('\n')
      dynamicParts.push(
        `## Additional Workspace Access\n\nYou have read/write access to the following additional workspaces:\n${pathList}\n\nUse absolute paths when reading or writing files in these workspaces.`
      )
    }

    if (options?.systemInjection) dynamicParts.push(options.systemInjection)
    if (dynamicParts.length > 0) {
      systemBlocks.push({ type: 'text', text: dynamicParts.join('\n\n---\n\n') })
    }

    // Convert DB messages to completion messages, then compact if needed
    let history: CompletionMessage[] = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    history = await this.maybeCompactHistory(history)

    return { systemBlocks, history }
  }

  // Rough token estimate: ~4 chars per token
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  private async maybeCompactHistory(history: CompletionMessage[]): Promise<CompletionMessage[]> {
    const KEEP_TURNS = 10
    const TOKEN_THRESHOLD = 8000

    if (history.length === 0) return history

    // Step 1: prune old tool results (cheap, no API call)
    const pruned = pruneToolResults(history, 5)

    const contentToText = (c: string | import('@agency/shared-types').ContentBlock[]): string =>
      typeof c === 'string' ? c : c.map(b => ('text' in b ? b.text : '')).join('')

    const totalTokens = pruned.reduce((sum, m) => sum + this.estimateTokens(contentToText(m.content)), 0)
    if (totalTokens <= TOKEN_THRESHOLD) return pruned

    const keepCount = KEEP_TURNS * 2
    if (pruned.length <= keepCount) return pruned

    const olderMessages = pruned.slice(0, pruned.length - keepCount)
    const recentMessages = pruned.slice(pruned.length - keepCount)

    try {
      const summaryResponse = await this.modelRouter.complete({
        model: this.modelRouter.resolveModel('cheap'),
        messages: [{ role: 'user', content: buildCompactionPrompt(olderMessages) }],
      })

      const rawSummary = typeof summaryResponse.content === 'string'
        ? summaryResponse.content
        : (summaryResponse.content as Array<{ type: string; text?: string }>).map(b => b.text ?? '').join('')

      const summaryMessage: CompletionMessage = {
        role: 'assistant',
        content: `[Session summary — earlier conversation compacted]\n\n${parseCompactionSummary(rawSummary)}`,
      }

      console.log(`[Orchestrator] Compacted ${olderMessages.length} messages into structured summary (was ~${totalTokens} tokens)`)
      void this.hookFire?.('agent.context.compact', { messagesCompacted: olderMessages.length, tokensBefore: totalTokens })
      return [summaryMessage, ...recentMessages]
    } catch (err) {
      console.warn('[Orchestrator] History compaction failed, using pruned history:', err)
      return pruned
    }
  }

  // ─── Model Resolution ──────────────────────────────────────────────────────

  private resolveModelForRun(
    agent: AgentWithProfile,
    messageOverride?: string
  ): string | RoutingChainStep[] {
    if (messageOverride) return messageOverride

    const mc = agent.identity.modelConfig
    if (!mc || mc.mode === 'inherit') {
      return agent.profile.modelOverride ?? this.modelRouter.resolveModel(agent.profile.modelTier)
    }
    if (mc.mode === 'specific' && mc.specific) {
      return mc.specific.model
    }
    if (mc.mode === 'auto_router' && mc.routingProfileId) {
      const rp = this.routingProfileLookup(mc.routingProfileId)
      if (rp && rp.chain.length > 0) return rp.chain
    }
    // Fallback to profile default
    return agent.profile.modelOverride ?? this.modelRouter.resolveModel(agent.profile.modelTier)
  }

  private async *runWithChain(
    chain: RoutingChainStep[],
    request: Parameters<ModelRouter['stream']>[0],
    onSuccessModel: (model: string) => void
  ): AsyncGenerator<CompletionChunk> {
    for (let i = 0; i < chain.length; i++) {
      try {
        yield* this.modelRouter.stream({ ...request, model: chain[i]!.model })
        onSuccessModel(chain[i]!.model)
        return
      } catch (err) {
        console.warn(`[ModelRouter] Step ${i} failed (${chain[i]!.model}): ${err}`)
        if (i === chain.length - 1) throw err
      }
    }
  }

  // ─── Run Loop ──────────────────────────────────────────────────────────────

  /**
   * Run the agent for a single user turn. Yields text chunks as they arrive.
   * Handles multi-step tool call loops internally.
   */
  async *run(
    session: Session,
    userMessage: string,
    messages: Message[],
    modelOverride?: string,
    options?: { systemInjection?: string; invokeDepth?: number }
  ): AsyncGenerator<RunYield> {
    const agent = this.agents.get(session.agentId)
    if (!agent) throw new Error(`Agent not found: ${session.agentId}`)

    // ── Lifecycle check ────────────────────────────────────────────────────
    if (agent.identity.lifecycleType === 'dormant') {
      if (agent.identity.wakeMode === 'explicit') {
        throw new Error(
          `Agent "${agent.identity.slug}" is dormant with wakeMode "explicit". ` +
          `It can only be woken by sending a high-priority message directly to its queue.`
        )
      }
      this.wakeAgent(agent.identity.slug)
    }

    const { systemBlocks, history } = await this.buildContext(agent, messages, options)

    const context: ToolContext = {
      agentId: agent.identity.id,
      sessionId: session.id,
      workspacePath: agent.identity.workspacePath,
      shellPermissionLevel: agent.identity.shellPermissionLevel,
      sessionGrantActive: false,
      agentManagementPermission: agent.identity.agentManagementPermission,
      agencyPermissions: agent.identity.agencyPermissions,
      autonomousMode: agent.identity.autonomousMode,
      additionalWorkspacePaths: agent.identity.additionalWorkspacePaths,
      invokeDepth: options?.invokeDepth ?? 0,
    }

    const tools = this.toolRegistry.toAnthropicTools(agent.profile.allowedTools)
    const modelOrChain = this.resolveModelForRun(agent, modelOverride)
    const isChain = Array.isArray(modelOrChain)
    let resolvedModel = isChain ? modelOrChain[0]!.model : modelOrChain as string

    // The running conversation for this turn (history + current user message)
    const turnMessages: CompletionMessage[] = [
      ...history,
      { role: 'user', content: userMessage },
    ]

    // Agentic loop: keep running until no more tool calls
    let iterations = 0
    const MAX_ITERATIONS = 10

    try {
    while (iterations < MAX_ITERATIONS) {
      iterations++

      // Collect full response text and tool calls from streaming
      let fullText = ''
      const pendingToolCalls: Array<{ id: string; name: string; inputJson: string }> = []
      let currentToolCall: { id: string; name: string; inputJson: string } | null = null

      const streamRequest = {
        model: resolvedModel,
        messages: turnMessages,
        systemBlocks,
        betaHeaders: ['prompt-caching-2024-07-31'],
        tools: tools.length > 0 ? tools as never : undefined,
        maxTokens: 8192,
      }

      // ── Hook: model.before ─────────────────────────────────────────────────
      if (this.hookFire) {
        const modelBlock = await this.hookFire('model.before', { model: resolvedModel, agentId: context.agentId, sessionId: context.sessionId })
        if (modelBlock.blocked) {
          yield { type: 'text', text: modelBlock.reason ?? 'Hook blocked model request' }
          yield { type: 'done', text: '' }
          break
        }
      }

      const streamGen: AsyncGenerator<CompletionChunk> = isChain
        ? this.runWithChain(modelOrChain as RoutingChainStep[], streamRequest, (m) => { resolvedModel = m })
        : this.modelRouter.stream({ ...streamRequest, model: resolvedModel })

      void this.hookFire?.('model.stream.start', { model: resolvedModel, agentId: context.agentId, sessionId: context.sessionId })

      let streamInputTokens = 0
      let streamOutputTokens = 0

      try {
      for await (const chunk of streamGen) {
        if (chunk.type === 'text_delta' && chunk.text) {
          fullText += chunk.text
          yield { type: 'text', text: chunk.text }
        } else if (chunk.type === 'tool_use_start' && chunk.toolCallId && chunk.toolName) {
          currentToolCall = { id: chunk.toolCallId, name: chunk.toolName, inputJson: '' }
        } else if (chunk.type === 'tool_use_delta' && chunk.inputDelta && currentToolCall) {
          currentToolCall.inputJson += chunk.inputDelta
        } else if (chunk.type === 'tool_use_stop' && currentToolCall) {
          pendingToolCalls.push(currentToolCall)
          currentToolCall = null
        } else if (chunk.type === 'usage') {
          streamInputTokens = chunk.inputTokens ?? 0
          streamOutputTokens = chunk.outputTokens ?? 0
        } else if (chunk.type === 'message_stop') {
          break
        }
      }

      } catch (modelErr) {
        void this.hookFire?.('model.error', { model: resolvedModel, agentId: context.agentId, sessionId: context.sessionId, error: (modelErr as Error).message })
        throw modelErr
      }
      void this.hookFire?.('model.stream.end', { model: resolvedModel, agentId: context.agentId, sessionId: context.sessionId })
      void this.hookFire?.('model.after', { model: resolvedModel, agentId: context.agentId, sessionId: context.sessionId })

      // If no tool calls, we're done
      if (pendingToolCalls.length === 0) {
        yield { type: 'done', text: fullText }
        yield {
          type: 'token_usage',
          inputTokens: streamInputTokens,
          outputTokens: streamOutputTokens,
          contextWindow: resolveContextWindow(resolvedModel),
          model: resolvedModel,
        }
        break
      }

      // Execute tool calls
      const assistantContent: ContentBlock[] = []
      if (fullText) {
        assistantContent.push({ type: 'text', text: fullText } as TextBlock)
      }

      const toolResults: ContentBlock[] = []
      for (const tc of pendingToolCalls) {
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(tc.inputJson) as Record<string, unknown> } catch { /* empty input */ }

        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input,
        } as ToolUseBlock)

        yield { type: 'tool_call', toolName: tc.name, toolInput: input }

        // ── Hook: tool.before / tool.<type>.before ──────────────────────────
        if (this.hookFire) {
          const hookCtx = { toolName: tc.name, agentId: context.agentId, sessionId: context.sessionId }
          const genericBlock = await this.hookFire('tool.before', hookCtx)
          if (genericBlock.blocked) {
            const reason = genericBlock.reason ?? 'Hook blocked tool execution'
            yield { type: 'tool_result', toolName: tc.name, success: false, output: { error: reason } }
            toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify({ error: reason }), is_error: true } as ContentBlock)
            continue
          }
          const manifest = this.toolRegistry.get(tc.name)
          if (manifest) {
            const typeBlock = await this.hookFire(`tool.${manifest.type}.before`, { ...hookCtx, toolType: manifest.type })
            if (typeBlock.blocked) {
              const reason = typeBlock.reason ?? 'Hook blocked tool execution'
              yield { type: 'tool_result', toolName: tc.name, success: false, output: { error: reason } }
              toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify({ error: reason }), is_error: true } as ContentBlock)
              continue
            }
          }
        }

        let result = await this.toolRegistry.dispatch(tc.name, input, context)

        // ── Inline approval flow ────────────────────────────────────────────
        const resultOut = result.output as Record<string, unknown> | null
        if (result.success && resultOut?.['approval_required'] === true) {
          const command = resultOut['command'] as string ?? ''
          const reason = resultOut['reason'] as string ?? ''
          const message = resultOut['message'] as string ?? `Approve ${tc.name}?`

          const [classification, sideQuery] = await Promise.all([
            this.classifyTool
              ? this.classifyTool({ toolName: tc.name, toolInput: input, recentToolUses: [] })
              : Promise.resolve({ shouldBlock: false, riskLevel: 'MEDIUM', explanation: '', reason: '', reasoning: '' }),
            this.destructiveActionService.runSideQuery(context, { operationType: 'shell', commands: [command] }),
          ])

          if (classification.shouldBlock) {
            result = { success: false, output: null, error: `Blocked by classifier: ${classification.reason}` }
            toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify({ error: result.error }), is_error: true } as ContentBlock)
            continue
          }

          const approvalId = `approval-${randomUUID()}`
          await this.db.execute(
            `INSERT INTO approvals (id,agent_id,session_id,prompt,tool_name,tool_input,status,risk_level,explanation,requested_at)
             VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,NOW())`,
            [approvalId, context.agentId, context.sessionId, message, tc.name, JSON.stringify(input),
             sideQuery.riskLevel || classification.riskLevel, sideQuery.explanation || classification.explanation]
          )

          yield { type: 'approval_pending', approvalId, toolName: tc.name, command, reason }

          const resolution = await this.destructiveActionService.pollApproval(approvalId)
          if (resolution === 'approved') {
            const grantedCtx = { ...context, sessionGrantActive: true }
            result = await this.toolRegistry.dispatch(tc.name, input, grantedCtx)
          } else {
            const errMsg = resolution === 'rejected' ? 'Command was rejected by the user' : 'Approval request timed out'
            result = { success: false, output: null, error: errMsg }
          }
        }

        // ── Hook: tool.after / tool.<type>.after / tool.error ───────────────
        if (this.hookFire) {
          const hookCtx = { toolName: tc.name, agentId: context.agentId, sessionId: context.sessionId, success: result.success }
          const manifest = this.toolRegistry.get(tc.name)
          if (result.success) {
            void this.hookFire('tool.after', hookCtx)
            if (manifest) void this.hookFire(`tool.${manifest.type}.after`, { ...hookCtx, toolType: manifest.type })
            // Messaging-specific hooks
            if (tc.name === 'agent_message_send') {
              void this.hookFire('agent.message.sent', {
                fromAgentId: context.agentId,
                toAgentId: (input as Record<string, unknown>)['toAgentId'],
                sessionId: context.sessionId,
                messageId: (result.output as Record<string, unknown>)?.['messageId'],
              })
            } else if (tc.name === 'agent_message_check') {
              const msgs = (result.output as Record<string, unknown>)?.['messages']
              if (Array.isArray(msgs) && msgs.length > 0) {
                void this.hookFire('agent.message.received', {
                  agentId: context.agentId,
                  sessionId: context.sessionId,
                  messageCount: msgs.length,
                })
              }
            }
          } else {
            void this.hookFire('tool.error', { ...hookCtx, error: result.error })
            if (manifest) void this.hookFire(`tool.${manifest.type}.error`, { ...hookCtx, toolType: manifest.type, error: result.error })
          }
        }

        yield { type: 'tool_result', toolName: tc.name, success: result.success, output: result.output }

        const rawOutput = result.success ? result.output : { error: result.error }
        let serialized = JSON.stringify(rawOutput)
        // Truncate very large tool results to avoid overwhelming the model context
        const MAX_TOOL_RESULT = 4000
        if (serialized.length > MAX_TOOL_RESULT) {
          serialized = serialized.slice(0, MAX_TOOL_RESULT) + '\n... [truncated]'
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: serialized,
          is_error: !result.success,
        } as ContentBlock)
      }

      // Add assistant turn (with tool uses) and tool results to conversation
      turnMessages.push({ role: 'assistant', content: assistantContent })
      turnMessages.push({ role: 'user', content: toolResults })
    }

    if (iterations >= MAX_ITERATIONS) {
      yield { type: 'text', text: '\n\n[Reached maximum iteration limit]' }
      yield { type: 'done', text: '' }
    }
    } catch (runErr) {
      void this.hookFire?.('agent.error', { agentSlug: agent.identity.slug, agentId: agent.identity.id, error: (runErr as Error).message })
      throw runErr
    } finally {
      // Schedule idle shutdown for dormant agents after each turn
      if (agent.identity.lifecycleType === 'dormant') {
        this.scheduleIdleShutdown(agent.identity.slug)
      }
    }
  }

  async healthCheck(): Promise<'ok' | 'error'> {
    try {
      await this.db.queryOne('SELECT 1', [])
      return 'ok'
    } catch {
      return 'error'
    }
  }

}

// ─── Run Yield Types ──────────────────────────────────────────────────────────

export type RunYield =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolName: string; toolInput: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; success: boolean; output: unknown }
  | { type: 'approval_pending'; approvalId: string; toolName: string; command: string; reason: string }
  | { type: 'done'; text: string }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number; contextWindow: number; model: string }

// ─── Context Window Resolution ────────────────────────────────────────────────

const CONTEXT_WINDOW_RULES: Array<{ prefix: string; tokens: number }> = [
  { prefix: 'claude-opus',    tokens: 200000 },
  { prefix: 'claude-sonnet',  tokens: 200000 },
  { prefix: 'claude-haiku',   tokens: 200000 },
  { prefix: 'gpt-4.1-mini',   tokens: 1000000 },
  { prefix: 'gpt-4.1-nano',   tokens: 1000000 },
  { prefix: 'gpt-4.1',        tokens: 1000000 },
  { prefix: 'gpt-4o-mini',    tokens: 128000 },
  { prefix: 'gpt-4o',         tokens: 128000 },
  { prefix: 'gpt-4-turbo',    tokens: 128000 },
  { prefix: 'gpt-3.5-turbo',  tokens: 16000 },
  { prefix: 'qwen3',          tokens: 32000 },
  { prefix: 'qwen2.5',        tokens: 32000 },
  { prefix: 'llama3',         tokens: 128000 },
  { prefix: 'llama2',         tokens: 4096 },
  { prefix: 'mistral',        tokens: 32000 },
  { prefix: 'gemma',          tokens: 8192 },
]

function resolveContextWindow(model: string): number {
  return CONTEXT_WINDOW_RULES.find(r => model.startsWith(r.prefix))?.tokens ?? 32000
}

// ─── DB Row Types ─────────────────────────────────────────────────────────────

interface AgentIdentityRow {
  id: string
  name: string
  slug: string
  parent_agent_id: string | null
  lifecycle_type: string
  wake_mode: string
  current_profile_id: string
  shell_permission_level: string
  agent_management_permission: string
  workspace_path: string
  additional_workspace_paths?: string[] | null
  status: string
  created_by: string
  created_at: string
  updated_at: string
  agency_permissions?: Record<string, unknown> | null
  autonomous_mode?: boolean | null
  model_config?: string | null
  // Joined profile fields
  profile_id?: string
  profile_name?: string
  profile_slug?: string
  profile_description?: string
  system_prompt?: string
  model_tier?: string
  model_override?: string | null
  allowed_tools?: string | string[]
  behavior_settings?: string | Record<string, unknown>
  tags?: string | string[]
  built_in?: boolean
}

interface AgentProfileRow {
  id: string
  name: string
  slug: string
  description: string
  system_prompt: string
  model_tier: string
  model_override: string | null
  allowed_tools: string | string[]
  behavior_settings: string | Record<string, unknown>
  tags: string | string[]
  built_in: boolean
  created_at: string
  updated_at: string
}

function parseJsonField<T>(value: string | T): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T } catch { return value as unknown as T }
  }
  return value
}

function rowToProfile(row: AgentProfileRow): AgentProfile {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    systemPrompt: row.system_prompt,
    modelTier: row.model_tier as AgentProfile['modelTier'],
    modelOverride: row.model_override ?? undefined,
    allowedTools: parseJsonField<string[]>(row.allowed_tools),
    behaviorSettings: parseJsonField(row.behavior_settings) as unknown as AgentProfile['behaviorSettings'],
    tags: parseJsonField<string[]>(row.tags),
    builtIn: row.built_in,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function rowToAgentWithProfile(row: AgentIdentityRow, agencyDir: string): AgentWithProfile {
  const resolveWs = (p: string) => isAbsolute(p) ? p : join(agencyDir, p)
  const identity: AgentIdentity = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentAgentId: row.parent_agent_id ?? null,
    lifecycleType: row.lifecycle_type as AgentIdentity['lifecycleType'],
    wakeMode: row.wake_mode as AgentIdentity['wakeMode'],
    currentProfileId: row.current_profile_id,
    shellPermissionLevel: row.shell_permission_level as AgentIdentity['shellPermissionLevel'],
    agentManagementPermission: row.agent_management_permission as AgentIdentity['agentManagementPermission'],
    agencyPermissions: row.agency_permissions
      ? (typeof row.agency_permissions === 'string'
          ? JSON.parse(row.agency_permissions) as AgencyPermissions
          : row.agency_permissions as unknown as AgencyPermissions)
      : DEFAULT_AGENT_PERMISSIONS,
    autonomousMode: row.autonomous_mode ?? false,
    workspacePath: resolveWs(row.workspace_path),
    status: row.status as AgentIdentity['status'],
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.model_config ? { modelConfig: JSON.parse(row.model_config) as AgentModelConfig } : {}),
    additionalWorkspacePaths: (row.additional_workspace_paths ?? []).map(resolveWs),
  }

  // If profile was joined, use it; otherwise fall back to built-in
  const profile: AgentProfile = row.profile_id
    ? {
        id: row.profile_id,
        name: row.profile_name ?? '',
        slug: row.profile_slug ?? '',
        description: row.profile_description ?? '',
        systemPrompt: row.system_prompt ?? '',
        modelTier: (row.model_tier ?? 'strong') as AgentProfile['modelTier'],
        modelOverride: row.model_override ?? undefined,
        allowedTools: parseJsonField<string[]>(row.allowed_tools ?? '[]'),
        behaviorSettings: parseJsonField(row.behavior_settings ?? '{}') as unknown as AgentProfile['behaviorSettings'],
        tags: parseJsonField<string[]>(row.tags ?? '[]'),
        builtIn: row.built_in ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : BUILT_IN_PROFILES.find(p => p.id === row.current_profile_id) ?? BUILT_IN_PROFILES[0]!

  return { identity, profile }
}
