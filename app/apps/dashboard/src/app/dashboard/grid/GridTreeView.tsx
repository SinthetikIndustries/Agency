// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState, useMemo } from 'react'
import type { GridGraphNode } from '@/lib/api'

// ─── Node type → color (hex string, matches GridGraph3D palette) ──────────────

const TYPE_COLOR: Record<string, string> = {
  'grid-root':         '#ffffff',
  'grid-system':       '#ef4444',
  'grid-programs':     '#6366f1',
  'grid-memory':       '#06b6d4',
  'grid-history':      '#f59e0b',
  'grid-interfaces':   '#10b981',
  'grid-views':        '#a855f7',
  'grid-state-models': '#64748b',
  'grid-archive':      '#374151',
  ctrl:                '#dc2626',
  'control-plane':     '#fca5a5',
  subprogram:          '#f97316',
  runtime:             '#fbd38d',
  program:             '#818cf8',
  zone:                '#a78bfa',
  'memory-tier':       '#22d3ee',
  'history-tier':      '#fde68a',
  'agent-config':      '#6d28d9',
  'config-file':       '#9333ea',
  system_program:      '#ef4444',
  agent:               '#6366f1',
  insight:             '#f59e0b',
  pattern:             '#10b981',
  concept:             '#3b82f6',
  fact:                '#8b5cf6',
  procedure:           '#ec4899',
  memory:              '#06b6d4',
  code:                '#84cc16',
}

function colorFor(type: string): string {
  return TYPE_COLOR[type] ?? '#6b7280'
}

// ─── Tree data structure ──────────────────────────────────────────────────────

interface TreeNode {
  segment: string
  fullPath: string
  node: GridGraphNode | null      // null = virtual path segment with no DB node
  children: Map<string, TreeNode>
}

function buildTree(nodes: GridGraphNode[]): TreeNode {
  const root: TreeNode = { segment: 'GRID', fullPath: 'GRID', node: null, children: new Map() }

  // Index nodes by grid_path for O(1) lookup
  const byPath = new Map<string, GridGraphNode>()
  for (const n of nodes) {
    if (n.grid_path) byPath.set(n.grid_path, n)
  }

  // Also attach the root node if it exists
  const rootNode = byPath.get('GRID')
  if (rootNode) root.node = rootNode

  for (const n of nodes) {
    if (!n.grid_path) continue
    const parts = n.grid_path.split('/')
    let cursor = root
    for (let i = 1; i < parts.length; i++) {
      const seg = parts[i]
      const pathSoFar = parts.slice(0, i + 1).join('/')
      if (!cursor.children.has(seg)) {
        cursor.children.set(seg, {
          segment: seg,
          fullPath: pathSoFar,
          node: byPath.get(pathSoFar) ?? null,
          children: new Map(),
        })
      }
      cursor = cursor.children.get(seg)!
    }
  }

  return root
}

// ─── Floating node list (no grid_path) ───────────────────────────────────────

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  treeNode: TreeNode
  depth: number
  onSelect: (id: string) => void
  defaultOpen?: boolean
}

function TreeRow({ treeNode, depth, onSelect, defaultOpen = false }: RowProps) {
  const hasChildren = treeNode.children.size > 0
  const [open, setOpen] = useState(defaultOpen)
  const n = treeNode.node
  const type = n?.type ?? 'virtual'
  const color = colorFor(type)

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer group
          hover:bg-gray-800 transition-colors select-none`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => {
          if (hasChildren) setOpen(o => !o)
          if (n) onSelect(n.id)
        }}
      >
        {/* Expand toggle */}
        <span className="w-3 flex-shrink-0 text-gray-600 text-[10px] font-mono">
          {hasChildren ? (open ? '▾' : '▸') : ' '}
        </span>

        {/* Color dot */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />

        {/* Label */}
        <span className="text-sm text-gray-200 truncate flex-1">
          {treeNode.segment}
        </span>

        {/* Meta: type + degree */}
        <span className="text-[11px] text-gray-600 flex-shrink-0 hidden group-hover:inline ml-2">
          {type}
          {n?.degree != null && n.degree > 0 && (
            <span className="ml-1.5 text-gray-700">{n.degree}e</span>
          )}
        </span>

        {/* Lock icon */}
        {n?.grid_locked && (
          <span className="text-[10px] text-gray-600 flex-shrink-0">🔒</span>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {Array.from(treeNode.children.values()).map(child => (
            <TreeRow
              key={child.fullPath}
              treeNode={child}
              depth={depth + 1}
              onSelect={onSelect}
              defaultOpen={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface GridTreeViewProps {
  nodes: GridGraphNode[]
  onNodeSelect: (id: string) => void
}

export function GridTreeView({ nodes, onNodeSelect }: GridTreeViewProps) {
  const [filter, setFilter] = useState('')

  const tree = useMemo(() => buildTree(nodes), [nodes])

  // Floating nodes (no grid_path)
  const floating = useMemo(
    () => nodes.filter(n => !n.grid_path),
    [nodes]
  )

  const filteredFloating = useMemo(() => {
    if (!filter) return floating
    const q = filter.toLowerCase()
    return floating.filter(n =>
      n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)
    )
  }, [floating, filter])

  // For filter: collect all nodes that match and highlight their paths
  const matchPaths = useMemo(() => {
    if (!filter) return null
    const q = filter.toLowerCase()
    const paths = new Set<string>()
    for (const n of nodes) {
      if (!n.grid_path) continue
      if (n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.grid_path.toLowerCase().includes(q)) {
        // Include all ancestor paths too
        const parts = n.grid_path.split('/')
        for (let i = 1; i <= parts.length; i++) {
          paths.add(parts.slice(0, i).join('/'))
        }
      }
    }
    return paths
  }, [filter, nodes])

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Grid is empty.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter nodes…"
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white
            placeholder-gray-600 outline-none focus:border-indigo-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-2 font-mono">
        {/* Rooted tree */}
        <FilteredTree
          root={tree}
          matchPaths={matchPaths}
          onSelect={onNodeSelect}
        />

        {/* Floating nodes */}
        {filteredFloating.length > 0 && (
          <div className="mt-4 px-4">
            <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-1">
              Unpathed ({filteredFloating.length})
            </p>
            {filteredFloating.map(n => (
              <div
                key={n.id}
                onClick={() => onNodeSelect(n.id)}
                className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-gray-800 cursor-pointer"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colorFor(n.type) }}
                />
                <span className="text-sm text-gray-300 truncate">{n.label}</span>
                <span className="text-[11px] text-gray-600 ml-auto">{n.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Filter-aware tree renderer ───────────────────────────────────────────────

function FilteredTree({
  root,
  matchPaths,
  onSelect,
}: {
  root: TreeNode
  matchPaths: Set<string> | null
  onSelect: (id: string) => void
}) {
  if (!matchPaths) {
    // No filter — render normally with top two levels expanded
    return (
      <TreeRow treeNode={root} depth={0} onSelect={onSelect} defaultOpen={true} />
    )
  }

  // With filter: only render nodes whose path is in matchPaths
  return (
    <FilteredRow treeNode={root} matchPaths={matchPaths} depth={0} onSelect={onSelect} />
  )
}

function FilteredRow({
  treeNode,
  matchPaths,
  depth,
  onSelect,
}: {
  treeNode: TreeNode
  matchPaths: Set<string>
  depth: number
  onSelect: (id: string) => void
}) {
  if (!matchPaths.has(treeNode.fullPath)) return null

  const visibleChildren = Array.from(treeNode.children.values()).filter(c =>
    matchPaths.has(c.fullPath)
  )

  const n = treeNode.node
  const type = n?.type ?? 'virtual'
  const color = colorFor(type)

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 px-2 rounded hover:bg-gray-800 cursor-pointer group"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => { if (n) onSelect(n.id) }}
      >
        <span className="w-3 flex-shrink-0 text-gray-600 text-[10px] font-mono">
          {visibleChildren.length > 0 ? '▾' : ' '}
        </span>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm text-gray-200 truncate flex-1">{treeNode.segment}</span>
        <span className="text-[11px] text-gray-600 flex-shrink-0 hidden group-hover:inline ml-2">
          {type}
        </span>
      </div>
      {visibleChildren.map(child => (
        <FilteredRow
          key={child.fullPath}
          treeNode={child}
          matchPaths={matchPaths}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
