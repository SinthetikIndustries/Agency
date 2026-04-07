// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import pg from 'pg'
import type { Pool } from 'pg'

const { Pool: PgPool } = pg

export type MemoryType = 'episodic' | 'semantic' | 'working' | 'procedural' | 'reflective'

export interface MemoryEntry {
  id: string
  agentId: string
  type: MemoryType
  content: string
  createdAt: Date
  expiresAt: Date | null
}

export interface MemoryWriteInput {
  agentId: string
  groupId?: string        // if set, writes to group memory scope
  type: MemoryType
  content: string
  expiresAt?: Date
  embedding?: number[]  // pre-computed embedding, or leave undefined to auto-generate
}

// Scope filter for read() — when provided, replaces the simple agent_id filter
// with full Grid scope-aware access logic
export interface ScopeFilter {
  ownedByAgent: string          // include private memories owned by this agent
  zoneIds?: string[]            // include zone-visibility memories for these zones
  includeGlobal?: boolean       // include global-visibility memories
  minTrustLevel?: number        // minimum trust_level (default 1)
}

export interface MemoryQuery {
  agentId: string
  query?: string           // natural language query for semantic search
  types?: MemoryType[]     // filter by type
  limit?: number           // default 10
  minScore?: number        // cosine similarity threshold, default 0.7
  queryEmbedding?: number[] // pre-computed query embedding
  scopeFilter?: ScopeFilter // when provided, applies Grid scope-aware access rules
}

export interface MemoryGroupQuery {
  groupId: string
  query?: string
  types?: MemoryType[]
  limit?: number
  minScore?: number
  queryEmbedding?: number[]
}

export class MemoryStore {
  private pool: Pool

  constructor(connectionString: string) {
    this.pool = new PgPool({ connectionString, max: 5 })
  }

  async write(entry: MemoryWriteInput): Promise<string> {
    // Use parameterized query but handle vector separately since pg can't parameterize vector literals
    let result: pg.QueryResult
    if (entry.embedding) {
      result = await this.pool.query(
        `INSERT INTO memory_entries (agent_id, group_id, type, content, embedding, expires_at)
         VALUES ($1, $2, $3, $4, $5::vector, $6)
         RETURNING id`,
        [entry.agentId, entry.groupId ?? null, entry.type, entry.content, `[${entry.embedding.join(',')}]`, entry.expiresAt ?? null]
      )
    } else {
      result = await this.pool.query(
        `INSERT INTO memory_entries (agent_id, group_id, type, content, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [entry.agentId, entry.groupId ?? null, entry.type, entry.content, entry.expiresAt ?? null]
      )
    }

    return result.rows[0].id as string
  }

  async read(query: MemoryQuery): Promise<MemoryEntry[]> {
    const limit = query.limit ?? 10
    const types = query.types ?? ['episodic', 'semantic', 'working']
    const typePlaceholders = types.map((_, i) => `$${i + 2}`).join(', ')

    // Build scope clause when scopeFilter is provided
    const scopeFilter = query.scopeFilter
    let scopeClause = `agent_id = $1`
    const params: unknown[] = [query.agentId, ...types]

    if (scopeFilter) {
      const minTrust = scopeFilter.minTrustLevel ?? 1
      const clauses: string[] = [
        // Private memories owned by this agent
        `(scope_type = 'agent' AND scope_id = $1 AND visibility = 'private')`,
      ]
      if (scopeFilter.zoneIds && scopeFilter.zoneIds.length > 0) {
        const zoneParam = `$${params.length + 1}`
        params.push(scopeFilter.zoneIds)
        clauses.push(`(visibility = 'zone' AND scope_id = ANY(${zoneParam}::text[]))`)
      }
      if (scopeFilter.includeGlobal) {
        const trustParam = `$${params.length + 1}`
        params.push(minTrust)
        clauses.push(`(visibility = 'global' AND trust_level >= ${trustParam})`)
      }
      scopeClause = `(${clauses.join(' OR ')}) AND memory_status IN ('active', 'canon')`
    }

    // If we have a query embedding, do semantic search
    if (query.queryEmbedding && query.queryEmbedding.length > 0) {
      const minScore = query.minScore ?? 0.7
      const embeddingStr = `[${query.queryEmbedding.join(',')}]`
      const embParam = `$${params.length + 1}`
      const limitParam = `$${params.length + 2}`
      params.push(embeddingStr, limit)
      const result = await this.pool.query(
        `SELECT id, agent_id, type, content, created_at, expires_at,
                1 - (embedding <=> ${embParam}::vector) as score
         FROM memory_entries
         WHERE ${scopeClause}
           AND type = ANY(ARRAY[${typePlaceholders}]::text[])
           AND (expires_at IS NULL OR expires_at > NOW())
           AND embedding IS NOT NULL
         ORDER BY embedding <=> ${embParam}::vector ASC
         LIMIT ${limitParam}`,
        params
      )
      const minScoreVal = minScore
      return result.rows
        .filter(row => (row.score as number) >= minScoreVal)
        .map(rowToEntry)
    }

    // Fallback: return most recent entries
    const limitParam = `$${params.length + 1}`
    params.push(limit)
    const result = await this.pool.query(
      `SELECT id, agent_id, type, content, created_at, expires_at
       FROM memory_entries
       WHERE ${scopeClause}
         AND type = ANY(ARRAY[${typePlaceholders}]::text[])
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT ${limitParam}`,
      params
    )
    return result.rows.map(rowToEntry)
  }

  async readGroup(query: MemoryGroupQuery): Promise<MemoryEntry[]> {
    const limit = query.limit ?? 10
    const types = query.types ?? ['episodic', 'semantic', 'working']
    const typePlaceholders = types.map((_, i) => `$${i + 2}`).join(', ')

    if (query.queryEmbedding && query.queryEmbedding.length > 0) {
      const minScore = query.minScore ?? 0.7
      const embeddingStr = `[${query.queryEmbedding.join(',')}]`
      const result = await this.pool.query(
        `SELECT id, agent_id, type, content, created_at, expires_at,
                1 - (embedding <=> $${types.length + 2}::vector) as score
         FROM memory_entries
         WHERE group_id = $1
           AND type = ANY(ARRAY[${typePlaceholders}]::text[])
           AND (expires_at IS NULL OR expires_at > NOW())
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $${types.length + 2}::vector ASC
         LIMIT $${types.length + 3}`,
        [query.groupId, ...types, embeddingStr, limit]
      )
      const minScoreVal = minScore
      return result.rows
        .filter(row => (row.score as number) >= minScoreVal)
        .map(rowToEntry)
    }

    const result = await this.pool.query(
      `SELECT id, agent_id, type, content, created_at, expires_at
       FROM memory_entries
       WHERE group_id = $1
         AND type = ANY(ARRAY[${typePlaceholders}]::text[])
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT $${types.length + 2}`,
      [query.groupId, ...types, limit]
    )
    return result.rows.map(rowToEntry)
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const result = await this.pool.query(
      'SELECT id, agent_id, type, content, created_at, expires_at FROM memory_entries WHERE id = $1',
      [id]
    )
    if (result.rows.length === 0) return null
    return rowToEntry(result.rows[0])
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM memory_entries WHERE id = $1', [id])
  }

  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING id"
    )
    return result.rowCount ?? 0
  }

  async deleteAgentMemory(agentId: string, type?: MemoryType): Promise<number> {
    let result: pg.QueryResult
    if (type) {
      result = await this.pool.query(
        'DELETE FROM memory_entries WHERE agent_id = $1 AND type = $2 RETURNING id',
        [agentId, type]
      )
    } else {
      result = await this.pool.query(
        'DELETE FROM memory_entries WHERE agent_id = $1 RETURNING id',
        [agentId]
      )
    }
    return result.rowCount ?? 0
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

function rowToEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: row['id'] as string,
    agentId: row['agent_id'] as string,
    type: row['type'] as MemoryType,
    content: row['content'] as string,
    createdAt: new Date(row['created_at'] as string),
    expiresAt: row['expires_at'] ? new Date(row['expires_at'] as string) : null,
  }
}

export function formatMemoriesForContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) return ''

  const lines = memories.map(m => {
    const date = m.createdAt.toISOString().split('T')[0]
    return `Memory (${date}): ${m.content}`
  })

  return `## Relevant Memories\n\n${lines.join('\n')}`
}
