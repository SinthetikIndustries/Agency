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
  agent:     { color: 0x6366f1, region: { x: 0,    y: 120,  z: 0    } },
  insight:   { color: 0xf59e0b, region: { x: -120, y: 80,   z: -80  } },
  pattern:   { color: 0x10b981, region: { x: 120,  y: 80,   z: -80  } },
  concept:   { color: 0x3b82f6, region: { x: -150, y: 0,    z: 0    } },
  fact:      { color: 0x8b5cf6, region: { x: 150,  y: 0,    z: 0    } },
  procedure: { color: 0xec4899, region: { x: 0,    y: 40,   z: 160  } },
  memory:    { color: 0x06b6d4, region: { x: 0,    y: -40,  z: -160 } },
  code:      { color: 0x84cc16, region: { x: 0,    y: -120, z: 0    } },
}

const EDGE_COLORS: Record<string, string> = {
  references:    '#374151',
  implements:    '#4ade80',
  contradicts:   '#f87171',
  supports:      '#60a5fa',
  causes:        '#fb923c',
  derives_from:  '#a78bfa',
  overrides:     '#facc15',
}

function configFor(type: string) {
  return NODE_CONFIG[type] ?? { color: 0x6b7280, region: { x: 0, y: 0, z: 0 } }
}

// ─── Custom node renderer ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNodeObject(rawNode: any) {
  const node = rawNode as BrainGraphNode & { x?: number; y?: number; z?: number }
  const cfg = configFor(node.type)
  const radius = Math.max(3, Math.min(14, 3 + (node.degree ?? 0) * 0.8))

  const geo = new THREE.SphereGeometry(radius, 16, 16)
  const mat = new THREE.MeshLambertMaterial({
    color: cfg.color,
    emissive: cfg.color,
    emissiveIntensity: 0.2 + (node.confidence ?? 1) * 0.5,
    transparent: true,
    opacity: 0.88,
  })
  const mesh = new THREE.Mesh(geo, mat)

  const hitGeo = new THREE.SphereGeometry(radius * 1.6, 8, 8)
  const hitMat = new THREE.MeshBasicMaterial({ visible: false })
  const hitMesh = new THREE.Mesh(hitGeo, hitMat)

  const group = new THREE.Group()
  group.add(mesh)
  group.add(hitMesh)
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
          return `<div style="background:#1f2937;color:#f3f4f6;padding:6px 10px;border-radius:6px;font-size:12px;max-width:240px">
            <strong>${n.label}</strong><br/>
            <span style="color:#9ca3af;font-size:11px">${n.type} · confidence ${((n.confidence ?? 1) * 100).toFixed(0)}%</span>
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
