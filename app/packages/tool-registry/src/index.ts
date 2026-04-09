// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createRequire } from 'node:module'
import type {
  ToolManifest,
  ToolContext,
  ToolDispatchResult,
  ToolType,
  ToolJob,
  WorkerQueueName,
  BuiltInAgentSlug,
} from '@agency/shared-types'
import { BUILT_IN_AGENTS } from '@agency/shared-types'
import { QueueClient } from '@agency/shared-worker'
import { randomUUID } from 'node:crypto'
import type { MemoryStore } from '@agency/memory'
import type { MessagingService } from '@agency/messaging'
import { createMemoryHandlers } from './tools/memory-handlers.js'
import { createMessagingHandlers } from './tools/messaging-handlers.js'
import type { InvokeService } from './tools/messaging-handlers.js'
import { createDiscordHandlers } from './tools/discord-handlers.js'
import type { DiscordService } from './tools/discord-handlers.js'
import { createVaultHandlers } from './tools/vault-handlers.js'
import type { VaultStore } from './tools/vault-handlers.js'
import { createBrainHandlers } from './tools/brain-handlers.js'
import type { BrainStore } from './tools/brain-handlers.js'

// ─── Tool Registry ────────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolManifest>()
  public readonly handlers = new Map<string, ToolHandler>()

  constructor(private queueClient?: QueueClient) {}

  register(manifest: ToolManifest, handler: ToolHandler): void {
    this.tools.set(manifest.name, manifest)
    this.handlers.set(manifest.name, handler)
  }

  get(name: string): ToolManifest | undefined {
    return this.tools.get(name)
  }

  list(): ToolManifest[] {
    return Array.from(this.tools.values())
  }

  listByType(type: ToolType): ToolManifest[] {
    return this.list().filter(t => t.type === type)
  }

  async dispatch(name: string, input: unknown, context: ToolContext): Promise<ToolDispatchResult> {
    const manifest = this.tools.get(name)
    if (!manifest) {
      return { success: false, output: null, error: `Unknown tool: ${name}` }
    }

    // Determine if we should route to BullMQ
    let targetQueue: WorkerQueueName | null = null
    if (this.queueClient) {
      if (manifest.type === 'shell') targetQueue = 'queue:shell'
      else if (manifest.type === 'code') targetQueue = 'queue:code'
      else if (manifest.type === 'browser') targetQueue = 'queue:browser'
    }

    if (targetQueue && this.queueClient) {
      try {
        const jobData: ToolJob = {
          toolName: name,
          input: input as Record<string, unknown>,
          context,
          timeout: manifest.timeout,
          maxAttempts: 1,
        }
        const jobId = `job-${randomUUID()}`
        const output = await this.queueClient.dispatchAndWait(targetQueue, jobId, jobData)
        return { success: true, output }
      } catch (err) {
        return { success: false, output: null, error: `Queue execution failed: ${String(err)}` }
      }
    }

    // Local execution fallback
    const handler = this.handlers.get(name)
    if (!handler) {
      return { success: false, output: null, error: `No handler for tool: ${name}` }
    }

    try {
      const output = await handler(input as Record<string, unknown>, context)
      return { success: true, output }
    } catch (err) {
      return { success: false, output: null, error: String(err) }
    }
  }

  /** Return tool definitions in Anthropic format for system context */
  toAnthropicTools(allowedTools: string[]): AnthropicToolDef[] {
    return allowedTools
      .map(name => this.tools.get(name))
      .filter((m): m is ToolManifest => m !== undefined)
      .map(m => ({
        name: m.name,
        description: m.description,
        input_schema: m.inputSchema,
      }))
  }
}

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>

interface AnthropicToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// ─── Path Enforcement Helpers ─────────────────────────────────────────────────

export function enforceAnyWorkspacePath(
  inputPath: string,
  primaryWorkspace: string,
  extraPaths: string[]
): string {
  // Extra paths take priority; primary workspace is the fallback
  const allowed = [...extraPaths, primaryWorkspace]
  // For each allowed base, try resolving the input relative to it
  for (const base of allowed) {
    const resolved = resolve(base, inputPath)
    if (resolved.startsWith(base + '/') || resolved === base) {
      return resolved
    }
  }
  throw new Error(
    `Permission denied: path '${inputPath}' is outside allowed workspaces`
  )
}

// ─── Built-in Tool Manifests ──────────────────────────────────────────────────

const FILE_READ_MANIFEST: ToolManifest = {
  name: 'file_read',
  type: 'file',
  description: 'Read the contents of a file within the agent workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file (relative to workspace or absolute within workspace)' },
    },
    required: ['path'],
  },
  permissions: ['filesystem:workspace'],
  sandboxed: false,
  timeout: 10_000,
}

const FILE_WRITE_MANIFEST: ToolManifest = {
  name: 'file_write',
  type: 'file',
  description: 'Write content to a file within the agent workspace. Creates the file if it does not exist.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  permissions: ['filesystem:workspace'],
  sandboxed: false,
  timeout: 10_000,
}

const FILE_LIST_MANIFEST: ToolManifest = {
  name: 'file_list',
  type: 'file',
  description: 'List files and directories in a directory within the agent workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list (defaults to workspace root)' },
    },
    required: [],
  },
  permissions: ['filesystem:workspace'],
  sandboxed: false,
  timeout: 10_000,
}

const HTTP_GET_MANIFEST: ToolManifest = {
  name: 'http_get',
  type: 'http',
  description: 'Make an HTTP GET request to a URL and return the response body.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      headers: {
        type: 'object',
        description: 'Optional request headers',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['url'],
  },
  permissions: ['network:outbound'],
  sandboxed: false,
  timeout: 30_000,
}

const SHELL_RUN_MANIFEST: ToolManifest = {
  name: 'shell_run',
  type: 'shell',
  description: 'Run a shell command within the agent workspace. The command runs in the workspace directory.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
  permissions: ['shell:workspace'],
  sandboxed: false,
  timeout: 60_000,
}

const CODE_RUN_PYTHON_MANIFEST: ToolManifest = {
  name: 'code_run_python',
  type: 'code',
  description: 'Execute Python code. Returns stdout and stderr.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python code to execute' },
    },
    required: ['code'],
  },
  permissions: ['code:execute'],
  sandboxed: true,
  timeout: 60_000,
}

const CODE_RUN_JS_MANIFEST: ToolManifest = {
  name: 'code_run_javascript',
  type: 'code',
  description: 'Execute JavaScript code in a Node.js environment. Returns stdout and stderr.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
    },
    required: ['code'],
  },
  permissions: ['code:execute'],
  sandboxed: true,
  timeout: 60_000,
}

const BROWSER_NAVIGATE_MANIFEST: ToolManifest = {
  name: 'browser_navigate',
  type: 'browser',
  description: 'Navigate to a URL and perform a browser action: fetch the page text, take a screenshot, or extract specific content.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
      action: { type: 'string', enum: ['fetch', 'screenshot', 'extract'], description: 'Action to perform' },
      selector: { type: 'string', description: 'CSS selector for extract action' },
      waitForSelector: { type: 'string', description: 'CSS selector to wait for before performing action' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
    },
    required: ['url', 'action'],
  },
  permissions: ['network:outbound'],
  sandboxed: true,
  timeout: 60_000,
}

// ─── Agent Management Tool Manifests ─────────────────────────────────────────

const AGENT_LIST_MANIFEST: ToolManifest = {
  name: 'agent_list',
  type: 'agent_management',
  description: 'List all agents and their current status and profile.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 5_000,
}

const AGENT_GET_MANIFEST: ToolManifest = {
  name: 'agent_get',
  type: 'agent_management',
  description: 'Get the full identity and current profile for a specific agent.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Agent slug identifier' },
    },
    required: ['slug'],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 5_000,
}

const AGENT_SET_PROFILE_MANIFEST: ToolManifest = {
  name: 'agent_set_profile',
  type: 'agent_management',
  description: 'Attach a different profile to an agent. This is autonomous — no approval needed.',
  inputSchema: {
    type: 'object',
    properties: {
      agentSlug: { type: 'string', description: 'Agent slug' },
      profileSlug: { type: 'string', description: 'Profile slug to attach' },
    },
    required: ['agentSlug', 'profileSlug'],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 5_000,
}

const PROFILE_LIST_MANIFEST: ToolManifest = {
  name: 'profile_list',
  type: 'agent_management',
  description: 'List all available agent profiles.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 5_000,
}

// ─── Memory Tool Manifests ────────────────────────────────────────────────────

const MEMORY_WRITE_MANIFEST: ToolManifest = {
  name: 'memory_write',
  type: 'agent_management',
  description: 'Store a memory entry for later retrieval. Use to remember facts, decisions, or observations.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The memory content to store' },
      type: { type: 'string', enum: ['episodic', 'semantic', 'working'], description: 'Memory type' },
      scope: { type: 'string', enum: ['private', 'group'], description: "Memory scope: 'private' (default) or 'group'" },
      groupId: { type: 'string', description: "Group ID when scope is 'group'" },
    },
    required: ['content'],
  },
  permissions: ['memory:write'],
  sandboxed: false,
  timeout: 5_000,
}

const MEMORY_READ_MANIFEST: ToolManifest = {
  name: 'memory_read',
  type: 'agent_management',
  description: 'Search and retrieve relevant memories. Use to recall past context, facts, or decisions.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      types: { type: 'array', items: { type: 'string' }, description: 'Filter by memory type: episodic, semantic, working' },
      limit: { type: 'number', description: 'Max results to return (default: 10)' },
    },
    required: ['query'],
  },
  permissions: ['memory:read'],
  sandboxed: false,
  timeout: 10_000,
}

// ─── Messaging Tool Manifests ─────────────────────────────────────────────────

const AGENT_MESSAGE_SEND_MANIFEST: ToolManifest = {
  name: 'agent_message_send',
  type: 'agent_management',
  description: 'Send an async message to another agent. Returns the message ID immediately without waiting for a response.',
  inputSchema: {
    type: 'object',
    properties: {
      toAgentId: { type: 'string', description: 'Target agent slug or ID' },
      subject: { type: 'string', description: 'Brief description of the message' },
      payload: { type: 'object', description: 'Message content (task, query, notification, etc.)' },
      priority: { type: 'string', enum: ['high', 'normal'], description: 'Message priority (default: normal)' },
      correlationId: { type: 'string', description: 'Correlation ID to group related messages' },
    },
    required: ['toAgentId', 'subject', 'payload'],
  },
  permissions: ['agent:message'],
  sandboxed: false,
  timeout: 5_000,
}

const AGENT_MESSAGE_CHECK_MANIFEST: ToolManifest = {
  name: 'agent_message_check',
  type: 'agent_management',
  description: 'Check inbox for unread messages. Returns up to 10 messages, high priority first.',
  inputSchema: {
    type: 'object',
    properties: {
      maxMessages: { type: 'number', description: 'Maximum messages to return (default: 10)' },
    },
    required: [],
  },
  permissions: ['agent:message'],
  sandboxed: false,
  timeout: 5_000,
}

const AGENT_MESSAGE_LIST_MANIFEST: ToolManifest = {
  name: 'agent_message_list',
  type: 'agent_management',
  description: 'List all active agents available to message.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  permissions: ['agent:message'],
  sandboxed: false,
  timeout: 5_000,
}

const DISCORD_POST_MANIFEST: ToolManifest = {
  name: 'discord_post',
  type: 'http',
  description: [
    "Post a message to a Discord channel using this agent's own bot.",
    'channel accepts a channel name (e.g. "board-room") or raw channel ID.',
    'Returns { posted: true, channelId, guildId } on success.',
    'Returns an error if this agent has no Discord bot or the channel is not found.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel name or ID' },
      content: { type: 'string', description: 'Message content to post' },
    },
    required: ['channel', 'content'],
  },
  permissions: ['discord:post'],
  sandboxed: false,
  timeout: 15_000,
}

const DISCORD_LIST_CHANNELS_MANIFEST: ToolManifest = {
  name: 'discord_list_channels',
  type: 'http',
  description: "List all text and announcement channels visible to this agent's Discord bot, grouped by guild and category.",
  inputSchema: { type: 'object', properties: {}, required: [] },
  permissions: ['discord:read'],
  sandboxed: false,
  timeout: 10_000,
}

const AGENT_INVOKE_MANIFEST: ToolManifest = {
  name: 'agent_invoke',
  type: 'agent_management',
  description: [
    'Synchronously invoke another agent with a prompt and wait for their full response.',
    'Use when you need the result to continue (e.g. delegating a task to a subject-matter expert).',
    'For fire-and-forget background tasks use agent_message_send instead.',
    'Maximum invocation depth: 5.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      agentSlug: { type: 'string', description: 'Slug of the agent to invoke (e.g. "mia", "elena")' },
      prompt: { type: 'string', description: 'The prompt/task to send to the agent' },
    },
    required: ['agentSlug', 'prompt'],
  },
  permissions: ['agent:message'],
  sandboxed: false,
  timeout: 120_000,
}

const AGENT_CREATE_MANIFEST: ToolManifest = {
  name: 'agent_create',
  type: 'agent_management',
  description: 'Create a new agent with a name and optional profile. Requires user approval if agentManagementPermission is approval_required.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human-readable name for the new agent' },
      profileSlug: { type: 'string', description: 'Profile slug to attach (default: personal-assistant)' },
      lifecycleType: { type: 'string', enum: ['always_on', 'dormant'], description: 'Agent lifecycle type' },
      shellPermissionLevel: { type: 'string', description: 'Shell permission level (default: none)' },
    },
    required: ['name'],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 30_000,
}

const AGENT_DELETE_MANIFEST: ToolManifest = {
  name: 'agent_delete',
  type: 'agent_management',
  description: 'Delete an agent. Always requires user approval. Workspace is archived, not deleted.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Agent slug to delete' },
    },
    required: ['slug'],
  },
  permissions: ['agent:manage'],
  sandboxed: false,
  timeout: 30_000,
}

// ─── Group Management Tool Manifests ──────────────────────────────────────────

const GROUP_CREATE_MANIFEST: ToolManifest = {
  name: 'group_create',
  type: 'agent_management',
  description: 'Create a new workspace group with a shared directory and memory space.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name for the group' },
      slug: { type: 'string', description: 'URL-safe identifier (auto-generated from name if omitted)' },
      description: { type: 'string', description: 'What this group is for' },
      hierarchyType: { type: 'string', enum: ['flat', 'hierarchical', 'council'], description: 'Group structure type' },
      goals: { type: 'array', items: { type: 'string' }, description: 'Goals or objectives for this group' },
    },
    required: ['name'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

const GROUP_UPDATE_MANIFEST: ToolManifest = {
  name: 'group_update',
  type: 'agent_management',
  description: 'Update a workspace group name, description, goals, or hierarchy type.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Group ID' },
      name: { type: 'string' },
      description: { type: 'string' },
      hierarchyType: { type: 'string', enum: ['flat', 'hierarchical', 'council'] },
      goals: { type: 'array', items: { type: 'string' } },
    },
    required: ['id'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

const GROUP_DELETE_MANIFEST: ToolManifest = {
  name: 'group_delete',
  type: 'agent_management',
  description: 'Delete a workspace group. The shared directory is preserved on disk.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Group ID' },
    },
    required: ['id'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

const GROUP_MEMBER_ADD_MANIFEST: ToolManifest = {
  name: 'group_member_add',
  type: 'agent_management',
  description: 'Add an agent to a workspace group.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: 'Group ID' },
      agentId: { type: 'string', description: 'Agent ID or slug' },
      role: { type: 'string', enum: ['lead', 'member', 'observer'], description: 'Role in the group' },
    },
    required: ['groupId', 'agentId'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

const GROUP_MEMBER_REMOVE_MANIFEST: ToolManifest = {
  name: 'group_member_remove',
  type: 'agent_management',
  description: 'Remove an agent from a workspace group.',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: 'Group ID' },
      agentId: { type: 'string', description: 'Agent ID or slug' },
    },
    required: ['groupId', 'agentId'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

const GROUP_LIST_MANIFEST: ToolManifest = {
  name: 'group_list',
  type: 'agent_management',
  description: 'List all workspace groups with member counts.',
  inputSchema: { type: 'object', properties: {} },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

const GROUP_GET_MANIFEST: ToolManifest = {
  name: 'group_get',
  type: 'agent_management',
  description: 'Get details of a workspace group including its members.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Group ID' },
    },
    required: ['id'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10000,
}

// ─── Vault Tool Manifests ─────────────────────────────────────────────────────

const VAULT_SEARCH_MANIFEST: ToolManifest = {
  name: 'vault_search',
  type: 'vault',
  description: 'Search the knowledge vault for documents matching a query. Always call this before vault_propose to find existing documents to link to.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    required: ['query'],
  },
  permissions: ['vault:read'],
  sandboxed: false,
  timeout: 10_000,
}

const VAULT_RELATED_MANIFEST: ToolManifest = {
  name: 'vault_related',
  type: 'vault',
  description: 'Find documents linked to or from a given document in the vault knowledge graph.',
  inputSchema: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Filename or partial path of the document' },
      limit: { type: 'number', description: 'Max results per direction (default 10)' },
    },
    required: ['slug'],
  },
  permissions: ['vault:read'],
  sandboxed: false,
  timeout: 10_000,
}

const VAULT_PROPOSE_MANIFEST: ToolManifest = {
  name: 'vault_propose',
  type: 'vault',
  description: 'Write a new document proposal to the vault. Proposals are reviewed by a human before becoming canon. Always include proper frontmatter and wikilinks.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to proposals/ directory (e.g. "decisions/use-postgres.md")' },
      content: { type: 'string', description: 'Full markdown content including frontmatter' },
    },
    required: ['path', 'content'],
  },
  permissions: ['vault:write'],
  sandboxed: false,
  timeout: 10_000,
}

// ─── Brain Tool Manifests ─────────────────────────────────────────────────────

export const BRAIN_READ_MANIFEST: ToolManifest = {
  name: 'brain_read',
  type: 'code',
  description: 'Read a specific node from the Brain by its ID. Returns full node content, metadata, confidence, and version.',
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string', description: 'UUID of the brain node to read' },
    },
    required: ['node_id'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10_000,
}

export const BRAIN_WRITE_MANIFEST: ToolManifest = {
  name: 'brain_write',
  type: 'code',
  description: 'Create a new node in the Brain, or update an existing one. Provide node_id to update. Embeddings are generated automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      node_id:    { type: 'string', description: 'UUID of existing node to update (omit to create)' },
      label:      { type: 'string', description: 'Short name or title of the node' },
      type:       { type: 'string', description: 'Node type: concept, fact, memory, procedure, insight, pattern, agent, code' },
      content:    { type: 'string', description: 'Full markdown content of the node' },
      confidence: { type: 'number', description: 'Confidence 0.0–1.0 (default 1.0)' },
      metadata:   { type: 'object', description: 'Arbitrary key-value metadata' },
    },
  },
  permissions: [],
  sandboxed: false,
  timeout: 15_000,
}

export const BRAIN_RELATE_MANIFEST: ToolManifest = {
  name: 'brain_relate',
  type: 'code',
  description: 'Create a typed, weighted edge between two brain nodes. Use to record discovered relationships.',
  inputSchema: {
    type: 'object',
    properties: {
      from_id:       { type: 'string', description: 'Source node UUID' },
      to_id:         { type: 'string', description: 'Target node UUID' },
      type:          { type: 'string', description: 'Edge type: references, implements, contradicts, supports, causes, derives_from, overrides' },
      weight:        { type: 'number', description: 'Relationship strength 0.0–∞ (default 1.0)' },
      bidirectional: { type: 'boolean', description: 'Whether the relationship goes both ways (default false)' },
    },
    required: ['from_id', 'to_id'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 10_000,
}

export const BRAIN_SEARCH_MANIFEST: ToolManifest = {
  name: 'brain_search',
  type: 'code',
  description: 'Semantic search across Brain nodes using vector similarity. Returns ranked results by relevance.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      limit: { type: 'number', description: 'Max results (default 20, max 50)' },
      type:  { type: 'string', description: 'Filter by node type (optional)' },
    },
    required: ['query'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 15_000,
}

export const BRAIN_TRAVERSE_MANIFEST: ToolManifest = {
  name: 'brain_traverse',
  type: 'code',
  description: 'Explore the Brain graph from a starting node, following edges up to N hops. Reveals connections agents may not have anticipated.',
  inputSchema: {
    type: 'object',
    properties: {
      node_id: { type: 'string', description: 'Starting node UUID' },
      depth:   { type: 'number', description: 'Max hops to traverse (default 2, max 5)' },
    },
    required: ['node_id'],
  },
  permissions: [],
  sandboxed: false,
  timeout: 15_000,
}

// ─── Built-in Handlers ────────────────────────────────────────────────────────

async function handleFileRead(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const path = input['path'] as string
  const safePath = enforceAnyWorkspacePath(path, context.workspacePath, context.additionalWorkspacePaths ?? [])
  const content = await readFile(safePath, 'utf-8')
  return { content, path: safePath }
}

async function handleFileWrite(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const path = input['path'] as string
  const content = input['content'] as string
  const safePath = enforceAnyWorkspacePath(path, context.workspacePath, context.additionalWorkspacePaths ?? [])
  await writeFile(safePath, content, 'utf-8')
  return { written: true, path: safePath, bytes: content.length }
}

async function handleFileList(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const path = (input['path'] as string | undefined) ?? '.'
  const safePath = enforceAnyWorkspacePath(path, context.workspacePath, context.additionalWorkspacePaths ?? [])
  const entries = await readdir(safePath, { withFileTypes: true })
  const result = await Promise.all(
    entries.map(async e => {
      const fullPath = join(safePath, e.name)
      let size: number | undefined
      if (e.isFile()) {
        const s = await stat(fullPath)
        size = s.size
      }
      return {
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        size,
      }
    })
  )
  return { path: safePath, entries: result }
}

async function handleHttpGet(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<unknown> {
  const url = input['url'] as string
  const headers = (input['headers'] ?? {}) as Record<string, string>
  const response = await fetch(url, { headers })
  const contentType = response.headers.get('content-type') ?? ''
  let body: unknown
  if (contentType.includes('application/json')) {
    body = await response.json()
  } else {
    body = await response.text()
  }
  return {
    status: response.status,
    ok: response.ok,
    contentType,
    body,
  }
}

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\b.*(-[rRf]|-rf|-fr)/,          // rm -rf etc
  /\brmdir\b/,
  /\bdd\b.*\bif=/,                       // dd — disk overwrite
  /\bmkfs\b/,                            // format filesystem
  /\bfdisk\b|\bparted\b/,               // partition tools
  /\bapt[- ](?:get\s+)?(?:install|remove|purge)\b/, // apt package management
  /\byum\s+(?:install|remove|erase)\b/, // yum package management
  /\bbrew\s+(?:install|uninstall|remove)\b/, // homebrew
  /\bpip\s+(?:install|uninstall)\b/,    // system pip (not in venv)
  /\bnpm\s+install\s+-g\b/,             // global npm install
  /\bkill\b.*-9\b/,                     // SIGKILL
  /\bpkill\b|\bkillall\b/,              // kill all processes
  /\bsystemctl\b/,                       // systemd control
  /\bservice\b.*(?:start|stop|restart)/, // service management
  /\bshutdown\b|\breboot\b|\bhalt\b/,  // system shutdown
  /\biptables\b|\bufw\b/,               // firewall rules
  /\bmount\b|\bumount\b/,               // mount points
  /\bcrontab\b.*-[re]/,                 // crontab edit/remove
  />\s*\/etc\/\w+/,                     // redirect to /etc
  />\s*\/usr\/\w+/,                     // redirect to /usr
  /\bsudo\b|\bsu\b\s/,                  // privilege escalation
]

function isCommandWithinWorkspace(command: string, workspacePaths: string[]): boolean {
  // Extract absolute paths referenced in the command
  const absPathPattern = /(?:^|\s|['"|=])(\/[^\s'"`;|&>\\]+)/g
  let match
  while ((match = absPathPattern.exec(command)) !== null) {
    const p = match[1]!
    const inWorkspace = workspacePaths.some(ws => p === ws || p.startsWith(ws + '/'))
    if (!inWorkspace) return false
  }
  return true
}

async function handleShellRun(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const command = input['command'] as string
  const allWorkspacePaths = [context.workspacePath, ...(context.additionalWorkspacePaths ?? [])]
  const withinWorkspace = isCommandWithinWorkspace(command, allWorkspacePaths)

  switch (context.shellPermissionLevel) {
    case 'none':
      return { error: 'Shell access is disabled for this agent (permission level: none).' }

    case 'per_command':
      // Every command requires explicit per-command approval
      return {
        approval_required: true,
        command,
        reason: 'per_command: every command requires explicit approval',
        message: 'This command requires your approval before it can run.',
      }

    case 'session_destructive': {
      if (!context.sessionGrantActive) {
        return { error: 'Shell access requires an active session grant (permission level: session_destructive).' }
      }
      // Destructive patterns always require approval regardless of workspace location
      const isChmodChownOutside = /\b(chmod|chown)\b/.test(command) && (() => {
        const m = command.match(/\b(?:chmod|chown)\b\s+\S+\s+(\S+)/)
        const target = m?.[1]
        if (!target) return true
        return !allWorkspacePaths.some(ws => target.startsWith(ws))
      })()
      const isDestructive = isChmodChownOutside || DESTRUCTIVE_COMMAND_PATTERNS.some(p => p.test(command))
      if (isDestructive) {
        return {
          approval_required: true,
          command,
          reason: 'session_destructive: destructive command requires approval',
          message: 'This is a destructive command and requires your approval.',
        }
      }
      break
    }

    case 'session_only':
      if (!context.sessionGrantActive) {
        return { error: 'Shell access requires an active session grant (permission level: session_only).' }
      }
      break

    case 'full':
      // No restrictions
      break
  }

  // Dynamically import execa to avoid startup cost
  const { execa } = await import('execa')
  const result = await execa('bash', ['-c', command], {
    cwd: context.workspacePath,
    timeout: 60_000,
    reject: false,
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    failed: result.failed,
  }
}

async function handleCodeRunPython(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const code = input['code'] as string
  const { execa } = await import('execa')
  // We execute it by passing the code via stdin to python3
  const result = await execa('python3', ['-c', code], {
    cwd: context.workspacePath,
    timeout: 60_000,
    reject: false,
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    failed: result.failed,
  }
}

async function handleCodeRunJs(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<unknown> {
  const code = input['code'] as string
  const { execa } = await import('execa')
  const result = await execa('node', ['-e', code], {
    cwd: context.workspacePath,
    timeout: 60_000,
    reject: false,
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    failed: result.failed,
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and return a ToolRegistry pre-loaded with all built-in tools.
 * Agent management tools are registered without handlers here — the
 * Orchestrator injects its own handlers when it initialises.
 */
// ─── Diagnostics ──────────────────────────────────────────────────────────────

export interface DiagnosticsReport {
  timestamp: string
  system: {
    nodeVersion: string
    platform: string
    processUptime: number
    memoryMb: { heapUsed: number; heapTotal: number; rss: number }
  }
  services: {
    orchestrator: { status: string; agentCount?: number; activeSessions?: number }
    modelRouter: { status: string; providers?: string[]; providerHealth?: Record<string, string> }
    vaultSync: { status: string; docCount?: number; errorCount?: number; lastSyncAt?: string | null }
    database: { status: string; error?: string }
    redis: { status: string; error?: string }
  }
  agents: Array<{ slug: string; name: string; status: string; profile: string }>
  pendingApprovals: number
  config: { profile: string; defaultModel: string; enabledProviders: string[] }
}

export type DiagnosticsProvider = () => Promise<DiagnosticsReport>

const SYSTEM_DIAGNOSE_MANIFEST: ToolManifest = {
  name: 'system_diagnose',
  type: 'http',
  description: [
    'Run a full system diagnostics check and return the health status of all Agency services.',
    'Reports service health, active agents, pending approvals, and configuration.',
    'Only available to the main orchestrator agent.',
  ].join(' '),
  inputSchema: { type: 'object', properties: {}, required: [] },
  permissions: [],
  sandboxed: false,
  timeout: 15_000,
}

// ─── Tool Registry Factory ────────────────────────────────────────────────────

export function createToolRegistry(queueClient?: QueueClient, options?: { memoryStore?: MemoryStore; messagingService?: MessagingService; invokeService?: InvokeService; discordService?: DiscordService; vaultStore?: VaultStore; brainStore?: BrainStore; diagnosticsProvider?: DiagnosticsProvider }): ToolRegistry {
  const registry = new ToolRegistry(queueClient)

  registry.register(FILE_READ_MANIFEST, handleFileRead)
  registry.register(FILE_WRITE_MANIFEST, handleFileWrite)
  registry.register(FILE_LIST_MANIFEST, handleFileList)
  registry.register(HTTP_GET_MANIFEST, handleHttpGet)
  registry.register(SHELL_RUN_MANIFEST, handleShellRun)
  registry.register(CODE_RUN_PYTHON_MANIFEST, handleCodeRunPython)
  registry.register(CODE_RUN_JS_MANIFEST, handleCodeRunJs)

  // Browser tool — routed to queue:browser via BullMQ
  registry.register(BROWSER_NAVIGATE_MANIFEST, async () => ({ error: 'Browser worker not available (no queue client)' }))

  // Management tools — handlers registered by Orchestrator
  registry.register(AGENT_LIST_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(AGENT_GET_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(AGENT_SET_PROFILE_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(PROFILE_LIST_MANIFEST, async () => ({ error: 'Not initialised' }))

  // Memory tool manifests
  if (options?.memoryStore) {
    const memHandlers = createMemoryHandlers(options.memoryStore)
    registry.register(MEMORY_WRITE_MANIFEST, memHandlers.memory_write.bind(memHandlers))
    registry.register(MEMORY_READ_MANIFEST, memHandlers.memory_read.bind(memHandlers))
  } else {
    registry.register(MEMORY_WRITE_MANIFEST, async () => ({ error: 'Memory store not configured' }))
    registry.register(MEMORY_READ_MANIFEST, async () => ({ error: 'Memory store not configured' }))
  }

  // Messaging tools
  if (options?.messagingService) {
    const msgHandlers = createMessagingHandlers(options.messagingService, options.invokeService)
    registry.register(AGENT_MESSAGE_SEND_MANIFEST, msgHandlers.agent_message_send.bind(msgHandlers))
    registry.register(AGENT_MESSAGE_CHECK_MANIFEST, msgHandlers.agent_message_check.bind(msgHandlers))
    registry.register(AGENT_MESSAGE_LIST_MANIFEST, msgHandlers.agent_message_list.bind(msgHandlers))
  } else {
    registry.register(AGENT_MESSAGE_SEND_MANIFEST, async () => ({ error: 'Messaging not configured' }))
    registry.register(AGENT_MESSAGE_CHECK_MANIFEST, async () => ({ error: 'Messaging not configured' }))
    registry.register(AGENT_MESSAGE_LIST_MANIFEST, async () => ({ error: 'Messaging not configured' }))
  }

  // Discord tools
  if (options?.discordService) {
    const discordHandlers = createDiscordHandlers(options.discordService)
    registry.register(DISCORD_POST_MANIFEST, discordHandlers.discord_post.bind(discordHandlers))
    registry.register(DISCORD_LIST_CHANNELS_MANIFEST, discordHandlers.discord_list_channels.bind(discordHandlers))
  } else {
    registry.register(DISCORD_POST_MANIFEST, async () => ({ error: 'Discord not configured' }))
    registry.register(DISCORD_LIST_CHANNELS_MANIFEST, async () => ({ error: 'Discord not configured' }))
  }

  // agent_invoke: registered independently — only needs invokeService, not Redis/messagingService
  if (options?.invokeService) {
    const invokeHandlers = createMessagingHandlers(
      options.messagingService ?? ({} as MessagingService),
      options.invokeService
    )
    registry.register(AGENT_INVOKE_MANIFEST, invokeHandlers.agent_invoke.bind(invokeHandlers))
  } else {
    registry.register(AGENT_INVOKE_MANIFEST, async () => ({ error: 'agent_invoke not configured' }))
  }

  registry.register(AGENT_CREATE_MANIFEST, async () => ({ error: 'Not implemented' }))
  registry.register(AGENT_DELETE_MANIFEST, async () => ({ error: 'Not implemented' }))

  // Group management tools — handlers registered by Orchestrator
  registry.register(GROUP_CREATE_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(GROUP_UPDATE_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(GROUP_DELETE_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(GROUP_MEMBER_ADD_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(GROUP_MEMBER_REMOVE_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(GROUP_LIST_MANIFEST, async () => ({ error: 'Not initialised' }))
  registry.register(GROUP_GET_MANIFEST, async () => ({ error: 'Not initialised' }))

  // Vault tools
  if (options?.vaultStore) {
    const vaultHandlers = createVaultHandlers(options.vaultStore)
    registry.register(VAULT_SEARCH_MANIFEST, vaultHandlers.vault_search.bind(vaultHandlers))
    registry.register(VAULT_RELATED_MANIFEST, vaultHandlers.vault_related.bind(vaultHandlers))
    registry.register(VAULT_PROPOSE_MANIFEST, vaultHandlers.vault_propose.bind(vaultHandlers))
  } else {
    registry.register(VAULT_SEARCH_MANIFEST, async () => ({ error: 'Vault not configured' }))
    registry.register(VAULT_RELATED_MANIFEST, async () => ({ error: 'Vault not configured' }))
    registry.register(VAULT_PROPOSE_MANIFEST, async () => ({ error: 'Vault not configured' }))
  }

  // Brain tools
  if (options?.brainStore) {
    const brainHandlers = createBrainHandlers(options.brainStore)
    registry.register(BRAIN_READ_MANIFEST, (input, ctx) => brainHandlers.brain_read(input, ctx))
    registry.register(BRAIN_WRITE_MANIFEST, (input, ctx) => brainHandlers.brain_write(input, ctx))
    registry.register(BRAIN_RELATE_MANIFEST, (input, ctx) => brainHandlers.brain_relate(input, ctx))
    registry.register(BRAIN_SEARCH_MANIFEST, (input, ctx) => brainHandlers.brain_search(input, ctx))
    registry.register(BRAIN_TRAVERSE_MANIFEST, (input, ctx) => brainHandlers.brain_traverse(input, ctx))
  } else {
    registry.register(BRAIN_READ_MANIFEST, async () => ({ error: 'Brain not configured' }))
    registry.register(BRAIN_WRITE_MANIFEST, async () => ({ error: 'Brain not configured' }))
    registry.register(BRAIN_RELATE_MANIFEST, async () => ({ error: 'Brain not configured' }))
    registry.register(BRAIN_SEARCH_MANIFEST, async () => ({ error: 'Brain not configured' }))
    registry.register(BRAIN_TRAVERSE_MANIFEST, async () => ({ error: 'Brain not configured' }))
  }

  // System diagnostics — main agent only
  if (options?.diagnosticsProvider) {
    const provider = options.diagnosticsProvider
    registry.register(SYSTEM_DIAGNOSE_MANIFEST, async (_input, context) => {
      if (!BUILT_IN_AGENTS.includes(context.agentId as BuiltInAgentSlug)) {
        return { error: 'system_diagnose is only available to built-in agents.' }
      }
      return provider()
    })
  } else {
    registry.register(SYSTEM_DIAGNOSE_MANIFEST, async (_input, context) => {
      if (!BUILT_IN_AGENTS.includes(context.agentId as BuiltInAgentSlug)) {
        return { error: 'system_diagnose is only available to built-in agents.' }
      }
      return { error: 'Diagnostics provider not configured.' }
    })
  }

  // ── Sleep tool ────────────────────────────────────────────────────────────
  registry.register({
    name: 'sleep',
    type: 'code',
    description: 'Pause execution for a specified number of seconds. Use this in autonomous mode to control how often you wake up. Calling Sleep instead of outputting text when idle prevents wasting API turns.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Number of seconds to sleep. Min 5, max 300 (5 minutes). Stay under 300 to keep the prompt cache warm.',
          minimum: 5,
          maximum: 300,
        },
      },
      required: ['seconds'],
    },
    permissions: [],
    sandboxed: false,
    timeout: 310_000,
  }, async (input: Record<string, unknown>) => {
    const seconds = input['seconds'] as number
    const clamped = Math.max(5, Math.min(300, seconds))
    await new Promise(resolve => setTimeout(resolve, clamped * 1000))
    return { slept: clamped }
  })

  return registry
}

export const ToolHandlers: Record<string, ToolHandler> = {
  file_read: handleFileRead,
  file_write: handleFileWrite,
  file_list: handleFileList,
  http_get: handleHttpGet,
  shell_run: handleShellRun,
  code_run_python: handleCodeRunPython,
  code_run_javascript: handleCodeRunJs,
}

export type { ToolManifest, ToolContext, ToolDispatchResult, ToolType }
export type { VaultStore, VaultDb } from './tools/vault-handlers.js'
export type { BrainStore } from './tools/brain-handlers.js'
export type { DiscordService } from './tools/discord-handlers.js'
export type { InvokeService } from './tools/messaging-handlers.js'
