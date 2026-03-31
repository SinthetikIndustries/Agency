// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { PORTS } from './ports.js'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { AgencyConfig, AgencyCredentials } from '@agency/shared-types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GatewayConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('127.0.0.1'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  auth: z.object({
    jwtSecret: z.string().min(32),
    jwtExpiryHours: z.number().int().positive().default(24),
  }),
  rateLimit: z.object({
    max: z.number().int().positive().default(100),
    timeWindow: z.string().default('1 minute'),
  }).default({ max: 100, timeWindow: '1 minute' }),
})

const ModelRouterConfigSchema = z.object({
  defaultModel: z.string().default('claude-sonnet-4-5'),
  tiers: z.object({
    cheap: z.string().default('claude-haiku-4-5'),
    strong: z.string().default('claude-opus-4-5'),
  }).default({}),
  providers: z.object({
    anthropic: z.object({ enabled: z.boolean().default(true) }).default({}),
    openai: z.object({ enabled: z.boolean().default(false) }).default({}),
    ollama: z.object({
      enabled: z.boolean().default(false),
      endpoint: z.string().default(`http://localhost:${PORTS.OLLAMA}`),
    }).default({}),
    openrouter: z.object({
      enabled: z.boolean().default(false),
    }).default({}),
  }).default({}),
  fallback: z.object({
    cheap: z.string().nullable().default(null),
    strong: z.string().nullable().default('claude-sonnet-4-5'),
  }).default({}),
  embedding: z.object({
    provider: z.string().default('openai'),
    model: z.string().default('text-embedding-3-small'),
  }).default({}),
})

const AgencyConfigSchema = z.object({
  gateway: GatewayConfigSchema,
  profile: z.enum(['basic', 'standard', 'advanced', 'development']).default('basic'),
  modelRouter: ModelRouterConfigSchema.default({}),
  daemons: z.object({
    orchestrator: z.object({ enabled: z.boolean().default(true) }).default({}),
    modelRouter: z.object({ enabled: z.boolean().default(true) }).default({}),
    vaultSync: z.object({
      enabled: z.boolean().default(true),
      vaultPath: z.string().optional(),
    }).default({}),
  }).default({}),
  orchestrator: z.object({
    defaultAgent: z.string().default('main'),
    maxWorkflowSteps: z.number().int().positive().default(20),
    approvalTimeoutSeconds: z.number().int().positive().default(300),
  }).default({}),
  redis: z.object({
    url: z.string().default(`redis://localhost:${PORTS.REDIS}`),
  }).default({}),
}).passthrough()

const AgencyCredentialsSchema = z.object({
  anthropic: z.object({ apiKey: z.string() }).optional(),
  openai: z.object({ apiKey: z.string() }).optional(),
  openrouter: z.object({ apiKey: z.string() }).optional(),
  postgres: z.object({ url: z.string() }).optional(),
  redis: z.object({ url: z.string() }).optional(),
  gateway: z.object({ apiKey: z.string(), jwtSecret: z.string().optional() }).optional(),
  discord: z.object({
    agents: z.record(z.string()).optional(),
  }).optional(),
}).passthrough()

// ─── Env var override ─────────────────────────────────────────────────────────

function applyEnvOverrides(raw: Record<string, unknown>): Record<string, unknown> {
  const overrides: Record<string, string | undefined> = {
    'gateway.port': process.env['AGENCY_GATEWAY_PORT'],
    'gateway.host': process.env['AGENCY_GATEWAY_HOST'],
    'gateway.logLevel': process.env['AGENCY_GATEWAY_LOG_LEVEL'],
    'modelRouter.defaultModel': process.env['AGENCY_MODEL_DEFAULT'],
    'redis.url': process.env['AGENCY_REDIS_URL'] ?? process.env['REDIS_URL'],
  }

  const result = structuredClone(raw) as Record<string, unknown>

  for (const [path, value] of Object.entries(overrides)) {
    if (value === undefined) continue
    const parts = path.split('.')
    let target = result
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!
      if (typeof target[part] !== 'object' || target[part] === null) {
        target[part] = {}
      }
      target = target[part] as Record<string, unknown>
    }
    const lastPart = parts[parts.length - 1]!
    // Parse numbers where needed
    target[lastPart] = isNaN(Number(value)) ? value : Number(value)
  }

  return result
}

// ─── Loader ───────────────────────────────────────────────────────────────────

const agencyDir = join(homedir(), '.agency')

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw new Error(`Failed to read ${path}: ${String(err)}`)
  }
}

export async function loadConfig(): Promise<AgencyConfig> {
  const raw = await readJsonFile(join(agencyDir, 'config.json'))
  const withEnv = applyEnvOverrides(raw)
  const result = AgencyConfigSchema.safeParse(withEnv)
  if (!result.success) {
    throw new Error(
      `Invalid config.json:\n${result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`
    )
  }
  return result.data as AgencyConfig
}

export async function loadCredentials(): Promise<AgencyCredentials> {
  // Also check AGENCY_ANTHROPIC_API_KEY etc.
  const raw = await readJsonFile(join(agencyDir, 'credentials.json'))

  // Env var overrides for credentials
  if (process.env['AGENCY_ANTHROPIC_API_KEY']) {
    (raw as Record<string, unknown>)['anthropic'] = { apiKey: process.env['AGENCY_ANTHROPIC_API_KEY'] }
  }
  if (process.env['AGENCY_OPENAI_API_KEY']) {
    (raw as Record<string, unknown>)['openai'] = { apiKey: process.env['AGENCY_OPENAI_API_KEY'] }
  }
  if (process.env['AGENCY_POSTGRES_URL']) {
    (raw as Record<string, unknown>)['postgres'] = { url: process.env['AGENCY_POSTGRES_URL'] }
  }
  if (process.env['AGENCY_REDIS_URL']) {
    (raw as Record<string, unknown>)['redis'] = { url: process.env['AGENCY_REDIS_URL'] }
  }

  const result = AgencyCredentialsSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Invalid credentials.json:\n${result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`
    )
  }
  return result.data as AgencyCredentials
}

export { agencyDir }
export type { AgencyConfig, AgencyCredentials }
export { PORTS } from './ports.js'
