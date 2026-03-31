// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Run SQL migration files from the migrations/ directory.
 * Uses a simple migrations table to track which files have been applied.
 * Files are applied in alphabetical order.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString })
  await client.connect()

  try {
    // Acquire an advisory lock to prevent concurrent migrations across multiple instances.
    // Lock key 7357 is arbitrary — just needs to be consistent across all gateway instances.
    const lockResult = await client.query('SELECT pg_try_advisory_lock(7357) AS acquired')
    if (!lockResult.rows[0]?.acquired) {
      console.log('[Migrations] Another instance is running migrations. Skipping.')
      return
    }

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          SERIAL PRIMARY KEY,
        filename    TEXT UNIQUE NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Read migration files
    const { readdir, readFile } = await import('node:fs/promises')
    const migrationsDir = join(__dirname, '..', 'migrations')

    let files: string[]
    try {
      files = (await readdir(migrationsDir))
        .filter(f => f.endsWith('.sql'))
        .sort()
    } catch {
      console.log('[Migrations] No migrations directory found, skipping.')
      return
    }

    for (const file of files) {
      // Check if already applied
      const result = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      )
      if (result.rows.length > 0) continue

      console.log(`[Migrations] Applying ${file}...`)
      const sql = await readFile(join(migrationsDir, file), 'utf-8')

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        )
        await client.query('COMMIT')
        console.log(`[Migrations] Applied ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${String(err)}`)
      }
    }

    console.log('[Migrations] All migrations up to date.')
  } finally {
    await client.end()
  }
}
