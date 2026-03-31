// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PORTS } from '@agency/config'
import type {
  ModelAdapter,
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  ContentBlock,
  ModelRouterConfig,
  AgencyCredentials,
  CompletionMessage,
  ToolDefinition,
} from '@agency/shared-types'

// ─── Anthropic Adapter ────────────────────────────────────────────────────────

export class AnthropicAdapter implements ModelAdapter {
  readonly id = 'anthropic'
  readonly name = 'Anthropic'
  readonly models = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5']

  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 8192,
      messages: request.messages as Anthropic.MessageParam[],
    }
    if (request.temperature !== undefined) params.temperature = request.temperature
    if (request.system) params.system = request.system
    if (request.tools && request.tools.length > 0) params.tools = request.tools as unknown as Anthropic.Tool[]

    const response = await this.client.messages.create(params)

    return {
      id: response.id,
      model: response.model,
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason as CompletionResponse['stopReason'],
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<CompletionChunk> {
    const params: Anthropic.MessageCreateParamsStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 8192,
      messages: request.messages as Anthropic.MessageParam[],
      stream: true,
    }
    if (request.temperature !== undefined) params.temperature = request.temperature
    if (request.system) params.system = request.system
    if (request.tools && request.tools.length > 0) params.tools = request.tools as unknown as Anthropic.Tool[]

    const stream = await this.client.messages.stream(params)

    let inputTokens = 0
    let outputTokens = 0

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta
        if (delta.type === 'text_delta') {
          yield { type: 'text_delta', text: delta.text }
        } else if (delta.type === 'input_json_delta') {
          yield { type: 'tool_use_delta', inputDelta: delta.partial_json }
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          yield {
            type: 'tool_use_start',
            toolCallId: event.content_block.id,
            toolName: event.content_block.name,
          }
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'tool_use_stop' }
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens
      } else if (event.type === 'message_stop') {
        yield { type: 'usage', inputTokens, outputTokens }
        yield { type: 'message_stop' }
      }
    }
  }
}

// ─── OpenAI Adapter ───────────────────────────────────────────────────────────

export class OpenAIAdapter implements ModelAdapter {
  readonly id = 'openai'
  readonly name = 'OpenAI'
  readonly models = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']

  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list()
      return true
    } catch {
      return false
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (request.system) {
      messages.push({ role: 'system', content: request.system })
    }
    for (const msg of request.messages) {
      messages.push(toOpenAIMessage(msg))
    }

    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages,
      stream: false,
    }
    if (request.maxTokens !== undefined) params.max_tokens = request.maxTokens
    if (request.temperature !== undefined) params.temperature = request.temperature
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
    }

    const response = await this.client.chat.completions.create(params)
    const choice = response.choices[0]!
    const msg = choice.message

    const content: ContentBlock[] = []
    if (msg.content) content.push({ type: 'text', text: msg.content })
    for (const tc of msg.tool_calls ?? []) {
      if (tc.type !== 'function') continue
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
      })
    }

    const stopReason: CompletionResponse['stopReason'] =
      choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn'

    return {
      id: response.id,
      model: response.model,
      content,
      stopReason,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<CompletionChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (request.system) {
      messages.push({ role: 'system', content: request.system })
    }
    for (const msg of request.messages) {
      messages.push(toOpenAIMessage(msg))
    }

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (request.maxTokens !== undefined) params.max_tokens = request.maxTokens
    if (request.temperature !== undefined) params.temperature = request.temperature
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
    }

    const stream = await this.client.chat.completions.create(params)
    const openToolCalls = new Map<number, string>()  // index → id
    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      // Usage chunk arrives after finish_reason chunk — capture it
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }

      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      if (delta.content) {
        yield { type: 'text_delta', text: delta.content }
      }

      for (const tc of delta.tool_calls ?? []) {
        if (tc.id && !openToolCalls.has(tc.index)) {
          openToolCalls.set(tc.index, tc.id)
          yield { type: 'tool_use_start', toolCallId: tc.id, toolName: tc.function?.name ?? '' }
        }
        if (tc.function?.arguments) {
          yield { type: 'tool_use_delta', inputDelta: tc.function.arguments }
        }
      }
    }

    // Emit tool stops, then usage, then message stop after stream completes
    for (const _id of openToolCalls.values()) yield { type: 'tool_use_stop' }
    yield { type: 'usage', inputTokens, outputTokens }
    yield { type: 'message_stop' }
  }
}

/** Convert an Agency CompletionMessage to an OpenAI message param */
function toOpenAIMessage(msg: CompletionMessage): OpenAI.ChatCompletionMessageParam {
  if (typeof msg.content === 'string') {
    return { role: msg.role as 'user' | 'assistant', content: msg.content }
  }

  const blocks = msg.content as ContentBlock[]
  const textParts: string[] = []
  const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = []
  const toolResults: Array<{ id: string; content: string }> = []

  for (const block of blocks) {
    if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      })
    } else if (block.type === 'tool_result') {
      toolResults.push({ id: block.tool_use_id, content: block.content })
    }
  }

  // Tool results become separate tool-role messages; caller handles ordering
  if (toolResults.length > 0) {
    // Return the first tool result — multi-tool-result turns are flattened by the orchestrator
    return { role: 'tool', tool_call_id: toolResults[0]!.id, content: toolResults[0]!.content }
  }

  if (toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: textParts.join('') || null,
      tool_calls: toolCalls,
    }
  }

  return { role: msg.role as 'user' | 'assistant', content: textParts.join('') }
}

// ─── Ollama Adapter ───────────────────────────────────────────────────────────

// OpenAI-compatible message shapes used by Ollama's /v1/chat/completions
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

interface OllamaTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

interface OllamaChatResponse {
  id: string
  model: string
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: OllamaMessage['tool_calls'] }
    finish_reason: string
  }>
  usage: { prompt_tokens: number; completion_tokens: number }
}

interface OllamaStreamChunk {
  id: string
  choices: Array<{
    delta: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }
    finish_reason: string | null
  }>
  usage?: { prompt_tokens: number; completion_tokens: number }
}

/** Convert Agency CompletionMessage array to Ollama's OpenAI-compatible format */
function toOllamaMessages(messages: CompletionMessage[], system?: string): OllamaMessage[] {
  const result: OllamaMessage[] = []

  if (system) {
    result.push({ role: 'system', content: system })
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role as OllamaMessage['role'], content: msg.content })
      continue
    }

    // Content is an array of blocks — handle Anthropic-style blocks
    const blocks = msg.content as ContentBlock[]
    let textParts: string[] = []
    const toolCalls: NonNullable<OllamaMessage['tool_calls']> = []

    for (const block of blocks) {
      if (block.type === 'text') {
        textParts.push(block.text)
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        })
      } else if (block.type === 'tool_result') {
        // Tool result blocks become role: 'tool' messages
        result.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content })
        continue
      }
    }

    if (toolCalls.length > 0) {
      result.push({ role: 'assistant', content: textParts.join('') || null, tool_calls: toolCalls })
    } else {
      result.push({ role: msg.role as OllamaMessage['role'], content: textParts.join('') })
    }
  }

  return result
}

/** Convert Agency ToolDefinition array to Ollama's OpenAI-compatible format */
function toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    },
  }))
}

export class OllamaAdapter implements ModelAdapter {
  readonly id = 'ollama'
  readonly name = 'Ollama'
  readonly models: string[] = []  // populated dynamically from /api/tags

  private endpoint: string

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '')
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/version`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json() as { models?: Array<{ name: string }> }
      return data.models?.map(m => m.name) ?? []
    } catch {
      return []
    }
  }

  async *pullModel(modelName: string): AsyncGenerator<string> {
    const res = await fetch(`${this.endpoint}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama pull failed (${res.status}): ${text}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) yield line.trim()
      }
    }
    if (buf.trim()) yield buf.trim()
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOllamaMessages(request.messages, request.system),
      stream: false,
    }
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens
    if (request.temperature !== undefined) body['temperature'] = request.temperature
    if (request.tools && request.tools.length > 0) body['tools'] = toOllamaTools(request.tools)

    const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama request failed (${res.status}): ${text}`)
    }

    const data = await res.json() as OllamaChatResponse
    const choice = data.choices[0]!
    const msg = choice.message

    const content: ContentBlock[] = []
    if (msg.content) {
      content.push({ type: 'text', text: msg.content })
    }
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
        })
      }
    }

    const stopReason: CompletionResponse['stopReason'] =
      choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn'

    return {
      id: data.id,
      model: data.model,
      content,
      stopReason,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<CompletionChunk> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOllamaMessages(request.messages, request.system),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens
    if (request.temperature !== undefined) body['temperature'] = request.temperature
    if (request.tools && request.tools.length > 0) body['tools'] = toOllamaTools(request.tools)

    const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '(no body)')
      throw new Error(`Ollama stream failed (${res.status}): ${text}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const openToolCalls = new Map<number, string>()  // index → toolCallId
    let inputTokens = 0
    let outputTokens = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') {
          for (const _id of openToolCalls.values()) yield { type: 'tool_use_stop' }
          yield { type: 'usage', inputTokens, outputTokens }
          yield { type: 'message_stop' }
          return
        }
        let chunk: OllamaStreamChunk
        try {
          chunk = JSON.parse(raw) as OllamaStreamChunk
        } catch {
          continue
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens
          outputTokens = chunk.usage.completion_tokens
        }

        const delta = chunk.choices[0]?.delta
        if (!delta) continue

        if (delta.content) {
          yield { type: 'text_delta', text: delta.content }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id && !openToolCalls.has(tc.index)) {
              openToolCalls.set(tc.index, tc.id)
              yield { type: 'tool_use_start', toolCallId: tc.id, toolName: tc.function?.name ?? '' }
            }
            if (tc.function?.arguments) {
              yield { type: 'tool_use_delta', inputDelta: tc.function.arguments }
            }
          }
        }
      }
    }

    for (const _id of openToolCalls.values()) yield { type: 'tool_use_stop' }
    yield { type: 'usage', inputTokens, outputTokens }
    yield { type: 'message_stop' }
  }
}

// ─── OpenRouter Adapter ───────────────────────────────────────────────────────

/**
 * Curated list of popular OpenRouter models, ordered by category and capability.
 * Shown as datalist suggestions; users can still type any valid model ID.
 */
const OPENROUTER_FEATURED_MODELS = [
  // Anthropic
  'anthropic/claude-opus-4',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-haiku-4-5',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  // OpenAI
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/o3-mini',
  'openai/o1',
  // Google
  'google/gemini-2.0-flash-001',
  'google/gemini-2.5-pro-preview',
  'google/gemini-1.5-pro',
  // Meta / Llama
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-405b-instruct',
  // DeepSeek
  'deepseek/deepseek-r1',
  'deepseek/deepseek-chat-v3-0324',
  // Mistral
  'mistralai/mistral-large-2411',
  // Qwen / xAI
  'qwen/qwen-2.5-72b-instruct',
  'x-ai/grok-3-mini-beta',
]

export class OpenRouterAdapter implements ModelAdapter {
  readonly id = 'openrouter'
  readonly name = 'OpenRouter'
  readonly models: string[] = []  // populated dynamically

  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://agency.ai',
        'X-Title': 'Agency',
      },
    })
  }

  async isAvailable(): Promise<boolean> {
    try {
      const models = await this.listModels()
      return models.length > 0
    } catch {
      return false
    }
  }

  /**
   * Returns featured models only — a curated ~20-item list suitable for datalist
   * suggestions. The full OpenRouter catalogue has 200+ entries which would be
   * unusable in a dropdown. Users can still type any valid model ID.
   */
  async listModels(): Promise<string[]> {
    try {
      // Verify the API key is valid by hitting the models endpoint, then return
      // only the featured subset that are actually available in this account.
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${(this.client as unknown as { apiKey: string }).apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return OPENROUTER_FEATURED_MODELS
      const data = await res.json() as { data?: Array<{ id: string }> }
      const available = new Set(data.data?.map(m => m.id) ?? [])
      // Return featured models that exist in the live catalogue, preserving order.
      // Fall back to the full featured list if the API returns nothing useful.
      const filtered = OPENROUTER_FEATURED_MODELS.filter(m => available.has(m))
      return filtered.length > 0 ? filtered : OPENROUTER_FEATURED_MODELS
    } catch {
      // Offline / key invalid — still surface the featured list so UI isn't empty
      return OPENROUTER_FEATURED_MODELS
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (request.system) messages.push({ role: 'system', content: request.system })
    for (const msg of request.messages) messages.push(toOpenAIMessage(msg))

    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: request.model,
      messages,
      stream: false,
    }
    if (request.maxTokens !== undefined) params.max_tokens = request.maxTokens
    if (request.temperature !== undefined) params.temperature = request.temperature
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
    }

    const response = await this.client.chat.completions.create(params)
    const choice = response.choices[0]!
    const msg = choice.message

    const content: ContentBlock[] = []
    if (msg.content) content.push({ type: 'text', text: msg.content })
    for (const tc of msg.tool_calls ?? []) {
      if (tc.type !== 'function') continue
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
      })
    }

    const stopReason: CompletionResponse['stopReason'] =
      choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn'

    return {
      id: response.id,
      model: response.model,
      content,
      stopReason,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<CompletionChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (request.system) messages.push({ role: 'system', content: request.system })
    for (const msg of request.messages) messages.push(toOpenAIMessage(msg))

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (request.maxTokens !== undefined) params.max_tokens = request.maxTokens
    if (request.temperature !== undefined) params.temperature = request.temperature
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
    }

    const stream = await this.client.chat.completions.create(params)
    const openToolCalls = new Map<number, string>()
    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }

      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      if (delta.content) yield { type: 'text_delta', text: delta.content }

      for (const tc of delta.tool_calls ?? []) {
        if (tc.id && !openToolCalls.has(tc.index)) {
          openToolCalls.set(tc.index, tc.id)
          yield { type: 'tool_use_start', toolCallId: tc.id, toolName: tc.function?.name ?? '' }
        }
        if (tc.function?.arguments) {
          yield { type: 'tool_use_delta', inputDelta: tc.function.arguments }
        }
      }
    }

    for (const _id of openToolCalls.values()) yield { type: 'tool_use_stop' }
    yield { type: 'usage', inputTokens, outputTokens }
    yield { type: 'message_stop' }
  }
}

// ─── Model Router ─────────────────────────────────────────────────────────────

export class ModelRouter {
  private adapters = new Map<string, ModelAdapter>()
  private config: ModelRouterConfig

  constructor(config: ModelRouterConfig, credentials: AgencyCredentials) {
    this.config = config

    if (config.providers.anthropic.enabled && credentials.anthropic?.apiKey) {
      this.adapters.set('anthropic', new AnthropicAdapter(credentials.anthropic.apiKey))
    }

    if (config.providers.openai.enabled && credentials.openai?.apiKey) {
      this.adapters.set('openai', new OpenAIAdapter(credentials.openai.apiKey))
    }

    if (config.providers.ollama.enabled) {
      const endpoint = config.providers.ollama.endpoint ?? `http://localhost:${PORTS.OLLAMA}`
      this.adapters.set('ollama', new OllamaAdapter(endpoint))
    }

    if (config.providers.openrouter.enabled && credentials.openrouter?.apiKey) {
      this.adapters.set('openrouter', new OpenRouterAdapter(credentials.openrouter.apiKey))
    }
  }

  /** Resolve a model name → adapter */
  private resolveAdapter(model: string): ModelAdapter {
    // Anthropic: any Claude model
    const anthropicAdapter = this.adapters.get('anthropic')
    if (anthropicAdapter) {
      if (['claude-opus', 'claude-sonnet', 'claude-haiku'].some(p => model.includes(p))) {
        return anthropicAdapter
      }
    }

    // OpenAI: gpt-* and o1/o3/o4 models
    const openaiAdapter = this.adapters.get('openai')
    if (openaiAdapter) {
      if (['gpt-', 'o1-', 'o3-', 'o4-'].some(p => model.startsWith(p)) || model === 'o1' || model === 'o3') {
        return openaiAdapter
      }
    }

    // OpenRouter: model IDs contain a slash (e.g. "anthropic/claude-3-5-sonnet")
    if (model.includes('/')) {
      const openrouterAdapter = this.adapters.get('openrouter')
      if (openrouterAdapter) return openrouterAdapter
    }

    // Ollama: anything not recognized as a cloud model
    const ollamaAdapter = this.adapters.get('ollama')
    if (ollamaAdapter) {
      return ollamaAdapter
    }

    // Default: first available adapter
    const first = this.adapters.values().next().value as ModelAdapter | undefined
    if (!first) {
      throw new Error(
        'No model adapters are configured. Set credentials.anthropic.apiKey or enable ollama in config.'
      )
    }
    return first
  }

  /** Resolve a tier name to model string */
  resolveModel(tierOrModel: string): string {
    if (tierOrModel === 'cheap') return this.config.tiers.cheap
    if (tierOrModel === 'strong') return this.config.tiers.strong
    return tierOrModel  // already a specific model name
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const adapter = this.resolveAdapter(request.model)
    try {
      return await adapter.complete(request)
    } catch (err) {
      // Attempt fallback if configured
      const isCheap = request.model === this.config.tiers.cheap
      const fallback = isCheap ? this.config.fallback.cheap : this.config.fallback.strong
      if (fallback && fallback !== request.model) {
        console.warn(`[ModelRouter] Primary model failed (${request.model}), falling back to ${fallback}:`, err)
        const fallbackAdapter = this.resolveAdapter(fallback)
        return fallbackAdapter.complete({ ...request, model: fallback })
      }
      throw err
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<CompletionChunk> {
    const adapter = this.resolveAdapter(request.model)
    yield* adapter.stream(request)
  }

  get defaultModel(): string {
    return this.config.defaultModel
  }

  /** List all available models across all configured providers */
  async listAllModels(): Promise<Array<{ name: string; provider: string; tier?: string }>> {
    const result: Array<{ name: string; provider: string; tier?: string }> = []
    for (const [providerId, adapter] of this.adapters) {
      let modelNames: string[]
      if (providerId === 'ollama') {
        modelNames = await (adapter as OllamaAdapter).listModels()
      } else if (providerId === 'openrouter') {
        modelNames = await (adapter as OpenRouterAdapter).listModels()
      } else {
        modelNames = [...adapter.models]
      }
      for (const name of modelNames) {
        const tier = name === this.config.tiers.cheap ? 'cheap'
          : name === this.config.tiers.strong ? 'strong'
          : undefined
        result.push({ name, provider: providerId, ...(tier ? { tier } : {}) })
      }
    }
    return result
  }

  /** Resolve which provider a given model name belongs to */
  resolveProvider(model: string): string {
    if (model.includes('/')) return 'openrouter'
    if (['claude-opus', 'claude-sonnet', 'claude-haiku'].some(p => model.includes(p))) return 'anthropic'
    if (['gpt-', 'o1-', 'o3-', 'o4-'].some(p => model.startsWith(p)) || model === 'o1' || model === 'o3') return 'openai'
    return 'ollama'
  }

  /** Pull a model via Ollama — returns async generator of raw JSON status lines */
  async *pullOllamaModel(modelName: string): AsyncGenerator<string> {
    const adapter = this.adapters.get('ollama') as OllamaAdapter | undefined
    if (!adapter) throw new Error('Ollama is not configured or not enabled')
    yield* adapter.pullModel(modelName)
  }

  get ollamaEnabled(): boolean {
    return this.adapters.has('ollama')
  }

  async healthCheck(): Promise<Record<string, 'ok' | 'error' | 'disabled'>> {
    const result: Record<string, 'ok' | 'error' | 'disabled'> = {}
    for (const [name, adapter] of this.adapters) {
      try {
        const ok = await adapter.isAvailable()
        result[name] = ok ? 'ok' : 'error'
      } catch {
        result[name] = 'error'
      }
    }
    if (!this.config.providers.anthropic.enabled) result['anthropic'] = 'disabled'
    if (!this.config.providers.openai.enabled) result['openai'] = 'disabled'
    if (!this.config.providers.ollama.enabled) result['ollama'] = 'disabled'
    if (!this.config.providers.openrouter.enabled) result['openrouter'] = 'disabled'
    return result
  }
}
