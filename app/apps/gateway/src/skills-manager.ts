// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { mkdir, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { PostgresClient } from '@agency/orchestrator/db'
import { z } from 'zod'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SkillManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (e.g. 1.0.0)'),
  description: z.string().default(''),
  requiredTools: z.array(z.string()).default([]),
  agents: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  prompts: z.array(z.string()).default([]),
  workflows: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  type: z.enum(['composite', 'prompt', 'tool']).default('prompt'),
  anthropicBuiltinType: z.string().nullable().default(null),
  anthropicBetaHeader: z.string().nullable().default(null),
})

export type SkillManifest = z.infer<typeof SkillManifestSchema>

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillStatus = 'installed' | 'disabled' | 'error' | 'pending_restart'

export interface InstalledSkill {
  id: string
  name: string
  version: string
  status: SkillStatus
  type: string
  anthropicBuiltinType: string | null
  anthropicBetaHeader: string | null
  manifest: SkillManifest
  installedAt: Date
  updatedAt: Date
}

export interface AgentSkill {
  id: string
  name: string
  version: string
  type: 'tool' | 'prompt'
  anthropicBuiltinType: string | null
  anthropicBetaHeader: string | null
  manifest: { tools: string[]; prompts: string[]; requiredTools: string[] }
  installedAt: Date
  config: Record<string, unknown>
}

interface DbSkillRow {
  id: string
  name: string
  version: string
  status: string
  type?: string
  anthropic_builtin_type?: string | null
  anthropic_beta_header?: string | null
  manifest: unknown
  installed_at: string
  updated_at: string
}

// ─── SkillsManager ────────────────────────────────────────────────────────────

export class SkillsManager {
  private db: PostgresClient
  private skillsDir: string
  private installed: Map<string, InstalledSkill> = new Map()

  private bundledSkillsDir: string

  constructor(
    db: PostgresClient,
    skillsDirOrOptions: string | {
      skillsDir?: string
      bundledSkillsDir?: string
    } = {}
  ) {
    this.db = db
    const options = typeof skillsDirOrOptions === 'string'
      ? { skillsDir: skillsDirOrOptions }
      : skillsDirOrOptions
    this.skillsDir = options.skillsDir ?? join(homedir(), '.agency', 'skills')
    this.bundledSkillsDir = options.bundledSkillsDir ?? join(process.cwd(), 'services', 'skills')
  }

  // ─── Initialization ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await mkdir(this.skillsDir, { recursive: true })
    await this.loadFromDb()
    console.log(`[SkillsManager] Loaded ${this.installed.size} skill(s) from database`)
  }

  private async loadFromDb(): Promise<void> {
    const rows = await this.db.query<DbSkillRow>(
      "SELECT * FROM skills WHERE status != 'pending_restart' ORDER BY installed_at ASC",
      []
    )
    this.installed.clear()
    for (const row of rows) {
      const skill = rowToSkill(row)
      this.installed.set(skill.name, skill)
    }
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  list(): InstalledSkill[] {
    return Array.from(this.installed.values())
  }

  get(name: string): InstalledSkill | undefined {
    return this.installed.get(name)
  }

  // ─── Local library (bundled skills directory) ─────────────────────────────

  async listLocalLibrary(): Promise<Array<{ name: string; version: string; description: string; installed: boolean }>> {
    if (!existsSync(this.bundledSkillsDir)) return []

    let entries: import('node:fs').Dirent<string>[]
    try {
      entries = await readdir(this.bundledSkillsDir, { withFileTypes: true }) as import('node:fs').Dirent<string>[]
    } catch {
      return []
    }

    const result: Array<{ name: string; version: string; description: string; installed: boolean }> = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(this.bundledSkillsDir, entry.name, 'skill.json')
      if (!existsSync(manifestPath)) continue
      try {
        const raw = JSON.parse(await readFile(manifestPath, 'utf-8'))
        const parsed = SkillManifestSchema.safeParse(raw)
        if (!parsed.success) continue
        const { name, version, description } = parsed.data
        result.push({ name, version, description, installed: this.installed.has(name) })
      } catch {
        // skip malformed skill
      }
    }
    return result
  }

  // ─── Install ──────────────────────────────────────────────────────────────

  async install(name: string, options: { localPath?: string } = {}): Promise<InstalledSkill> {
    if (this.installed.has(name)) {
      throw new Error(`Skill "${name}" is already installed.`)
    }

    if (!options.localPath) {
      throw new Error(`localPath is required. Remote registry installs are no longer supported.`)
    }

    // Prevent arbitrary filesystem reads — local paths must be within skillsDir
    const resolvedLocal = resolvePath(options.localPath)
    if (!resolvedLocal.startsWith(this.skillsDir + '/') && resolvedLocal !== this.skillsDir) {
      throw new Error(
        `localPath must be within the skills directory (${this.skillsDir}). Got: ${options.localPath}`
      )
    }

    const manifest = await this.loadManifestFromPath(options.localPath)
    if (manifest.name !== name) {
      throw new Error(
        `Skill name mismatch: expected "${name}", manifest says "${manifest.name}"`
      )
    }

    return this.register(manifest, options.localPath)
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  async remove(name: string): Promise<void> {
    const existing = this.installed.get(name)
    if (!existing) {
      throw new Error(`Skill "${name}" is not installed`)
    }

    // Mark as pending_restart — unloading live code requires a gateway restart
    await this.db.execute(
      `UPDATE skills SET status = 'pending_restart', updated_at = NOW() WHERE name = $1`,
      [name]
    )
    this.installed.delete(name)
    console.log(`[SkillsManager] Skill "${name}" marked for removal (pending restart)`)
  }

  // ─── Enable / Disable ─────────────────────────────────────────────────────

  async enableSkill(name: string): Promise<InstalledSkill> {
    const row = await this.db.queryOne<DbSkillRow>('SELECT * FROM skills WHERE name = $1', [name])
    if (!row) throw new Error(`Skill "${name}" is not installed`)
    await this.db.execute(`UPDATE skills SET status = 'installed', updated_at = NOW() WHERE name = $1`, [name])
    const updated = rowToSkill({ ...row, status: 'installed' })
    this.installed.set(name, updated)
    return updated
  }

  async disableSkill(name: string): Promise<InstalledSkill> {
    const row = await this.db.queryOne<DbSkillRow>('SELECT * FROM skills WHERE name = $1', [name])
    if (!row) throw new Error(`Skill "${name}" is not installed`)
    await this.db.execute(`UPDATE skills SET status = 'disabled', updated_at = NOW() WHERE name = $1`, [name])
    const updated = rowToSkill({ ...row, status: 'disabled' })
    this.installed.set(name, updated)
    return updated
  }

  // ─── Agent-scoped skills ───────────────────────────────────────────────────

  async getAgentSkills(agentId: string): Promise<AgentSkill[]> {
    const rows = await this.db.query<{
      id: string; name: string; version: string; status: string
      type: string; anthropic_builtin_type: string | null; anthropic_beta_header: string | null
      manifest: string; installed_at: string | Date; enabled: boolean; agent_config: string
    }>(
      `SELECT s.id, s.name, s.version, s.status, s.type, s.anthropic_builtin_type,
              s.anthropic_beta_header, s.manifest, s.installed_at, a.enabled, a.config as agent_config
       FROM skills s
       INNER JOIN agent_skills a ON a.skill_name = s.name
       WHERE a.agent_id = $1 AND s.status = 'installed' AND a.enabled = true`,
      [agentId]
    )
    return rows.map(r => {
      let manifest: AgentSkill['manifest'] = { tools: [], prompts: [], requiredTools: [] }
      try { manifest = JSON.parse(typeof r.manifest === 'string' ? r.manifest : JSON.stringify(r.manifest)) as AgentSkill['manifest'] } catch { /* use default */ }
      let config: Record<string, unknown> = {}
      try { config = JSON.parse(r.agent_config) as Record<string, unknown> } catch { /* use default */ }
      return {
        id: r.id,
        name: r.name,
        version: r.version,
        type: (r.type === 'tool' ? 'tool' : 'prompt') as 'tool' | 'prompt',
        anthropicBuiltinType: r.anthropic_builtin_type ?? null,
        anthropicBetaHeader: r.anthropic_beta_header ?? null,
        manifest,
        installedAt: new Date(r.installed_at as string),
        config,
      }
    })
  }

  async listAgentSkills(agentId: string): Promise<AgentSkill[]> {
    return this.getAgentSkills(agentId)
  }

  async enableAgentSkill(agentId: string, skillName: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO agent_skills (agent_id, skill_name, enabled) VALUES ($1, $2, true)
       ON CONFLICT (agent_id, skill_name) DO UPDATE SET enabled = true, updated_at = NOW()`,
      [agentId, skillName]
    )
  }

  async disableAgentSkill(agentId: string, skillName: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO agent_skills (agent_id, skill_name, enabled) VALUES ($1, $2, false)
       ON CONFLICT (agent_id, skill_name) DO UPDATE SET enabled = false, updated_at = NOW()`,
      [agentId, skillName]
    )
  }

  // ─── Tool definitions ─────────────────────────────────────────────────────

  buildToolDefinitions(skills: AgentSkill[]): unknown[] {
    const seen = new Map<string, Date>()
    const result: unknown[] = []
    for (const skill of skills) {
      if (!skill.anthropicBuiltinType) continue
      const existing = seen.get(skill.anthropicBuiltinType)
      if (existing && existing <= skill.installedAt) continue
      if (existing) {
        // Remove the previously added entry for this builtin type
        const idx = result.findIndex(t => (t as { type: string }).type === skill.anthropicBuiltinType)
        if (idx !== -1) result.splice(idx, 1)
      }
      seen.set(skill.anthropicBuiltinType, skill.installedAt)
      result.push({ type: skill.anthropicBuiltinType })
    }
    return result
  }

  collectBetaHeaders(skills: AgentSkill[]): string[] {
    return [...new Set(skills.map(s => s.anthropicBetaHeader).filter((h): h is string => h !== null))]
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async register(manifest: SkillManifest, _skillDir: string): Promise<InstalledSkill> {
    const id = randomUUID()
    await this.db.execute(
      `INSERT INTO skills (id, name, version, status, type, anthropic_builtin_type, anthropic_beta_header, manifest, installed_at, updated_at)
       VALUES ($1, $2, $3, 'installed', $4, $5, $6, $7, NOW(), NOW())`,
      [id, manifest.name, manifest.version, manifest.type, manifest.anthropicBuiltinType, manifest.anthropicBetaHeader, JSON.stringify(manifest)]
    )

    const skill: InstalledSkill = {
      id,
      name: manifest.name,
      version: manifest.version,
      status: 'installed',
      type: manifest.type,
      anthropicBuiltinType: manifest.anthropicBuiltinType,
      anthropicBetaHeader: manifest.anthropicBetaHeader,
      manifest,
      installedAt: new Date(),
      updatedAt: new Date(),
    }
    this.installed.set(manifest.name, skill)
    console.log(`[SkillsManager] Skill "${manifest.name}@${manifest.version}" installed`)
    return skill
  }

  private async loadManifestFromPath(dir: string): Promise<SkillManifest> {
    const manifestPath = join(dir, 'skill.json')
    if (!existsSync(manifestPath)) {
      throw new Error(`No skill.json found at ${manifestPath}`)
    }
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(manifestPath, 'utf-8'))
    } catch (err) {
      throw new Error(`Failed to parse skill.json: ${(err as Error).message}`)
    }
    const parsed = SkillManifestSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid skill.json: ${parsed.error.message}`)
    }
    return parsed.data
  }

}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToSkill(row: DbSkillRow): InstalledSkill {
  // Postgres JSONB columns come back as objects; test mocks may pass JSON strings
  const rawManifest = typeof row.manifest === 'string'
    ? (() => { try { return JSON.parse(row.manifest as string) } catch { return row.manifest } })()
    : row.manifest
  // Validate manifest from DB rather than blindly casting
  const parseResult = SkillManifestSchema.safeParse(rawManifest)
  if (!parseResult.success) {
    throw new Error(`Corrupted manifest for skill "${row.id}": ${parseResult.error.message}`)
  }
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    status: row.status as SkillStatus,
    type: row.type ?? parseResult.data.type,
    anthropicBuiltinType: row.anthropic_builtin_type ?? parseResult.data.anthropicBuiltinType,
    anthropicBetaHeader: row.anthropic_beta_header ?? parseResult.data.anthropicBetaHeader,
    manifest: parseResult.data,
    installedAt: new Date(row.installed_at),
    updatedAt: new Date(row.updated_at),
  }
}
