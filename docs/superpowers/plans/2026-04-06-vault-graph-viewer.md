# Vault Graph Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Obsidian with a native in-dashboard vault viewer: a ReactFlow graph of document entities and wikilinks, a slide-in Markdown editor for editing vault files, and a file browser — all built into the Agency dashboard.

**Architecture:** Three new backend endpoints provide graph data and file CRUD. The vault page is refactored into a tabbed view (Graph / Files / Status). A `VaultGraph` ReactFlow component renders the knowledge graph; clicking a node opens a `MarkdownEditorPanel` slide-in. Obsidian is removed from the codebase entirely.

**Tech Stack:** `@xyflow/react` (already used for other canvases), `@uiw/react-md-editor` (Markdown editor with preview), Fastify (backend routes), PostgreSQL (`vault_entities`, `vault_links`, `vault_documents` tables).

---

## Key Schema Facts (read before implementing)

```sql
-- vault_documents: id UUID, path TEXT (relative to vaultPath), raw_markdown TEXT, type TEXT, status TEXT
-- vault_entities:  entity_id UUID, document_id UUID FK→vault_documents.id, entity_type TEXT, name TEXT
-- vault_links:     id UUID, from_id UUID FK→vault_entities.entity_id, to_id UUID (nullable), link_type TEXT
```

The `path` column in `vault_documents` is relative to the vault root (e.g. `canon/agents/main.md`). `vault_entities` has exactly one row per document (`UNIQUE(document_id)`). `vault_links.to_id` is NULL for unresolved wikilinks (targets that don't exist yet as documents).

---

## Files To Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/apps/gateway/src/vault-routes.ts` | Modify | Add `/vault/graph`, `/vault/files`, `/vault/file` GET+PUT; add `vaultPath` to options |
| `app/apps/gateway/src/index.ts` | Modify | Pass `vaultPath` to `registerVaultRoutes` |
| `app/apps/dashboard/src/lib/api.ts` | Modify | Add `vault.graph()`, `vault.files()`, `vault.getFile()`, `vault.saveFile()` |
| `app/apps/dashboard/src/app/dashboard/vault/VaultGraph.tsx` | Create | ReactFlow graph: entity nodes + wikilink edges |
| `app/apps/dashboard/src/app/dashboard/vault/MarkdownEditorPanel.tsx` | Create | Slide-in panel with @uiw/react-md-editor + save |
| `app/apps/dashboard/src/app/dashboard/vault/page.tsx` | Modify | Tabbed: Graph / Files / Status; wires graph → editor |
| `cli/src/commands/install.ts` | Modify | Remove `setupObsidianVault` call and the function itself |
| `README.md` | Modify | Remove Obsidian references, describe built-in vault viewer |
| `installation/config.example.json` | Modify | Remove any Obsidian notes |

---

## Task 1: Backend — Vault Graph Data Endpoint

**File:** `app/apps/gateway/src/vault-routes.ts`

Add `vaultPath: string` to `VaultRouteOptions`, then add `GET /vault/graph`.

- [ ] **Step 1: Update VaultRouteOptions interface**

Find the existing interface:
```typescript
interface VaultRouteOptions {
  db: DatabaseClient
  vaultSync: VaultSync | null
}
```
Change to:
```typescript
interface VaultRouteOptions {
  db: DatabaseClient
  vaultSync: VaultSync | null
  vaultPath: string
}
```
Update the destructure inside `registerVaultRoutes`:
```typescript
const { db, vaultSync, vaultPath } = opts
```

- [ ] **Step 2: Add `GET /vault/graph` route**

Add after the existing `GET /vault/graph-status` route:
```typescript
// GET /vault/graph — full graph payload for dashboard visualization
app.get('/vault/graph', async (_req, reply) => {
  const entityRows = await db.query<{
    entity_id: string
    entity_type: string
    name: string
    doc_path: string
    doc_status: string
  }>(
    `SELECT ve.entity_id, ve.entity_type, ve.name,
            vd.path AS doc_path, vd.status AS doc_status
     FROM vault_entities ve
     JOIN vault_documents vd ON vd.id = ve.document_id
     WHERE vd.status = 'active'
     ORDER BY ve.entity_type, ve.name`
  )

  const linkRows = await db.query<{
    from_id: string
    to_id: string
  }>(
    `SELECT from_id, to_id
     FROM vault_links
     WHERE to_id IS NOT NULL
       AND link_type = 'wikilink'`
  )

  const nodes = entityRows.map(r => ({
    id: r.entity_id,
    label: r.name,
    type: r.entity_type,
    path: r.doc_path,
  }))

  const edges = linkRows.map(r => ({
    id: `${r.from_id}-${r.to_id}`,
    source: r.from_id,
    target: r.to_id,
  }))

  return reply.send({ nodes, edges })
})
```

- [ ] **Step 3: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/services/model-router && cd ../../apps/gateway && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/gateway/src/vault-routes.ts
git commit -m "feat(vault): add GET /vault/graph endpoint"
```

---

## Task 2: Backend — File CRUD Endpoints

**File:** `app/apps/gateway/src/vault-routes.ts`

Add `GET /vault/files`, `GET /vault/file`, and `PUT /vault/file`. File reads serve `raw_markdown` from the DB (fast); file writes go directly to disk so vault-sync picks them up via chokidar.

- [ ] **Step 1: Add `GET /vault/files` route**

Add after `GET /vault/graph`:
```typescript
// GET /vault/files — list all active vault documents
app.get('/vault/files', async (_req, reply) => {
  const rows = await db.query<{
    id: string
    path: string
    type: string
    status: string
    updated_at: string
  }>(
    `SELECT id, path, type, status, updated_at
     FROM vault_documents
     WHERE status = 'active'
     ORDER BY path ASC`
  )
  return reply.send({ files: rows })
})
```

- [ ] **Step 2: Add `GET /vault/file` route**

```typescript
// GET /vault/file?path=canon/agents/main.md — read raw markdown
app.get('/vault/file', async (request, reply) => {
  const { path: filePath } = request.query as { path?: string }
  if (!filePath) return reply.status(400).send({ error: 'path required' })

  // Security: ensure resolved path stays within vaultPath
  const { resolve, join } = await import('node:path')
  const safePath = resolve(join(vaultPath, filePath))
  if (!safePath.startsWith(resolve(vaultPath))) {
    return reply.status(400).send({ error: 'Invalid path' })
  }

  const row = await db.queryOne<{ raw_markdown: string; type: string; updated_at: string }>(
    `SELECT raw_markdown, type, updated_at FROM vault_documents WHERE path = $1`,
    [filePath]
  )
  if (!row) return reply.status(404).send({ error: 'File not found' })

  return reply.send({ path: filePath, content: row.raw_markdown, type: row.type, updatedAt: row.updated_at })
})
```

- [ ] **Step 3: Add `PUT /vault/file` route**

```typescript
// PUT /vault/file — write markdown content to disk (vault-sync re-indexes automatically)
app.put('/vault/file', async (request, reply) => {
  const { path: filePath, content } = request.body as { path?: string; content?: string }
  if (!filePath || content === undefined) {
    return reply.status(400).send({ error: 'path and content required' })
  }

  // Security: ensure resolved path stays within vaultPath
  const { resolve, join, dirname } = await import('node:path')
  const safePath = resolve(join(vaultPath, filePath))
  if (!safePath.startsWith(resolve(vaultPath))) {
    return reply.status(400).send({ error: 'Invalid path' })
  }

  const { writeFile, mkdir } = await import('node:fs/promises')
  await mkdir(dirname(safePath), { recursive: true })
  await writeFile(safePath, content, 'utf8')

  return reply.send({ ok: true, path: filePath })
})
```

- [ ] **Step 4: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/apps/gateway && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/gateway/src/vault-routes.ts
git commit -m "feat(vault): add GET /vault/files, GET /vault/file, PUT /vault/file endpoints"
```

---

## Task 3: Gateway — Pass vaultPath to registerVaultRoutes

**File:** `app/apps/gateway/src/index.ts`

Find line 725:
```typescript
await app.register(registerVaultRoutes, { db, vaultSync })
```
Change to:
```typescript
await app.register(registerVaultRoutes, { db, vaultSync, vaultPath })
```

`vaultPath` is already in scope at that point (declared around line 275).

- [ ] **Step 1: Make the change** (one-line edit as shown above)

- [ ] **Step 2: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/apps/gateway && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/gateway/src/index.ts
git commit -m "feat(vault): pass vaultPath to vault routes for file CRUD"
```

---

## Task 4: Dashboard — API Client

**File:** `app/apps/dashboard/src/lib/api.ts`

Find the existing `vault` object (around line 479):
```typescript
export const vault = {
  status: () => request<VaultStatus>('/vault/status'),
  sync: () => request<{ message: string }>('/vault/sync', { method: 'POST' }),
  graphStatus: () =>
    request<{ nodes: number; edges: number; unresolvedLinks: number }>('/vault/graph-status'),
}
```

Replace with:
```typescript
export interface VaultGraphNode {
  id: string
  label: string
  type: string
  path: string
}

export interface VaultGraphEdge {
  id: string
  source: string
  target: string
}

export interface VaultFile {
  id: string
  path: string
  type: string
  status: string
  updated_at: string
}

export const vault = {
  status: () => request<VaultStatus>('/vault/status'),
  sync: () => request<{ message: string }>('/vault/sync', { method: 'POST' }),
  graphStatus: () =>
    request<{ nodes: number; edges: number; unresolvedLinks: number }>('/vault/graph-status'),
  graph: () =>
    request<{ nodes: VaultGraphNode[]; edges: VaultGraphEdge[] }>('/vault/graph'),
  files: () =>
    request<{ files: VaultFile[] }>('/vault/files'),
  getFile: (path: string) =>
    request<{ path: string; content: string; type: string; updatedAt: string }>(
      `/vault/file?path=${encodeURIComponent(path)}`
    ),
  saveFile: (path: string, content: string) =>
    request<{ ok: boolean; path: string }>('/vault/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }),
}
```

- [ ] **Step 1: Make the change** (replace vault object and add interfaces above it)

- [ ] **Step 2: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/apps/dashboard && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/lib/api.ts
git commit -m "feat(vault): add graph, files, getFile, saveFile API client methods"
```

---

## Task 5: Install @uiw/react-md-editor

**Directory:** `app/apps/dashboard`

- [ ] **Step 1: Install the package**
```bash
cd /home/sinthetix/Agency/app
pnpm --filter dashboard add @uiw/react-md-editor
```

- [ ] **Step 2: Verify no peer dep warnings and dashboard still builds**
```bash
cd /home/sinthetix/Agency/app/apps/dashboard && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/package.json app/pnpm-lock.yaml
git commit -m "chore(dashboard): add @uiw/react-md-editor dependency"
```

---

## Task 6: VaultGraph Component

**File:** `app/apps/dashboard/src/app/dashboard/vault/VaultGraph.tsx` (create)

ReactFlow graph. Nodes are colored by `entity_type`. Clicking a node calls `onNodeClick`. Layout uses a simple left-to-right dagre-like placement (or relies on ReactFlow's built-in force-directed positioning via initial positions).

Note: The dashboard already has `@xyflow/react` installed and uses shared canvas components from `@/components/canvas/`. Check what's available there, but VaultGraph is standalone to keep it focused.

- [ ] **Step 1: Create the component**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import '@xyflow/react/dist/style.css'
import { useCallback, useEffect } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react'
import type { VaultGraphNode, VaultGraphEdge } from '@/lib/api'

// ─── Colours by entity type ──────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  agent:    '#6366f1', // indigo
  client:   '#10b981', // emerald
  project:  '#f59e0b', // amber
  policy:   '#ef4444', // red
  sop:      '#8b5cf6', // violet
  person:   '#3b82f6', // blue
  document: '#6b7280', // gray
}

function colorFor(type: string): string {
  return TYPE_COLORS[type] ?? TYPE_COLORS.document
}

// ─── Layout ─────────────────────────────────────────────────────────────────

function buildLayout(
  graphNodes: VaultGraphNode[],
  graphEdges: VaultGraphEdge[]
): { nodes: Node[]; edges: Edge[] } {
  // Simple grid layout — place nodes in rows of 8, spaced 220×120px
  const COLS = 8
  const COL_W = 220
  const ROW_H = 120

  const nodes: Node[] = graphNodes.map((n, i) => ({
    id: n.id,
    position: { x: (i % COLS) * COL_W, y: Math.floor(i / COLS) * ROW_H },
    data: { label: n.label, entityType: n.type, path: n.path },
    style: {
      background: colorFor(n.type),
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '11px',
      padding: '6px 10px',
      maxWidth: '180px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      cursor: 'pointer',
    },
  }))

  const edges: Edge[] = graphEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    style: { stroke: '#374151', strokeWidth: 1.5 },
    animated: false,
  }))

  return { nodes, edges }
}

// ─── Inner component (needs ReactFlowProvider) ────────────────────────────────

interface VaultGraphInnerProps {
  graphNodes: VaultGraphNode[]
  graphEdges: VaultGraphEdge[]
  onNodeClick: (node: { id: string; label: string; path: string; type: string }) => void
}

function VaultGraphInner({ graphNodes, graphEdges, onNodeClick }: VaultGraphInnerProps) {
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const { nodes: n, edges: e } = buildLayout(graphNodes, graphEdges)
    setNodes(n)
    setEdges(e)
    setTimeout(() => fitView({ padding: 0.1 }), 50)
  }, [graphNodes, graphEdges, setNodes, setEdges, fitView])

  const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    onNodeClick({
      id: node.id,
      label: node.data.label as string,
      path: node.data.path as string,
      type: node.data.entityType as string,
    })
  }, [onNodeClick])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      fitView
      minZoom={0.1}
      maxZoom={2}
      className="bg-gray-950"
    >
      <Background color="#1f2937" gap={20} />
      <Controls className="[&>button]:bg-gray-800 [&>button]:border-gray-700 [&>button]:text-gray-300" />
      <MiniMap
        nodeColor={n => colorFor((n.data?.entityType as string) ?? 'document')}
        maskColor="rgba(0,0,0,0.6)"
        className="bg-gray-900 border-gray-700"
      />
    </ReactFlow>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="absolute bottom-4 left-4 bg-gray-900/90 border border-gray-800 rounded-lg p-3 flex flex-wrap gap-2 z-10 max-w-xs">
      {Object.entries(TYPE_COLORS).map(([type, color]) => (
        <div key={type} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="text-xs text-gray-400 capitalize">{type}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────

interface VaultGraphProps {
  graphNodes: VaultGraphNode[]
  graphEdges: VaultGraphEdge[]
  onNodeClick: (node: { id: string; label: string; path: string; type: string }) => void
  className?: string
}

export function VaultGraph({ graphNodes, graphEdges, onNodeClick, className }: VaultGraphProps) {
  if (graphNodes.length === 0) {
    return (
      <div className={`flex items-center justify-center text-gray-600 text-sm ${className ?? ''}`}>
        No documents in vault yet. Add Markdown files to <code className="font-mono text-xs mx-1">~/.agency/vault/</code> to get started.
      </div>
    )
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <ReactFlowProvider>
        <VaultGraphInner
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          onNodeClick={onNodeClick}
        />
      </ReactFlowProvider>
      <Legend />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/apps/dashboard && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/app/dashboard/vault/VaultGraph.tsx
git commit -m "feat(vault): add VaultGraph ReactFlow component"
```

---

## Task 7: MarkdownEditorPanel Component

**File:** `app/apps/dashboard/src/app/dashboard/vault/MarkdownEditorPanel.tsx` (create)

A slide-in right panel (not a blocking modal) with `@uiw/react-md-editor`. Width is ~50% of the viewport. Appears over the graph when a node is clicked.

- [ ] **Step 1: Create the component**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { vault } from '@/lib/api'

// @uiw/react-md-editor uses browser-only APIs — must be dynamically imported
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

interface MarkdownEditorPanelProps {
  filePath: string | null       // null = panel closed
  fileLabel: string
  onClose: () => void
  onSaved?: () => void          // called after a successful save (e.g. to refresh graph)
}

export function MarkdownEditorPanel({
  filePath,
  fileLabel,
  onClose,
  onSaved,
}: MarkdownEditorPanelProps) {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  // Load file content whenever filePath changes
  useEffect(() => {
    if (!filePath) return
    setLoading(true)
    setError('')
    setSaveMsg('')
    vault.getFile(filePath)
      .then(res => {
        setContent(res.content)
        setOriginal(res.content)
      })
      .catch(() => setError('Failed to load file'))
      .finally(() => setLoading(false))
  }, [filePath])

  const handleSave = useCallback(async () => {
    if (!filePath) return
    setSaving(true)
    setError('')
    setSaveMsg('')
    try {
      await vault.saveFile(filePath, content)
      setOriginal(content)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
      onSaved?.()
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }, [filePath, content, onSaved])

  const isDirty = content !== original

  if (!filePath) return null

  return (
    <>
      {/* Backdrop — click to close if not dirty */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => { if (!isDirty) onClose() }}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-1/2 min-w-[480px] max-w-3xl z-50 flex flex-col bg-gray-950 border-l border-gray-800 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white truncate">{fileLabel}</span>
            <span className="text-xs text-gray-500 truncate font-mono">{filePath}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors p-1"
              title={isDirty ? 'Unsaved changes' : 'Close'}
            >
              {isDirty ? (
                <span className="text-xs text-yellow-400 px-1">✕ (unsaved)</span>
              ) : (
                <span className="text-lg leading-none">✕</span>
              )}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden" data-color-mode="dark">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <MDEditor
              value={content}
              onChange={v => setContent(v ?? '')}
              height="100%"
              visibleDragbar={false}
              preview="edit"
              style={{
                backgroundColor: '#030712',
                borderRadius: 0,
                border: 'none',
                height: '100%',
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/apps/dashboard && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/app/dashboard/vault/MarkdownEditorPanel.tsx
git commit -m "feat(vault): add MarkdownEditorPanel slide-in component"
```

---

## Task 8: Vault Page Refactor

**File:** `app/apps/dashboard/src/app/dashboard/vault/page.tsx` (replace entirely)

Tabbed layout: **Graph** (default) / **Files** / **Status**. Graph tab shows `VaultGraph` with `MarkdownEditorPanel` wired up. Files tab shows a list of all vault documents with click-to-edit. Status tab holds the existing sync/status controls.

- [ ] **Step 1: Replace the entire vault page**

```typescript
// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import { vault, type VaultStatus, type VaultGraphNode, type VaultGraphEdge, type VaultFile } from '@/lib/api'
import { VaultGraph } from './VaultGraph'
import { MarkdownEditorPanel } from './MarkdownEditorPanel'

type Tab = 'graph' | 'files' | 'status'

interface GraphStatus {
  nodes: number
  edges: number
  unresolvedLinks: number
}

interface SelectedNode {
  id: string
  label: string
  path: string
  type: string
}

export default function VaultPage() {
  const [tab, setTab] = useState<Tab>('graph')

  // Graph data
  const [graphNodes, setGraphNodes] = useState<VaultGraphNode[]>([])
  const [graphEdges, setGraphEdges] = useState<VaultGraphEdge[]>([])
  const [graphLoading, setGraphLoading] = useState(true)

  // Files list
  const [files, setFiles] = useState<VaultFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  // Status tab
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [graphStatus, setGraphStatus] = useState<GraphStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncError, setSyncError] = useState('')

  // Editor panel
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)

  // ─── Load graph ───────────────────────────────────────────────────────────

  const loadGraph = useCallback(async () => {
    setGraphLoading(true)
    try {
      const data = await vault.graph()
      setGraphNodes(data.nodes)
      setGraphEdges(data.edges)
    } catch {
      // vault not enabled or no documents yet — leave empty
    } finally {
      setGraphLoading(false)
    }
  }, [])

  useEffect(() => { void loadGraph() }, [loadGraph])

  // ─── Load files ───────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const data = await vault.files()
      setFiles(data.files)
    } catch {
      setFiles([])
    } finally {
      setFilesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'files' && files.length === 0) void loadFiles()
  }, [tab, files.length, loadFiles])

  // ─── Load status ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'status') return
    Promise.all([
      vault.status().then(setStatus).catch(() => {}),
      vault.graphStatus().then(setGraphStatus).catch(() => {}),
    ])
  }, [tab])

  // ─── Sync ─────────────────────────────────────────────────────────────────

  async function triggerSync() {
    setSyncing(true)
    setSyncError('')
    try {
      const res = await vault.sync()
      setSyncMsg(res.message)
      void loadGraph()
    } catch {
      setSyncError('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // ─── Editor ───────────────────────────────────────────────────────────────

  function openEditor(node: SelectedNode) {
    setSelectedNode(node)
  }

  function openEditorFromFile(file: VaultFile) {
    setSelectedNode({
      id: file.id,
      label: file.path.split('/').pop()?.replace(/\.md$/i, '') ?? file.path,
      path: file.path,
      type: file.type ?? 'document',
    })
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Vault</h1>
          <p className="text-sm text-gray-500 mt-1">Knowledge base</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void triggerSync()}
            disabled={syncing}
            className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 px-4 py-2 rounded transition-colors"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-8 flex-shrink-0 border-b border-gray-800">
        {(['graph', 'files', 'status'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">

        {/* ── Graph tab ── */}
        {tab === 'graph' && (
          graphLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Loading graph…
            </div>
          ) : (
            <VaultGraph
              graphNodes={graphNodes}
              graphEdges={graphEdges}
              onNodeClick={openEditor}
              className="w-full h-full"
            />
          )
        )}

        {/* ── Files tab ── */}
        {tab === 'files' && (
          <div className="p-8 overflow-y-auto h-full">
            {filesLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-gray-600">No documents found. Add Markdown files to <code className="font-mono text-xs">~/.agency/vault/</code>.</p>
            ) : (
              <div className="space-y-1">
                {files.map(f => (
                  <button
                    key={f.id}
                    onClick={() => openEditorFromFile(f)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-800 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 group-hover:bg-gray-700 text-gray-400 capitalize flex-shrink-0">
                        {f.type ?? 'doc'}
                      </span>
                      <span className="text-sm text-gray-300 font-mono truncate">{f.path}</span>
                    </div>
                    <span className="text-xs text-gray-600 flex-shrink-0 ml-4">{formatDate(f.updated_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Status tab ── */}
        {tab === 'status' && (
          <div className="p-8 overflow-y-auto h-full">
            {syncError && <p className="text-sm text-red-400 mb-4">{syncError}</p>}
            {syncMsg && <p className="text-sm text-green-400 mb-4">{syncMsg}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h2 className="text-sm font-medium text-gray-300 mb-4">Sync Status</h2>
                <div className="space-y-3">
                  <Row label="Enabled" value={
                    <span className={status?.enabled ? 'text-green-400' : 'text-gray-500'}>
                      {status?.enabled ? 'Yes' : 'No'}
                    </span>
                  } />
                  <Row label="Documents" value={<span className="text-white">{status?.documentCount ?? '—'}</span>} />
                  <Row label="Errors" value={
                    <span className={status?.errorCount ? 'text-red-400' : 'text-gray-400'}>
                      {status?.errorCount ?? 0}
                    </span>
                  } />
                  <Row label="Last sync" value={
                    <span className="text-gray-400 text-xs">
                      {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '—'}
                    </span>
                  } />
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h2 className="text-sm font-medium text-gray-300 mb-4">Knowledge Graph</h2>
                {graphStatus ? (
                  <div className="space-y-3">
                    <Row label="Nodes" value={<span className="text-white">{graphStatus.nodes}</span>} />
                    <Row label="Edges" value={<span className="text-white">{graphStatus.edges}</span>} />
                    <Row label="Unresolved links" value={
                      <span className={graphStatus.unresolvedLinks > 0 ? 'text-yellow-400' : 'text-gray-400'}>
                        {graphStatus.unresolvedLinks}
                      </span>
                    } />
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Graph unavailable</p>
                )}
              </div>
            </div>
            {!status?.enabled && (
              <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4 mt-4">
                <p className="text-sm text-yellow-400">
                  Vault is disabled. Run <code className="font-mono text-xs">agency vault init --path &lt;dir&gt;</code> to enable it.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor panel — renders over the page */}
      <MarkdownEditorPanel
        filePath={selectedNode?.path ?? null}
        fileLabel={selectedNode?.label ?? ''}
        onClose={() => setSelectedNode(null)}
        onSaved={() => void loadGraph()}
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/app/apps/dashboard && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**
```bash
cd /home/sinthetix/Agency
git add app/apps/dashboard/src/app/dashboard/vault/page.tsx
git commit -m "feat(vault): refactor vault page — Graph/Files/Status tabs with graph viewer and editor"
```

---

## Task 9: Remove Obsidian

**Files:** `cli/src/commands/install.ts`, `README.md`, `installation/config.example.json`

### 9a — Remove from install.ts

- [ ] **Step 1: Find and delete `setupObsidianVault` function**

The function starts around line 615. Find it and delete the entire function (signature + body). It starts with:
```typescript
export async function setupObsidianVault(
```

- [ ] **Step 2: Find and delete the call site**

Around line 915:
```typescript
const obsidianConfigPath = join(homedir(), '.config', 'obsidian', 'obsidian.json')
// ...
await setupObsidianVault(vaultPath, obsidianConfigPath)
```
Delete these lines. Remove any related variables that are now unused.

- [ ] **Step 3: Verify TypeScript**
```bash
cd /home/sinthetix/Agency/cli && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**
```bash
cd /home/sinthetix/Agency
git add cli/src/commands/install.ts
git commit -m "feat(vault): remove Obsidian registration — vault viewer is now built into the dashboard"
```

### 9b — Update README.md

- [ ] **Step 5: Remove/update Obsidian references in README**

Find and update these sections:
1. The `What is Agency?` paragraph — remove mention of Obsidian, replace with: "Your agents maintain **persistent memory** across all sessions — stored in PostgreSQL with vector embeddings for semantic retrieval, and browsable through the built-in vault graph viewer in the dashboard."
2. Features table row for Structured knowledge base — remove Obsidian mention, describe the built-in viewer
3. Install steps — remove step 7 about setting up Obsidian vault
4. Configuration table — change `~/.agency/vault/` description from "Obsidian vault" to "Agent knowledge base"
5. Status checklist — update vault/knowledge base entry

- [ ] **Step 6: Update installation/config.example.json**

Remove any Obsidian-related comments or notes.

- [ ] **Step 7: Commit**
```bash
cd /home/sinthetix/Agency
git add README.md installation/config.example.json
git commit -m "docs: remove Obsidian references — vault viewer is now built into the dashboard"
```

---

## Task 10: Full Build Verification + Push

- [ ] **Step 1: TypeScript check across all packages**
```bash
cd /home/sinthetix/Agency/app/apps/gateway && npx tsc --noEmit && echo "gateway OK"
cd /home/sinthetix/Agency/app/apps/dashboard && npx tsc --noEmit && echo "dashboard OK"
cd /home/sinthetix/Agency/cli && npx tsc --noEmit && echo "cli OK"
```
Expected: all three print OK

- [ ] **Step 2: Verify no remaining Obsidian references in source**
```bash
grep -r "obsidian\|Obsidian" /home/sinthetix/Agency/cli/src/ /home/sinthetix/Agency/app/apps/ --include="*.ts" --include="*.tsx"
```
Expected: no output

- [ ] **Step 3: Push**
```bash
cd /home/sinthetix/Agency && git push origin main
```

---

## Open Questions to Discuss Before Execution

1. **Graph layout:** The plan uses a simple grid layout as a starting point. A force-directed layout (using `@xyflow/react` with physics) or a hierarchical layout (using `dagre`) would look better for large vaults. `dagre` requires installing `@dagrejs/dagre`. Worth it?

2. **Editor height:** The vault page uses `h-full` on the tab container. This requires the dashboard layout to give the vault page a fixed height (not scroll). Check `app/apps/dashboard/src/app/dashboard/layout.tsx` — if the layout is `overflow-y-auto`, the graph canvas may not get the height it needs.

3. **New file creation:** The plan covers editing existing files only. Do you want a "New file" button in the Files tab that creates a blank `.md` file at a user-specified path?

4. **Frontmatter stripping in editor:** Some vault files may have YAML frontmatter (`---\n...\n---`). The editor will show it raw, which is fine for power users. Want a "metadata" panel that parses and surfaces frontmatter fields separately?

5. **vault_documents.path vs vault-routes `relative_path`:** The existing `/vault/search` and `/vault/related` endpoints select `relative_path` from `vault_documents`, but the actual column name is `path`. These may be broken today. The new endpoints in this plan use `path` (correct). Worth fixing the old endpoints in the same PR?
