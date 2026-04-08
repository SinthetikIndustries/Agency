// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

export interface GridNodeDef {
  grid_path: string
  type: string
  label: string
  content: string
  grid_tier: number
  parent_path?: string
  edge_type?: string
}

export const GRID_STRUCTURE: GridNodeDef[] = [
  // ── Tier 1: Grid root and layers ─────────────────────────────────────────────
  { grid_path: 'GRID', type: 'grid-root', label: 'GRID', content: 'The entire Grid environment — the full operating world of the Agency system.', grid_tier: 1 },
  { grid_path: 'GRID/SYSTEM', type: 'grid-system', label: 'SYSTEM', content: 'Core system layer. Governs and sustains the Grid. Contains CTRL, control-plane, subprograms, and runtime.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/PROGRAMS', type: 'grid-programs', label: 'PROGRAMS', content: 'User-facing and user-created programs in the Grid. Contains PRIM, program instances, zones, and links.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/MEMORY', type: 'grid-memory', label: 'MEMORY', content: 'Interpreted knowledge layer. What the Grid retains. Organized by type and lifecycle status.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/HISTORY', type: 'grid-history', label: 'HISTORY', content: 'Recorded past. Append-only durable event record. Events, messages, decisions, approvals.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/INTERFACES', type: 'grid-interfaces', label: 'INTERFACES', content: 'Entry and exit surfaces. CLI, chat, dashboard, automation, external integrations.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/VIEWS', type: 'grid-views', label: 'VIEWS', content: 'Computed perspectives. Shaped representations of Grid state for different consumers.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/STATE-MODELS', type: 'grid-state-models', label: 'STATE-MODELS', content: 'Laws of motion. Formal object schemas, lifecycle state machines, traffic rules, promotion logic.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },
  { grid_path: 'GRID/ARCHIVE', type: 'grid-archive', label: 'ARCHIVE', content: 'Cold storage. Retained but inactive historical material.', grid_tier: 1, parent_path: 'GRID', edge_type: 'contains' },

  // ── Tier 2: SYSTEM sub-sections ──────────────────────────────────────────────
  { grid_path: 'GRID/SYSTEM/SYST', type: 'system_program', label: 'SYST', content: 'System program. Top program of the Agency installation.', grid_tier: 2, parent_path: 'GRID/SYSTEM', edge_type: 'contains' },
  { grid_path: 'GRID/SYSTEM/CTRL', type: 'ctrl', label: 'CTRL', content: 'Central control authority. Routes work, arbitrates conflicts, enforces policy, manages approvals.', grid_tier: 2, parent_path: 'GRID/SYSTEM', edge_type: 'contains' },
  { grid_path: 'GRID/SYSTEM/control-plane', type: 'control-plane', label: 'control-plane', content: 'Rules of the Grid. Authority hierarchy, permissions, routing rules, governance policy.', grid_tier: 2, parent_path: 'GRID/SYSTEM', edge_type: 'contains' },
  { grid_path: 'GRID/SYSTEM/subprograms', type: 'runtime', label: 'subprograms', content: 'System worker program registry. All background workers that maintain Grid integrity.', grid_tier: 2, parent_path: 'GRID/SYSTEM', edge_type: 'contains' },
  { grid_path: 'GRID/SYSTEM/runtime', type: 'runtime', label: 'runtime', content: 'Live system execution. Active processes, queues, sessions, triggers, approvals, and locks.', grid_tier: 2, parent_path: 'GRID/SYSTEM', edge_type: 'contains' },

  // ── Tier 2: PROGRAMS sub-sections ────────────────────────────────────────────
  { grid_path: 'GRID/PROGRAMS/PRIM', type: 'program', label: 'PRIM', content: 'Primary program. The default main assistant. The first program a user interacts with.', grid_tier: 2, parent_path: 'GRID/PROGRAMS', edge_type: 'contains' },
  { grid_path: 'GRID/PROGRAMS/instances', type: 'program', label: 'instances', content: 'Additional program instances. User-created or system-created programs beyond PRIM.', grid_tier: 2, parent_path: 'GRID/PROGRAMS', edge_type: 'contains' },
  { grid_path: 'GRID/PROGRAMS/ZONES', type: 'zone', label: 'ZONES', content: 'Shared operating environments. Bounded spaces where multiple programs can interact.', grid_tier: 2, parent_path: 'GRID/PROGRAMS', edge_type: 'contains' },

  // ── Tier 2: MEMORY sub-sections ───────────────────────────────────────────────
  { grid_path: 'GRID/MEMORY/working', type: 'memory-tier', label: 'working', content: 'Short-term active memory. Immediate live context for the current session.', grid_tier: 2, parent_path: 'GRID/MEMORY', edge_type: 'contains' },
  { grid_path: 'GRID/MEMORY/episodic', type: 'memory-tier', label: 'episodic', content: 'Experience memory. Events and interactions stored with temporal context.', grid_tier: 2, parent_path: 'GRID/MEMORY', edge_type: 'contains' },
  { grid_path: 'GRID/MEMORY/semantic/canon', type: 'memory-tier', label: 'semantic/canon', content: 'Approved truth. Trusted, stable system knowledge that has passed WARD review.', grid_tier: 2, parent_path: 'GRID/MEMORY', edge_type: 'contains' },
  { grid_path: 'GRID/MEMORY/semantic/proposals', type: 'memory-tier', label: 'semantic/proposals', content: 'Candidate truth. Unapproved semantic knowledge awaiting WARD review.', grid_tier: 2, parent_path: 'GRID/MEMORY', edge_type: 'contains' },
  { grid_path: 'GRID/MEMORY/procedural', type: 'memory-tier', label: 'procedural', content: 'How-to memory. Workflows, rules, and operational knowledge.', grid_tier: 2, parent_path: 'GRID/MEMORY', edge_type: 'contains' },
  { grid_path: 'GRID/MEMORY/reflective', type: 'memory-tier', label: 'reflective', content: 'Learning memory. Lessons, evaluations, and adaptations derived from experience.', grid_tier: 2, parent_path: 'GRID/MEMORY', edge_type: 'contains' },

  // ── Tier 2: HISTORY sub-sections ──────────────────────────────────────────────
  { grid_path: 'GRID/HISTORY/events', type: 'history-tier', label: 'events', content: 'System events. Important actions and occurrences recorded by SENS.', grid_tier: 2, parent_path: 'GRID/HISTORY', edge_type: 'contains' },
  { grid_path: 'GRID/HISTORY/decisions', type: 'history-tier', label: 'decisions', content: 'Decision history. Major rulings and outcomes from CTRL and programs.', grid_tier: 2, parent_path: 'GRID/HISTORY', edge_type: 'contains' },
  { grid_path: 'GRID/HISTORY/approvals', type: 'history-tier', label: 'approvals', content: 'Approval history. What was allowed, denied, or escalated, and by whom.', grid_tier: 2, parent_path: 'GRID/HISTORY', edge_type: 'contains' },
]
