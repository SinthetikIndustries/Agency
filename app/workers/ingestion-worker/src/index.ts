// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { BaseWorker } from '@agency/shared-worker'
import type { Job } from 'bullmq'
import matter from 'gray-matter'
import pg from 'pg'
import fs from 'node:fs/promises'

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestionJob {
  documentId: string
  filePath: string
  connectionString: string
}

type EntityType =
  | 'agent'
  | 'client'
  | 'project'
  | 'policy'
  | 'sop'
  | 'person'
  | 'document'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function frontmatterTypeToEntityType(type: string | undefined): EntityType {
  switch (type) {
    case 'agent_profile': return 'agent'
    case 'client':        return 'client'
    case 'project':       return 'project'
    case 'policy':        return 'policy'
    case 'sop':           return 'sop'
    case 'person':        return 'person'
    default:              return 'document'
  }
}

function extractWikilinks(markdown: string): string[] {
  const matches = markdown.matchAll(/\[\[([^\]]+)\]\]/g)
  const titles: string[] = []
  for (const match of matches) {
    // Strip pipe aliases: [[Target|Alias]] → "Target"
    const raw = match[1]!.split('|')[0]!.trim()
    if (raw) titles.push(raw)
  }
  return [...new Set(titles)]
}

async function ensureEntity(
  pool: pg.Pool,
  documentId: string,
  entityType: EntityType
): Promise<string> {
  // Return existing entity id or insert a new one
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM vault_entities WHERE document_id = $1 LIMIT 1`,
    [documentId]
  )
  if (existing.rows.length > 0) {
    return existing.rows[0]!.id
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO vault_entities (document_id, entity_type, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (document_id) DO UPDATE SET entity_type = EXCLUDED.entity_type, updated_at = NOW()
     RETURNING id`,
    [documentId, entityType]
  )
  return inserted.rows[0]!.id
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export class IngestionWorker extends BaseWorker {
  constructor() {
    super('agency:ingestion' as any, 2)
  }

  protected async processJob(job: Job): Promise<unknown> {
    const data = job.data as IngestionJob
    const { documentId, filePath, connectionString } = data

    const pool = new pg.Pool({ connectionString })

    try {
      // 1. Read document record from DB
      const docResult = await pool.query<{
        id: string
        title: string
        raw_markdown: string
        frontmatter: Record<string, unknown>
      }>(
        `SELECT id, title, raw_markdown, frontmatter FROM vault_documents WHERE id = $1`,
        [documentId]
      )

      if (docResult.rows.length === 0) {
        throw new Error(`Document not found: ${documentId}`)
      }

      const doc = docResult.rows[0]

      // 2. Read raw file and parse frontmatter
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = matter(raw)
      const fm = parsed.data as Record<string, unknown>
      const body = parsed.content

      // 3. Determine entity type from frontmatter
      const entityType = frontmatterTypeToEntityType(
        typeof fm.type === 'string' ? fm.type : undefined
      )

      // 4. Ensure source document has a vault_entity record
      const sourceEntityId = await ensureEntity(pool, documentId, entityType)

      // 5. Extract wikilinks
      const wikilinks = extractWikilinks(body)
      console.log(`[agency:ingestion] Document ${documentId}: found ${wikilinks.length} wikilinks`)

      // 6. For each wikilink: resolve target, ensure entity, upsert link
      for (const title of wikilinks) {
        // Try to find target document by title
        const targetResult = await pool.query<{ id: string; frontmatter: Record<string, unknown> }>(
          `SELECT id, frontmatter FROM vault_documents WHERE title = $1 LIMIT 1`,
          [title]
        )

        if (targetResult.rows.length === 0) {
          // Unresolved link — skip entity creation but could record as unresolved
          console.log(`[agency:ingestion] Unresolved wikilink: [[${title}]]`)
          continue
        }

        const target = targetResult.rows[0]!
        const targetFm = target.frontmatter as Record<string, unknown> ?? {}
        const targetEntityType = frontmatterTypeToEntityType(
          typeof targetFm.type === 'string' ? targetFm.type : undefined
        )

        // 7. Ensure target has a vault_entity record
        const targetEntityId = await ensureEntity(pool, target.id, targetEntityType)

        // 8. Upsert vault_links
        await pool.query(
          `INSERT INTO vault_links (source_entity_id, target_entity_id, link_text, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (source_entity_id, target_entity_id) DO UPDATE
             SET link_text = EXCLUDED.link_text, updated_at = NOW()`,
          [sourceEntityId, targetEntityId, title]
        )
      }

      return {
        documentId,
        entityType,
        sourceEntityId,
        wikilinksFound: wikilinks.length,
      }
    } finally {
      await pool.end()
    }
  }
}

// ─── Factory & Entry Point ────────────────────────────────────────────────────

export async function startIngestionWorker(): Promise<IngestionWorker> {
  const worker = new IngestionWorker()
  await worker.start()
  console.log('[agency:ingestion] Ingestion worker ready')
  return worker
}

startIngestionWorker().catch((err) => {
  console.error('[agency:ingestion] Fatal startup error:', err)
  process.exit(1)
})
