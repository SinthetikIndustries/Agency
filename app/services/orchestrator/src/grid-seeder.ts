// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

import type { DatabaseClient } from './db.js'

// ── Structural node definitions ───────────────────────────────────────────────

interface GridNodeDef {
  grid_path: string
  type: string
  label: string
  content: string
  grid_tier: number
  parent_path?: string
  edge_type?: string  // edge from parent to this node
}

const GRID_STRUCTURE: GridNodeDef[] = [
  // ── Tier 1: Grid root and layers ─────────────────────────────────────────────
  {
    grid_path: 'GRID',
    type: 'grid-root',
    label: 'GRID',
    content: 'The entire Grid environment — the full operating world of the Agency system.',
    grid_tier: 1,
  },
  {
    grid_path: 'GRID/SYSTEM',
    type: 'grid-system',
    label: 'SYSTEM',
    content: 'Core system layer. Governs and sustains the Grid. Contains CTRL, control-plane, subprograms, and runtime.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/PROGRAMS',
    type: 'grid-programs',
    label: 'PROGRAMS',
    content: 'User-facing and user-created programs in the Grid. Contains PRIM, program instances, zones, and links.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/MEMORY',
    type: 'grid-memory',
    label: 'MEMORY',
    content: 'Interpreted knowledge layer. What the Grid retains. Organized by type and lifecycle status.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/HISTORY',
    type: 'grid-history',
    label: 'HISTORY',
    content: 'Recorded past. Append-only durable event record. Events, messages, decisions, approvals.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/INTERFACES',
    type: 'grid-interfaces',
    label: 'INTERFACES',
    content: 'Entry and exit surfaces. CLI, chat, dashboard, automation, external integrations.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/VIEWS',
    type: 'grid-views',
    label: 'VIEWS',
    content: 'Computed perspectives. Shaped representations of Grid state for different consumers.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/STATE-MODELS',
    type: 'grid-state-models',
    label: 'STATE-MODELS',
    content: 'Laws of motion. Formal object schemas, lifecycle state machines, traffic rules, promotion logic.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/ARCHIVE',
    type: 'grid-archive',
    label: 'ARCHIVE',
    content: 'Cold storage. Retained but inactive historical material. Memory, history, runtime artifacts, snapshots.',
    grid_tier: 1,
    parent_path: 'GRID',
    edge_type: 'contains',
  },

  // ── Tier 2: SYSTEM sub-sections ──────────────────────────────────────────────
  {
    grid_path: 'GRID/SYSTEM/CTRL',
    type: 'ctrl',
    label: 'CTRL',
    content: 'Central control authority. Routes work, arbitrates conflicts, enforces policy, manages approvals.',
    grid_tier: 2,
    parent_path: 'GRID/SYSTEM',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/SYSTEM/control-plane',
    type: 'control-plane',
    label: 'control-plane',
    content: 'Rules of the Grid. Authority hierarchy, permissions, routing rules, governance policy, scheduling, safeguards.',
    grid_tier: 2,
    parent_path: 'GRID/SYSTEM',
    edge_type: 'contains',
  },
  {
    // REQUIRED: this section node must exist before the third-pass subprogram seeding
    // so subprogram brain nodes can be linked to it via 'contains' edges.
    grid_path: 'GRID/SYSTEM/subprograms',
    type: 'runtime',
    label: 'subprograms',
    content: 'System subprogram registry. All background workers that maintain Grid integrity.',
    grid_tier: 2,
    parent_path: 'GRID/SYSTEM',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/SYSTEM/runtime',
    type: 'runtime',
    label: 'runtime',
    content: 'Live system execution. Active processes, queues, sessions, triggers, approvals, and locks.',
    grid_tier: 2,
    parent_path: 'GRID/SYSTEM',
    edge_type: 'contains',
  },

  // ── Tier 2: PROGRAMS sub-sections ────────────────────────────────────────────
  {
    grid_path: 'GRID/PROGRAMS/PRIM',
    type: 'program',
    label: 'PRIM',
    content: 'Primary program. The default main assistant. The first program a user interacts with.',
    grid_tier: 2,
    parent_path: 'GRID/PROGRAMS',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/PROGRAMS/instances',
    type: 'program',
    label: 'instances',
    content: 'Additional program instances. User-created or system-created programs beyond PRIM.',
    grid_tier: 2,
    parent_path: 'GRID/PROGRAMS',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/PROGRAMS/ZONES',
    type: 'zone',
    label: 'ZONES',
    content: 'Shared operating environments. Bounded spaces where multiple programs can interact.',
    grid_tier: 2,
    parent_path: 'GRID/PROGRAMS',
    edge_type: 'contains',
  },

  // ── Tier 2: MEMORY sub-sections ───────────────────────────────────────────────
  {
    grid_path: 'GRID/MEMORY/working',
    type: 'memory-tier',
    label: 'working',
    content: 'Short-term active memory. Immediate live context for the current session.',
    grid_tier: 2,
    parent_path: 'GRID/MEMORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/MEMORY/episodic',
    type: 'memory-tier',
    label: 'episodic',
    content: 'Experience memory. Events and interactions stored with temporal context.',
    grid_tier: 2,
    parent_path: 'GRID/MEMORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/MEMORY/semantic/canon',
    type: 'memory-tier',
    label: 'semantic/canon',
    content: 'Approved truth. Trusted, stable system knowledge that has passed WARD review.',
    grid_tier: 2,
    parent_path: 'GRID/MEMORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/MEMORY/semantic/proposals',
    type: 'memory-tier',
    label: 'semantic/proposals',
    content: 'Candidate truth. Unapproved but retained semantic knowledge awaiting WARD review.',
    grid_tier: 2,
    parent_path: 'GRID/MEMORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/MEMORY/procedural',
    type: 'memory-tier',
    label: 'procedural',
    content: 'How-to memory. Workflows, rules, and operational knowledge.',
    grid_tier: 2,
    parent_path: 'GRID/MEMORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/MEMORY/reflective',
    type: 'memory-tier',
    label: 'reflective',
    content: 'Learning memory. Lessons, evaluations, and adaptations derived from experience.',
    grid_tier: 2,
    parent_path: 'GRID/MEMORY',
    edge_type: 'contains',
  },

  // ── Tier 2: HISTORY sub-sections ──────────────────────────────────────────────
  {
    grid_path: 'GRID/HISTORY/events',
    type: 'history-tier',
    label: 'events',
    content: 'System events. Important actions and occurrences recorded by SENS.',
    grid_tier: 2,
    parent_path: 'GRID/HISTORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/HISTORY/decisions',
    type: 'history-tier',
    label: 'decisions',
    content: 'Decision history. Major rulings and outcomes from CTRL and programs.',
    grid_tier: 2,
    parent_path: 'GRID/HISTORY',
    edge_type: 'contains',
  },
  {
    grid_path: 'GRID/HISTORY/approvals',
    type: 'history-tier',
    label: 'approvals',
    content: 'Approval history. What was allowed, denied, or escalated, and by whom.',
    grid_tier: 2,
    parent_path: 'GRID/HISTORY',
    edge_type: 'contains',
  },
]

// ── Subprogram seed definitions ───────────────────────────────────────────────

interface SubprogramSeedDef {
  id: string
  label: string
  description: string
  responsibility: string
}

const SUBPROGRAM_DEFS: SubprogramSeedDef[] = [
  {
    id: 'MON',
    label: 'Monitor',
    description: 'Observes system activity and conditions. Reports health status.',
    responsibility: 'Watch system activity and surface anomalies.',
  },
  {
    id: 'COMP',
    label: 'Compactor',
    description: 'Compresses and summarizes episodic memory clusters to reduce noise over time.',
    responsibility: 'Summarize and compress old memory into higher-density forms.',
  },
  {
    id: 'INDX',
    label: 'Indexer',
    description: 'Organizes memory records and keeps vector index and lookup paths fresh.',
    responsibility: 'Keep all search indexes current and accurate.',
  },
  {
    id: 'RETR',
    label: 'Retriever',
    description: 'Fetches relevant memory and history for program context assembly.',
    responsibility: 'Assemble the right memory for each program\'s context slice.',
  },
  {
    id: 'ANLY',
    label: 'Analyzer',
    description: 'Detects patterns, drift, and useful signals in history and memory.',
    responsibility: 'Surface patterns and lessons from accumulated history.',
  },
  {
    id: 'SECR',
    label: 'Security',
    description: 'Enforces scope boundaries and system integrity checks.',
    responsibility: 'Detect and block scope violations and boundary breaches.',
  },
  {
    id: 'WARD',
    label: 'Warden',
    description: 'Governs canon truth. Reviews proposals, resolves conflicts, and promotes approved knowledge.',
    responsibility: 'Adjudicate what becomes canon and what is retired.',
  },
  {
    id: 'EXEC',
    label: 'Executor',
    description: 'Carries out approved system-level work delegated by CTRL.',
    responsibility: 'Execute delegated system tasks with full audit trail.',
  },
  {
    id: 'LIFE',
    label: 'Lifecycle',
    description: 'Handles aging, archival, and expiration of memory and runtime artifacts.',
    responsibility: 'Age and archive stale objects per policy.',
  },
  {
    id: 'SENS',
    label: 'Sensor',
    description: 'Ingests events, change signals, and external triggers into the Grid event stream.',
    responsibility: 'Normalize raw events into typed Grid history records.',
  },
]

// ── GridSeeder ────────────────────────────────────────────────────────────────

export class GridSeeder {
  constructor(private readonly db: DatabaseClient) {}

  async seed(): Promise<void> {
    console.log('[GridSeeder] Seeding Grid structural nodes...')

    // Build a map of grid_path → brain node id for edge creation
    const pathToNodeId = new Map<string, string>()

    // First pass: upsert all structural nodes
    for (const def of GRID_STRUCTURE) {
      const existing = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM brain_nodes WHERE grid_path = $1`,
        [def.grid_path]
      )

      let nodeId: string

      if (existing) {
        // Update label and content but do not overwrite user changes
        await this.db.execute(
          `UPDATE brain_nodes
           SET type = $1, label = $2, content = $3, grid_tier = $4,
               grid_locked = true, updated_at = NOW()
           WHERE grid_path = $5 AND grid_locked = true`,
          [def.type, def.label, def.content, def.grid_tier, def.grid_path]
        )
        nodeId = existing.id
      } else {
        const inserted = await this.db.queryOne<{ id: string }>(
          `INSERT INTO brain_nodes (type, label, content, grid_path, grid_tier, grid_locked, confidence, source)
           VALUES ($1, $2, $3, $4, $5, true, 1.0, 'system')
           RETURNING id`,
          [def.type, def.label, def.content, def.grid_path, def.grid_tier]
        )
        if (!inserted) throw new Error(`Failed to insert Grid node: ${def.grid_path}`)
        nodeId = inserted.id
      }

      pathToNodeId.set(def.grid_path, nodeId)
    }

    // Second pass: create edges between parent and child nodes
    for (const def of GRID_STRUCTURE) {
      if (!def.parent_path || !def.edge_type) continue

      const fromId = pathToNodeId.get(def.parent_path)
      const toId = pathToNodeId.get(def.grid_path)
      if (!fromId || !toId) continue

      await this.db.execute(
        `INSERT INTO brain_edges (from_id, to_id, type, weight, source)
         VALUES ($1, $2, $3, 1.0, 'system')
         ON CONFLICT (from_id, to_id, type) DO NOTHING`,
        [fromId, toId, def.edge_type]
      )
    }

    // Third pass: seed subprograms table and their brain nodes
    for (const sp of SUBPROGRAM_DEFS) {
      const gridPath = `GRID/SYSTEM/subprograms/${sp.id}`

      // Upsert brain node
      const existing = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM brain_nodes WHERE grid_path = $1`,
        [gridPath]
      )

      let nodeId: string
      if (existing) {
        nodeId = existing.id
      } else {
        const inserted = await this.db.queryOne<{ id: string }>(
          `INSERT INTO brain_nodes (type, label, content, grid_path, grid_tier, grid_locked, confidence, source)
           VALUES ('subprogram', $1, $2, $3, 2, true, 1.0, 'system')
           RETURNING id`,
          [sp.label, sp.description, gridPath]
        )
        if (!inserted) throw new Error(`Failed to insert subprogram node: ${sp.id}`)
        nodeId = inserted.id
      }

      // Link to subprograms section node (GRID/SYSTEM/subprograms, seeded in first pass above)
      const subprogramsSectionId = pathToNodeId.get('GRID/SYSTEM/subprograms')
      if (subprogramsSectionId) {
        await this.db.execute(
          `INSERT INTO brain_edges (from_id, to_id, type, weight, source)
           VALUES ($1, $2, 'contains', 1.0, 'system')
           ON CONFLICT (from_id, to_id, type) DO NOTHING`,
          [subprogramsSectionId, nodeId]
        )
      }

      // Upsert subprograms registry entry
      await this.db.execute(
        `INSERT INTO subprograms (id, label, description, responsibility, brain_node_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
           SET label = EXCLUDED.label,
               description = EXCLUDED.description,
               responsibility = EXCLUDED.responsibility,
               brain_node_id = EXCLUDED.brain_node_id,
               updated_at = NOW()`,
        [sp.id, sp.label, sp.description, sp.responsibility, nodeId]
      )
    }

    console.log(`[GridSeeder] Seeded ${GRID_STRUCTURE.length} structural nodes and ${SUBPROGRAM_DEFS.length} subprograms.`)
  }
}
