// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// VaultSync — watches vault directory and mirrors to Postgres
//
// Data flow:
//   Obsidian vault files → chokidar watcher → parse frontmatter → SHA-256 checksum
//   → compare against vault_documents.checksum → upsert if changed
//   → record in vault_sync_events
//
// Canonical vault folders:
//   Agents/, Clients/, Projects/, Policies/, Workflows/, SOPs/, Architecture/, Research/, Decisions/
//
// Required frontmatter:
//   id, type, status, version, updated_at, owner (all optional except type for entity creation)
//
// Frontmatter types → entity types:
//   agent_profile → agent
//   client → client
//   project → project
//   policy → policy
//   sop → sop
//   person → person
//   (unknown) → document

import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'node:fs/promises' // Node 22+; fallback below
import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import chokidar, { type FSWatcher } from 'chokidar'
import matter from 'gray-matter'
import pg from 'pg'

const { Pool } = pg

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultSyncConfig {
  connectionString: string
  vaultPath: string
  watchDebounceMs?: number
  fireHook?: (event: string, context: Record<string, unknown>) => void
}

type EntityType = 'agent' | 'client' | 'project' | 'policy' | 'sop' | 'person' | 'document'

type SyncEventStatus = 'synced' | 'skipped' | 'error'

interface VaultDocument {
  id: string
  relative_path: string
  checksum: string
  frontmatter: Record<string, unknown>
  body: string
  status: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRONTMATTER_TYPE_MAP: Record<string, EntityType> = {
  agent_profile: 'agent',
  client: 'client',
  project: 'project',
  policy: 'policy',
  sop: 'sop',
  person: 'person',
}

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function mapEntityType(frontmatterType: string | undefined): EntityType {
  if (!frontmatterType) return 'document'
  return FRONTMATTER_TYPE_MAP[frontmatterType] ?? 'document'
}

function extractWikilinks(body: string): string[] {
  const links: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(WIKILINK_REGEX.source, 'g')
  while ((match = re.exec(body)) !== null) {
    const target = match[1]
    if (target) links.push(target.trim())
  }
  return links
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  label = 'operation',
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      console.warn(`[vault-sync] ${label} failed (attempt ${attempt}/${retries}):`, err)
      if (attempt < retries) await sleep(delayMs)
    }
  }
  throw lastErr
}

// ─── VaultSync ────────────────────────────────────────────────────────────────

export class VaultSync {
  private pool: pg.Pool | null = null
  private watcher: FSWatcher | null = null
  private readonly connectionString: string
  private readonly vaultPath: string
  private readonly watchDebounceMs: number
  private readonly fireHook: (event: string, context: Record<string, unknown>) => void

  constructor(config: VaultSyncConfig) {
    this.connectionString = config.connectionString
    this.vaultPath = path.resolve(config.vaultPath)
    this.watchDebounceMs = config.watchDebounceMs ?? 500
    this.fireHook = config.fireHook ?? (() => { /* no-op */ })
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    console.log(`[vault-sync] Starting — vault: ${this.vaultPath}`)

    this.pool = new Pool({
      connectionString: this.connectionString,
      max: 5,
    })

    // Verify DB connectivity
    await this.pool.query('SELECT 1')
    console.log('[vault-sync] Database connection established')

    // Full startup scan
    await this.fullScan()

    // Start file watcher
    this.watcher = chokidar.watch(this.vaultPath, {
      ignoreInitial: true,
      ignored: /(^|[/\\])\../, // ignore dotfiles
      awaitWriteFinish: {
        stabilityThreshold: this.watchDebounceMs,
        pollInterval: 100,
      },
    })

    this.watcher
      .on('add', (filePath: string) => {
        if (filePath.endsWith('.md')) {
          void this.handleFileEvent('add', filePath)
        }
      })
      .on('change', (filePath: string) => {
        if (filePath.endsWith('.md')) {
          void this.handleFileEvent('change', filePath)
        }
      })
      .on('unlink', (filePath: string) => {
        if (filePath.endsWith('.md')) {
          void this.handleFileEvent('unlink', filePath)
        }
      })
      .on('error', (err: unknown) => {
        console.error('[vault-sync] Watcher error:', err)
      })

    console.log('[vault-sync] File watcher active')
  }

  async stop(): Promise<void> {
    console.log('[vault-sync] Stopping...')
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
    console.log('[vault-sync] Stopped')
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async fullSync(): Promise<void> {
    await this.fullScan()
  }

  async validate(): Promise<{ valid: number; invalid: number; errors: Array<{ path: string; error: string }> }> {
    const mdFiles = await this.collectMarkdownFiles(this.vaultPath)
    let valid = 0
    let invalid = 0
    const errors: Array<{ path: string; error: string }> = []

    for (const filePath of mdFiles) {
      const relativePath = path.relative(this.vaultPath, filePath)
      let rawContent: string
      try {
        rawContent = await readFile(filePath, 'utf-8')
      } catch (err) {
        invalid++
        errors.push({ path: relativePath, error: `Read error: ${String(err)}` })
        continue
      }
      try {
        matter(rawContent)
        valid++
      } catch (err) {
        invalid++
        errors.push({ path: relativePath, error: `Frontmatter parse error: ${String(err)}` })
      }
    }

    return { valid, invalid, errors }
  }

  // ── File event handler ─────────────────────────────────────────────────────

  private async handleFileEvent(event: 'add' | 'change' | 'unlink', filePath: string): Promise<void> {
    try {
      if (event === 'unlink') {
        await this.archiveDocument(filePath)
      } else {
        await this.syncDocument(filePath)
      }
    } catch (err) {
      console.error(`[vault-sync] Unhandled error processing ${event} on ${filePath}:`, err)
    }
  }

  // ── Full scan ──────────────────────────────────────────────────────────────

  private async fullScan(): Promise<void> {
    console.log('[vault-sync] Running full startup scan...')
    this.fireHook('vault.sync.start', { vaultPath: this.vaultPath })

    const mdFiles = await this.collectMarkdownFiles(this.vaultPath)
    console.log(`[vault-sync] Found ${mdFiles.length} markdown files`)

    let synced = 0
    let skipped = 0
    let errors = 0

    for (const filePath of mdFiles) {
      try {
        const result = await this.syncDocument(filePath)
        if (result === 'synced') synced++
        else if (result === 'skipped') skipped++
      } catch (err) {
        errors++
        console.error(`[vault-sync] Error syncing ${filePath} during full scan:`, err)
      }
    }

    if (errors > 0) {
      this.fireHook('vault.sync.failed', { vaultPath: this.vaultPath, errors })
    } else {
      this.fireHook('vault.sync.complete', { vaultPath: this.vaultPath, synced, skipped })
    }
    console.log(`[vault-sync] Full scan complete — synced: ${synced}, skipped: ${skipped}, errors: ${errors}`)
  }

  private async collectMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = []

    async function walk(current: string): Promise<void> {
      let entries: Dirent[]
      try {
        entries = await fs.readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath)
        }
      }
    }

    await walk(dir)
    return results
  }

  // ── Document sync ──────────────────────────────────────────────────────────

  /**
   * Reads, parses, checksums, and upserts a markdown file into vault_documents.
   * Returns the sync event status.
   */
  async syncDocument(filePath: string): Promise<SyncEventStatus> {
    if (!this.pool) throw new Error('VaultSync not started — call start() first')

    const relativePath = path.relative(this.vaultPath, filePath)

    // Read raw content
    let rawContent: string
    try {
      rawContent = await readFile(filePath, 'utf-8')
    } catch (err) {
      console.error(`[vault-sync] Cannot read file ${filePath}:`, err)
      await this.recordSyncEvent(null, 'error', `Read error: ${String(err)}`)
      return 'error'
    }

    // Parse frontmatter
    let parsed: matter.GrayMatterFile<string>
    try {
      parsed = matter(rawContent)
    } catch (err) {
      console.warn(`[vault-sync] Frontmatter parse error in ${relativePath}:`, err)
      await this.recordSyncEvent(null, 'error', `Parse error: ${String(err)}`)
      return 'error'
    }

    const frontmatter = parsed.data as Record<string, unknown>
    const body = parsed.content

    // Compute checksum
    const checksum = sha256(rawContent)

    // Check existing record
    let existingDoc: { id: string; checksum: string } | null = null
    try {
      const rows = await this.pool.query<{ id: string; checksum: string }>(
        'SELECT id, checksum FROM vault_documents WHERE path = $1',
        [relativePath],
      )
      existingDoc = rows.rows[0] ?? null
    } catch (err) {
      console.error(`[vault-sync] DB lookup failed for ${relativePath}:`, err)
      await this.recordSyncEvent(null, 'error', `DB lookup error: ${String(err)}`)
      return 'error'
    }

    if (existingDoc && existingDoc.checksum === checksum) {
      // No change — skip
      return 'skipped'
    }

    // Upsert vault_documents
    let docId: string
    try {
      docId = await withRetry(
        () => this.upsertDocument(relativePath, frontmatter, rawContent, checksum, existingDoc?.id),
        3,
        1000,
        `upsert vault_document(${relativePath})`,
      )
    } catch (err) {
      console.error(`[vault-sync] Failed to upsert document ${relativePath} after retries:`, err)
      await this.recordSyncEvent(null, 'error', `Upsert failed: ${String(err)}`)
      return 'error'
    }

    // Extract entities from frontmatter
    if (frontmatter['type']) {
      try {
        await withRetry(
          () => this.upsertEntity(docId, frontmatter),
          3,
          1000,
          `upsert entity(${relativePath})`,
        )
      } catch (err) {
        // Non-fatal — log and continue
        console.warn(`[vault-sync] Entity upsert failed for ${relativePath}:`, err)
      }
    }

    // Extract and store wikilinks
    try {
      await withRetry(
        () => this.syncWikilinks(docId, body),
        3,
        1000,
        `sync wikilinks(${relativePath})`,
      )
    } catch (err) {
      console.warn(`[vault-sync] Wikilink sync failed for ${relativePath}:`, err)
    }

    // Record sync event
    await this.recordSyncEvent(docId, 'synced')

    // Fire vault document hook
    const hookEvent = existingDoc ? 'vault.document.updated' : 'vault.document.created'
    const isProposal = relativePath.startsWith('proposals/')
    const isCanon = relativePath.startsWith('canon/')
    this.fireHook(hookEvent, { docId, path: relativePath })
    if (isProposal && hookEvent === 'vault.document.created') {
      this.fireHook('vault.proposal.created', { docId, path: relativePath })
    } else if (isCanon && hookEvent === 'vault.document.created') {
      this.fireHook('vault.proposal.approved', { docId, path: relativePath })
    }

    console.log(`[vault-sync] Synced: ${relativePath}`)
    return 'synced'
  }

  // ── Archive (soft delete) ──────────────────────────────────────────────────

  private async archiveDocument(filePath: string): Promise<void> {
    if (!this.pool) return
    const relativePath = path.relative(this.vaultPath, filePath)

    try {
      await withRetry(
        async () => {
          await this.pool!.query(
            `UPDATE vault_documents
             SET status = 'archived', updated_at = NOW()
             WHERE path = $1`,
            [relativePath],
          )
        },
        3,
        1000,
        `archive(${relativePath})`,
      )
      await this.recordSyncEvent(null, 'synced')
      this.fireHook('vault.document.deleted', { path: relativePath })
      console.log(`[vault-sync] Archived: ${relativePath}`)
    } catch (err) {
      console.error(`[vault-sync] Failed to archive ${relativePath}:`, err)
    }
  }

  // ── DB helpers ─────────────────────────────────────────────────────────────

  private async upsertDocument(
    relativePath: string,
    frontmatter: Record<string, unknown>,
    rawMarkdown: string,
    checksum: string,
    existingId: string | undefined,
  ): Promise<string> {
    const pool = this.pool!
    const docType = (frontmatter['type'] as string | undefined) ?? null
    const docStatus = (frontmatter['status'] as string | undefined) ?? 'draft'

    if (existingId) {
      await pool.query(
        `UPDATE vault_documents
         SET raw_markdown = $1, checksum = $2, type = $3, status = $4, updated_at = NOW(), synced_at = NOW()
         WHERE id = $5`,
        [rawMarkdown, checksum, docType, docStatus, existingId],
      )
      return existingId
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO vault_documents (path, raw_markdown, checksum, type, status, updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (path) DO UPDATE
         SET raw_markdown = EXCLUDED.raw_markdown,
             checksum     = EXCLUDED.checksum,
             type         = EXCLUDED.type,
             status       = EXCLUDED.status,
             updated_at   = NOW(),
             synced_at    = NOW()
       RETURNING id`,
      [relativePath, rawMarkdown, checksum, docType, docStatus],
    )

    const row = result.rows[0]
    if (!row) throw new Error('Upsert returned no rows')
    return row.id
  }

  private async upsertEntity(docId: string, frontmatter: Record<string, unknown>): Promise<void> {
    const pool = this.pool!

    const entityType = mapEntityType(frontmatter['type'] as string | undefined)
    const name = (frontmatter['name'] as string | undefined) ?? 'unnamed'

    await pool.query(
      `INSERT INTO vault_entities (document_id, entity_type, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id) DO UPDATE
         SET entity_type = EXCLUDED.entity_type,
             name        = EXCLUDED.name`,
      [docId, entityType, name],
    )
  }

  private async syncWikilinks(fromDocId: string, body: string): Promise<void> {
    const pool = this.pool!
    const targets = extractWikilinks(body)
    if (targets.length === 0) return

    // Get the entity_id for the source document
    const fromEntity = await pool.query<{ entity_id: string }>(
      `SELECT entity_id FROM vault_entities WHERE document_id = $1 LIMIT 1`,
      [fromDocId],
    )
    const fromEntityId = fromEntity.rows[0]?.entity_id
    if (!fromEntityId) return // no entity for this doc, skip wikilinks

    // Delete existing wikilinks from this entity (rebuild on every sync)
    await pool.query(
      `DELETE FROM vault_links WHERE from_id = $1 AND link_type = 'wikilink'`,
      [fromEntityId],
    )

    for (const target of targets) {
      // Resolve target entity by path match
      const resolved = await pool.query<{ entity_id: string }>(
        `SELECT ve.entity_id FROM vault_entities ve
         JOIN vault_documents vd ON vd.id = ve.document_id
         WHERE (vd.path ILIKE $1 OR vd.path ILIKE $2)
           AND vd.status != 'archived'
         LIMIT 1`,
        [`%/${target}.md`, `${target}.md`],
      )
      const toEntityId: string | null = resolved.rows[0]?.entity_id ?? null

      await pool.query(
        `INSERT INTO vault_links (from_id, to_id, link_type)
         VALUES ($1, $2, 'wikilink')
         ON CONFLICT (from_id, to_id, link_type) DO NOTHING`,
        [fromEntityId, toEntityId],
      )
    }
  }

  private async recordSyncEvent(
    docId: string | null,
    status: SyncEventStatus,
    errorMessage: string | null = null,
  ): Promise<void> {
    if (!this.pool) return
    try {
      const errors = errorMessage ? JSON.stringify([errorMessage]) : '[]'
      await this.pool.query(
        `INSERT INTO vault_sync_events (document_id, status, errors, synced_at)
         VALUES ($1, $2, $3, NOW())`,
        [docId, status, errors],
      )
    } catch (err) {
      // Don't throw — event recording is best-effort
      console.warn('[vault-sync] Failed to record sync event:', err)
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export async function startVaultSync(config: VaultSyncConfig): Promise<VaultSync> {
  const instance = new VaultSync(config)
  await instance.start()
  return instance
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { loadConfig, loadCredentials } = await import('@agency/config')

  const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])

  if (!config.daemons.vaultSync.enabled) {
    console.log('[vault-sync] Disabled in config (daemons.vaultSync.enabled = false). Exiting.')
    process.exit(0)
  }

  const connectionString = credentials.postgres?.url ?? process.env['AGENCY_POSTGRES_URL']
  if (!connectionString) {
    console.error('[vault-sync] No Postgres connection string. Set credentials.postgres.url or AGENCY_POSTGRES_URL.')
    process.exit(1)
  }

  const vaultPath = process.env['AGENCY_VAULT_PATH']
  if (!vaultPath) {
    console.error('[vault-sync] No vault path. Set AGENCY_VAULT_PATH environment variable.')
    process.exit(1)
  }

  const watchDebounceMs = process.env['AGENCY_VAULT_DEBOUNCE_MS']
    ? parseInt(process.env['AGENCY_VAULT_DEBOUNCE_MS'], 10)
    : 500

  const hookPool = new Pool({ connectionString, max: 2 })

  function fireHook(event: string, context: Record<string, unknown>): void {
    void (async () => {
      try {
        const result = await hookPool.query<{ command: string }>(
          `SELECT command FROM hooks WHERE event = $1 AND enabled = true ORDER BY created_at ASC`,
          [event],
        )
        for (const row of result.rows) {
          const env: Record<string, string> = { ...process.env as Record<string, string> }
          env['AGENCY_EVENT'] = event
          for (const [k, v] of Object.entries(context)) {
            const key = `AGENCY_${k.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
            env[key] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
          }
          const { spawn } = await import('node:child_process')
          spawn('bash', ['-c', row.command], { env, stdio: 'pipe', detached: false })
        }
      } catch {
        // best-effort
      }
    })()
  }

  const instance = await startVaultSync({ connectionString, vaultPath, watchDebounceMs, fireHook })

  async function shutdown(): Promise<void> {
    await instance.stop()
    await hookPool.end()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    console.log('[vault-sync] SIGINT received, shutting down...')
    void shutdown()
  })

  process.on('SIGTERM', () => {
    console.log('[vault-sync] SIGTERM received, shutting down...')
    void shutdown()
  })
}

// Only run as entrypoint, not when imported as a module
const isEntrypoint = import.meta.url === new URL(process.argv[1]!, 'file://').href
if (isEntrypoint) {
  main().catch(err => {
    console.error('[vault-sync] Fatal error:', err)
    process.exit(1)
  })
}
