// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import * as THREE from 'three'
import type { ForceGraphMethods } from 'react-force-graph-3d'
import type { BrainGraphNode, BrainEdge } from '@/lib/api'

// Dynamic import — Three.js is browser-only, large bundle
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
      Initialising Brain…
    </div>
  ),
})

// ─── Node type → brain region + color ────────────────────────────────────────

const NODE_CONFIG: Record<string, { color: number; region: { x: number; y: number; z: number } }> = {
  // ── Existing types ────────────────────────────────────────────────────────
  agent:     { color: 0x6366f1, region: { x: 0,    y: 120,  z: 0    } },
  insight:   { color: 0xf59e0b, region: { x: -120, y: 80,   z: -80  } },
  pattern:   { color: 0x10b981, region: { x: 120,  y: 80,   z: -80  } },
  concept:   { color: 0x3b82f6, region: { x: -150, y: 0,    z: 0    } },
  fact:      { color: 0x8b5cf6, region: { x: 150,  y: 0,    z: 0    } },
  procedure: { color: 0xec4899, region: { x: 0,    y: 40,   z: 160  } },
  memory:    { color: 0x06b6d4, region: { x: 0,    y: -40,  z: -160 } },
  code:      { color: 0x84cc16, region: { x: 0,    y: -120, z: 0    } },

  // ── Grid tier-1: layers ───────────────────────────────────────────────────
  'grid-root':         { color: 0xffffff, region: { x: 0,    y: 0,    z: 0    } },
  'grid-system':       { color: 0xef4444, region: { x: 0,    y: 350,  z: 0    } },
  'grid-programs':     { color: 0x6366f1, region: { x: -250, y: 180,  z: 0    } },
  'grid-memory':       { color: 0x06b6d4, region: { x: 0,    y: -50,  z: 320  } },
  'grid-history':      { color: 0xf59e0b, region: { x: 320,  y: 50,   z: 0    } },
  'grid-interfaces':   { color: 0x10b981, region: { x: 0,    y: -300, z: 0    } },
  'grid-views':        { color: 0xa855f7, region: { x: -180, y: -120, z: -220 } },
  'grid-state-models': { color: 0x64748b, region: { x: 180,  y: 50,   z: -220 } },
  'grid-archive':      { color: 0x374151, region: { x: -150, y: -180, z: 220  } },

  // ── Grid tier-2: sections ─────────────────────────────────────────────────
  'ctrl':          { color: 0xdc2626, region: { x: 0,    y: 420,  z: 0    } },
  'control-plane': { color: 0xfca5a5, region: { x: -80,  y: 370,  z: 0    } },
  'subprogram':    { color: 0xf97316, region: { x: 100,  y: 310,  z: 80   } },
  'runtime':       { color: 0xfbd38d, region: { x: -60,  y: 310,  z: -60  } },
  'program':       { color: 0x818cf8, region: { x: -280, y: 200,  z: 0    } },
  'zone':          { color: 0xa78bfa, region: { x: -360, y: 100,  z: 0    } },
  'memory-tier':   { color: 0x22d3ee, region: { x: 0,    y: -60,  z: 380  } },
  'history-tier':  { color: 0xfde68a, region: { x: 380,  y: 60,   z: 0    } },

  // ── Grid tier-3: endpoints ────────────────────────────────────────────────
  'agent-config':  { color: 0x6d28d9, region: { x: -300, y: 240,  z: 60   } },
}

const EDGE_COLORS: Record<string, string> = {
  // ── Existing ──────────────────────────────────────────────────────────────
  references:    '#374151',
  implements:    '#4ade80',
  contradicts:   '#f87171',
  supports:      '#60a5fa',
  causes:        '#fb923c',
  derives_from:  '#a78bfa',
  overrides:     '#facc15',

  // ── Grid structural ───────────────────────────────────────────────────────
  contains:         '#1e293b',  // structural containment — dark, subtle
  owns:             '#4f46e5',  // program → config file
  'member-of':      '#7c3aed',  // program → zone
  'delegates-to':   '#dc2626',  // CTRL → program
  'emitted-by':     '#d97706',  // event → program that emitted it
  'promoted-from':  '#059669',  // canon ← proposal
  reads:            '#0891b2',  // program → memory scope
  writes:           '#0d9488',  // program → memory scope
  triggers:         '#b45309',  // event → subprogram
}

function configFor(type: string) {
  return NODE_CONFIG[type] ?? { color: 0x6b7280, region: { x: 0, y: 0, z: 0 } }
}

// ─── Custom node renderer ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNodeObject(rawNode: any) {
  const node = rawNode as BrainGraphNode & { x?: number; y?: number; z?: number }
  const cfg = configFor(node.type)
  const gridTier = node.grid_tier ?? 0

  // Tier-1 Grid nodes are larger; tier-2 slightly above average; others scale with degree
  let radius: number
  if (gridTier === 1) {
    radius = 16
  } else if (gridTier === 2) {
    radius = 10
  } else {
    radius = Math.max(3, Math.min(14, 3 + (node.degree ?? 0) * 0.8))
  }

  const geo = new THREE.SphereGeometry(radius, 20, 20)
  const mat = new THREE.MeshLambertMaterial({
    color: cfg.color,
    emissive: cfg.color,
    emissiveIntensity: gridTier >= 1 ? 0.6 : (0.2 + (node.confidence ?? 1) * 0.5),
    transparent: true,
    opacity: gridTier >= 1 ? 0.95 : 0.88,
  })
  const mesh = new THREE.Mesh(geo, mat)

  // Locked structural nodes get a wireframe ring to indicate immutability
  const group = new THREE.Group()
  group.add(mesh)

  if (node.grid_locked) {
    const ringGeo = new THREE.TorusGeometry(radius * 1.3, 0.4, 8, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.3, transparent: true })
    group.add(new THREE.Mesh(ringGeo, ringMat))
  }

  // Hit target
  const hitGeo = new THREE.SphereGeometry(radius * 1.6, 8, 8)
  const hitMat = new THREE.MeshBasicMaterial({ visible: false })
  group.add(new THREE.Mesh(hitGeo, hitMat))

  return group
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphData {
  nodes: (BrainGraphNode & { x?: number; y?: number; z?: number })[]
  links: (Omit<BrainEdge, 'source'> & { source: string; target: string })[]
}

interface BrainGraph3DProps {
  nodes: BrainGraphNode[]
  edges: BrainEdge[]
  onNodeClick: (node: BrainGraphNode) => void
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BrainGraph3D({ nodes, edges, onNodeClick, className }: BrainGraph3DProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined)

  const graphData: GraphData = useMemo(() => ({
    nodes: nodes.map(n => ({ ...n })),
    links: edges.map(e => ({ ...e, source: e.from_id, target: e.to_id })),
  }), [nodes, edges])

  const handleEngineStop = useCallback(() => {
    if (!fgRef.current) return
    const clusterFn = (alpha: number) => {
      for (const node of graphData.nodes) {
        const region = configFor(node.type).region
        const strength = 0.04 * alpha
        node.x = (node.x ?? 0) + ((region.x - (node.x ?? 0)) * strength)
        node.y = (node.y ?? 0) + ((region.y - (node.y ?? 0)) * strength)
        node.z = (node.z ?? 0) + ((region.z - (node.z ?? 0)) * strength)
      }
    }
    fgRef.current.d3Force('cluster', clusterFn)
  }, [graphData])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((rawNode: any) => {
    onNodeClick(rawNode as BrainGraphNode)
  }, [onNodeClick])

  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 text-center ${className ?? ''}`}>
        <p className="text-gray-500 text-sm">The Brain is empty.</p>
        <p className="text-gray-600 text-xs max-w-xs">
          Agents will populate it automatically as they work. You can also create nodes manually.
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeThreeObject={makeNodeObject}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeLabel={(rawNode: any) => {
          const n = rawNode as BrainGraphNode
          const gridInfo = n.grid_path
            ? `<br/><span style="color:#6366f1;font-size:10px">${n.grid_path}</span>`
            : ''
          const lockIcon = n.grid_locked ? ' 🔒' : ''
          return `<div style="background:#1f2937;color:#f3f4f6;padding:6px 10px;border-radius:6px;font-size:12px;max-width:280px">
            <strong>${n.label}${lockIcon}</strong><br/>
            <span style="color:#9ca3af;font-size:11px">${n.type} · confidence ${((n.confidence ?? 1) * 100).toFixed(0)}%</span>
            ${gridInfo}
          </div>`
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkColor={(rawLink: any) => EDGE_COLORS[(rawLink as BrainEdge).type] ?? '#374151'}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkWidth={(rawLink: any) => Math.max(0.5, ((rawLink as BrainEdge).weight ?? 1) * 1.5)}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={1.5}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalParticleSpeed={(rawLink: any) =>
          Math.min(0.02, ((rawLink as BrainEdge).weight ?? 1) * 0.004)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalParticleColor={(rawLink: any) =>
          EDGE_COLORS[(rawLink as BrainEdge).type] ?? '#6b7280'
        }
        onNodeClick={handleNodeClick}
        onEngineStop={handleEngineStop}
        backgroundColor="#030712"
        showNavInfo={false}
        enableNodeDrag={true}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  )
}
