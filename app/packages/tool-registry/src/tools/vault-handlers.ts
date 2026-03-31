// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { writeFile, mkdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import type { ToolContext } from '@agency/shared-types'

// ─── VaultDb / VaultStore ─────────────────────────────────────────────────────

export interface VaultDb {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface VaultStore {
  db: VaultDb
  vaultPath: string  // path to vault root e.g. ~/.agency/vault
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVaultHandlers(store: VaultStore) {
  return {
    async vault_search(
      input: Record<string, unknown>,
      _ctx: ToolContext
    ): Promise<unknown> {
      const query = input['query'] as string
      const limit = Math.min(Number(input['limit'] ?? 10) || 10, 50)

      const results = await store.db.query<{
        id: string
        path: string
        title: string
        type: string
        snippet: string
      }>(
        `SELECT id, path,
                LEFT(raw_markdown, 300) AS snippet,
                COALESCE(type, 'document') AS type,
                split_part(path, '/', -1) AS title
         FROM vault_documents
         WHERE status != 'archived'
           AND (to_tsvector('english', COALESCE(raw_markdown,'')) @@ plainto_tsquery('english', $1)
                OR raw_markdown ILIKE '%' || $1 || '%')
         LIMIT $2`,
        [query, limit]
      )

      return {
        results: results.map(r => ({
          id: r.id,
          path: r.path,
          title: r.title.replace(/\.md$/, ''),
          type: r.type,
          snippet: r.snippet,
        })),
        count: results.length,
      }
    },

    async vault_related(
      input: Record<string, unknown>,
      _ctx: ToolContext
    ): Promise<unknown> {
      const slug = input['slug'] as string
      const limit = Math.min(Number(input['limit'] ?? 10) || 10, 50)

      // vault_links.from_id/to_id reference vault_entities.entity_id (not vault_documents.id)
      // Navigate: document → entity → vault_links → entity → document
      const outbound = await store.db.query<{
        id: string
        path: string
        title: string
      }>(
        `SELECT vd.id, vd.path, split_part(vd.path, '/', -1) AS title
         FROM vault_links vl
         JOIN vault_entities from_e ON from_e.entity_id = vl.from_id
         JOIN vault_entities to_e   ON to_e.entity_id   = vl.to_id
         JOIN vault_documents vd    ON vd.id = to_e.document_id
         WHERE from_e.document_id = (
           SELECT id FROM vault_documents WHERE path ILIKE '%' || $1 || '%' LIMIT 1
         )
           AND vl.to_id IS NOT NULL
         LIMIT $2`,
        [slug, limit]
      )

      const inbound = await store.db.query<{
        id: string
        path: string
        title: string
      }>(
        `SELECT vd.id, vd.path, split_part(vd.path, '/', -1) AS title
         FROM vault_links vl
         JOIN vault_entities to_e   ON to_e.entity_id   = vl.to_id
         JOIN vault_entities from_e ON from_e.entity_id = vl.from_id
         JOIN vault_documents vd    ON vd.id = from_e.document_id
         WHERE to_e.document_id = (
           SELECT id FROM vault_documents WHERE path ILIKE '%' || $1 || '%' LIMIT 1
         )
         LIMIT $2`,
        [slug, limit]
      )

      const links = [
        ...outbound.map(r => ({
          id: r.id,
          path: r.path,
          title: r.title.replace(/\.md$/, ''),
          direction: 'outbound' as const,
        })),
        ...inbound.map(r => ({
          id: r.id,
          path: r.path,
          title: r.title.replace(/\.md$/, ''),
          direction: 'inbound' as const,
        })),
      ]

      return { links, count: links.length }
    },

    async vault_propose(
      input: Record<string, unknown>,
      _ctx: ToolContext
    ): Promise<unknown> {
      const relativePath = input['path'] as string
      const content = input['content'] as string

      const resolvedPath = resolve(join(store.vaultPath, 'proposals', relativePath))

      // Safety: ensure the resolved path stays within the vault's proposals dir
      const proposalsDir = resolve(join(store.vaultPath, 'proposals'))
      if (!resolvedPath.startsWith(proposalsDir + '/') && resolvedPath !== proposalsDir) {
        throw new Error(`Permission denied: path '${relativePath}' escapes the proposals directory`)
      }

      await mkdir(dirname(resolvedPath), { recursive: true })
      await writeFile(resolvedPath, content, 'utf-8')

      return { written: true, path: resolvedPath }
    },
  }
}
