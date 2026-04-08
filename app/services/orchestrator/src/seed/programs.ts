// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// ── Built-in program seed definitions ────────────────────────────────────────
// Each entry defines a system program that is seeded into agent_identities
// and agent_config_files on fresh installation via default.sql.
// Content for config files is intentionally left blank — authored separately.

export const CONFIG_FILE_TYPES = [
  'identity', 'soul', 'user', 'state', 'directives', 'decisions',
  'coordination', 'governance', 'memory', 'history', 'permissions',
  'profile', 'prompt', 'links', 'heartbeat', 'capabilities', 'scratch',
] as const

export type ConfigFileType = typeof CONFIG_FILE_TYPES[number]

export interface ProgramSeedDef {
  id: string
  name: string
  slug: string
  tier: 1 | 2 | 3
  gridPath: string           // grid_path for this program's brain node
  gridParentPath: string     // grid_path of parent node
  description: string        // brain node content summary
  lifecycleType: 'always_on' | 'dormant'
  shellPermissionLevel: 'none' | 'per_command' | 'session_only' | 'session_destructive' | 'full'
  agentManagementPermission: 'approval_required' | 'autonomous'
  schedule?: string          // cron expression for tier-2 workers
  scheduleEnabled?: boolean
}

export const BUILT_IN_PROGRAMS: ProgramSeedDef[] = [
  // ── Tier 1 ──────────────────────────────────────────────────────────────────
  {
    id: 'system',
    name: 'System',
    slug: 'system',
    tier: 1,
    gridPath: 'GRID/SYSTEM/SYST',
    gridParentPath: 'GRID/SYSTEM',
    description: 'Top program of the Agency installation. Highest governing system mind.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'full',
    agentManagementPermission: 'autonomous',
  },
  {
    id: 'ctrl',
    name: 'Control',
    slug: 'ctrl',
    tier: 1,
    gridPath: 'GRID/SYSTEM/CTRL',
    gridParentPath: 'GRID/SYSTEM',
    description: 'Central control authority. Routes work, arbitrates conflicts, enforces policy.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'full',
    agentManagementPermission: 'autonomous',
  },

  // ── Tier 2 ──────────────────────────────────────────────────────────────────
  {
    id: 'mon',
    name: 'Monitor',
    slug: 'mon',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/MON',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Observes system activity and conditions. Reports health status.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '*/5 * * * *',
    scheduleEnabled: true,
  },
  {
    id: 'comp',
    name: 'Compactor',
    slug: 'comp',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/COMP',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Compresses and summarizes episodic memory clusters to reduce noise over time.',
    lifecycleType: 'dormant',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '0 2 * * *',
    scheduleEnabled: false,
  },
  {
    id: 'indx',
    name: 'Indexer',
    slug: 'indx',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/INDX',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Organizes memory records and keeps vector index and lookup paths fresh.',
    lifecycleType: 'dormant',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '*/30 * * * *',
    scheduleEnabled: false,
  },
  {
    id: 'retr',
    name: 'Retriever',
    slug: 'retr',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/RETR',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Fetches relevant memory and history for program context assembly.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '* * * * *',
    scheduleEnabled: false,
  },
  {
    id: 'anly',
    name: 'Analyzer',
    slug: 'anly',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/ANLY',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Detects patterns, drift, and useful signals in history and memory.',
    lifecycleType: 'dormant',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '0 3 * * *',
    scheduleEnabled: false,
  },
  {
    id: 'secr',
    name: 'Security',
    slug: 'secr',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/SECR',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Enforces scope boundaries and system integrity checks.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '*/10 * * * *',
    scheduleEnabled: false,
  },
  {
    id: 'ward',
    name: 'Warden',
    slug: 'ward',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/WARD',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Governs canon truth. Reviews proposals, resolves conflicts, promotes approved knowledge.',
    lifecycleType: 'dormant',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '0 * * * *',
    scheduleEnabled: false,
  },
  {
    id: 'exec',
    name: 'Executor',
    slug: 'exec',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/EXEC',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Carries out approved system-level work delegated by CTRL.',
    lifecycleType: 'dormant',
    shellPermissionLevel: 'full',
    agentManagementPermission: 'autonomous',
    schedule: '* * * * *',
    scheduleEnabled: false,
  },
  {
    id: 'life',
    name: 'Lifecycle',
    slug: 'life',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/LIFE',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Handles aging, archival, and expiration of memory and runtime artifacts.',
    lifecycleType: 'dormant',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '0 1 * * *',
    scheduleEnabled: true,
  },
  {
    id: 'sens',
    name: 'Sensor',
    slug: 'sens',
    tier: 2,
    gridPath: 'GRID/SYSTEM/subprograms/SENS',
    gridParentPath: 'GRID/SYSTEM/subprograms',
    description: 'Ingests events, change signals, and external triggers into the Grid event stream.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
    schedule: '*/15 * * * *',
    scheduleEnabled: true,
  },

  // ── Tier 3 (built-in) ───────────────────────────────────────────────────────
  {
    id: 'main',
    name: 'Agent',
    slug: 'main',
    tier: 3,
    gridPath: 'GRID/PROGRAMS/PRIM',
    gridParentPath: 'GRID/PROGRAMS',
    description: 'Primary program. The default main assistant. The first program a user interacts with.',
    lifecycleType: 'always_on',
    shellPermissionLevel: 'none',
    agentManagementPermission: 'approval_required',
  },
]
