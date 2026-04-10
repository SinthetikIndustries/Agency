// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import '@xyflow/react/dist/style.css'
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge, type OnNodeDrag, type NodeMouseHandler,
} from '@xyflow/react'
import { NODE_TYPES } from '@/components/canvas/node-types'
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar'
import { CanvasSidePanel, type SidePanelContent } from '@/components/canvas/canvas-side-panel'
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/canvas-context-menu'
import { computeAgentLayout, savePositions, clearSavedPositions, type ConfigFile } from '@/components/canvas/canvas-layout'
import { agentSkills as agentSkillsApi, agentConfig } from '@/lib/api'
import type { Agent, AgentSkill } from '@/lib/api'

// ─── Config file editor panel ─────────────────────────────────────────────────

function ConfigFileEditor({
  agentSlug,
  fileType,
  onClose,
}: {
  agentSlug: string
  fileType: string
  onClose: () => void
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    setErr('')
    agentConfig.get(agentSlug, fileType)
      .then(r => { setContent(r.content); setLoading(false) })
      .catch(() => { setErr('Failed to load file'); setLoading(false) })
  }, [agentSlug, fileType])

  async function handleSave() {
    setSaving(true); setErr(''); setSaved(false)
    try {
      await agentConfig.update(agentSlug, fileType, content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setErr('Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: '480px', height: '100%',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        pointerEvents: 'auto',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {fileType}.md
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', margin: '2px 0 0' }}>
              {agentSlug} · config file
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>Saved</span>}
            {err && <span style={{ fontSize: 12, color: '#f87171' }}>{err}</span>}
            <button
              onClick={() => void handleSave()}
              disabled={saving || loading}
              style={{
                background: '#2563eb', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 13,
                fontWeight: 600, cursor: 'pointer', opacity: saving || loading ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '4px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 18px' }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                  e.preventDefault()
                  void handleSave()
                }
              }}
              style={{
                flex: 1, width: '100%', resize: 'none',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                lineHeight: 1.6,
                padding: '12px 14px',
                outline: 'none',
              }}
              placeholder={`Content of ${fileType}.md…`}
              spellCheck={false}
            />
          )}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            ⌘S / Ctrl+S to save
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Inner (needs ReactFlowProvider context) ──────────────────────────────────

function AgentCanvasInner({ agent }: { agent: Agent }) {
  const { fitView, screenToFlowPosition } = useReactFlow()
  const surfaceId = `agent-${agent.identity.slug}`

  const [agentSkillList, setAgentSkillList] = useState<AgentSkill[]>([])
  const [configFiles, setConfigFiles] = useState<ConfigFile[]>([])
  const [editingFile, setEditingFile] = useState<string | null>(null)

  useEffect(() => {
    agentSkillsApi.list(agent.identity.slug)
      .then(r => setAgentSkillList(r.skills))
      .catch(() => {})
    agentConfig.list(agent.identity.slug)
      .then(r => setConfigFiles(r.files.map(f => ({
        fileType: f.file_type,
        content: f.content,
        updatedAt: f.updated_at,
        updatedBy: f.updated_by,
      }))))
      .catch(() => {})
  }, [agent.identity.slug])

  const getLayout = useCallback((skills: AgentSkill[], files: ConfigFile[]) => {
    return computeAgentLayout(
      agent,
      skills,
      agent.identity.additionalWorkspacePaths ?? [],
      surfaceId,
      files
    )
  }, [agent, surfaceId])

  const { nodes: initialNodes, edges: initialEdges } = getLayout(agentSkillList, configFiles)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges)

  // Re-layout when skills or config files load
  useEffect(() => {
    const { nodes: fresh, edges: freshEdges } = getLayout(agentSkillList, configFiles)
    setNodes(fresh)
    setEdges(freshEdges)
  }, [agentSkillList, configFiles, getLayout, setNodes, setEdges])

  const [editMode, setEditMode] = useState(false)
  const [panelContent, setPanelContent] = useState<SidePanelContent | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const handleNodeDragStop = useCallback<OnNodeDrag>((_, _node, allNodes) => {
    savePositions(surfaceId, allNodes as Node[])
  }, [surfaceId])

  const handleResetLayout = useCallback(() => {
    clearSavedPositions(surfaceId)
    const { nodes: fresh, edges: freshEdges } = getLayout(agentSkillList, configFiles)
    setNodes(fresh)
    setEdges(freshEdges)
    setTimeout(() => fitView({ padding: 0.15 }), 50)
  }, [surfaceId, getLayout, agentSkillList, configFiles, setNodes, setEdges, fitView])

  const handleNodeContextMenu = useCallback<NodeMouseHandler>((event, node) => {
    event.preventDefault()
    setContextMenu({
      kind: 'node',
      nodeId: node.id,
      nodeType: node.type ?? 'agentNode',
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    const clientX = 'clientX' in event ? event.clientX : 0
    const clientY = 'clientY' in event ? event.clientY : 0
    const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
    setContextMenu({ kind: 'pane', x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  return (
    <div className="flex flex-col gap-3">
      <CanvasToolbar
        editMode={editMode}
        onToggleEdit={() => setEditMode(e => !e)}
        onFitView={() => fitView({ padding: 0.15 })}
        onResetLayout={handleResetLayout}
      />
      <div style={{ height: '70vh' }} className="border border-gray-700 rounded-lg overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeClick={(_e, node) => {
            if (node.type === 'configFileNode') {
              const fileType = node.data?.fileType as string
              setEditingFile(fileType)
            } else if (node.type === 'skillNode') {
              setPanelContent({ type: 'skill', skillId: node.id.replace('skill-', ''), agentSlug: agent.identity.slug })
            } else if (node.type === 'toolNode') {
              setPanelContent({ type: 'tool', toolName: node.id.replace('tool-', ''), agentSlug: agent.identity.slug })
            } else if (node.type === 'workspaceNode') {
              const path = node.data?.path as string ?? ''
              setPanelContent({ type: 'workspace', path, agentSlug: agent.identity.slug })
            }
          }}
          fitView
          defaultEdgeOptions={{ style: { stroke: '#4b5563', strokeWidth: 1.5 } }}
          className="bg-gray-950"
        >
          <Background color="#1f2937" gap={24} />
          <Controls />
        </ReactFlow>
      </div>

      <CanvasSidePanel
        content={panelContent}
        onClose={() => setPanelContent(null)}
      />

      <CanvasContextMenu
        menu={contextMenu}
        editMode={editMode}
        groups={[]}
        onClose={() => setContextMenu(null)}
        onOpenPanel={setPanelContent}
        onNewGroup={(_flowX, _flowY) => {}}
      />

      {editingFile && (
        <ConfigFileEditor
          agentSlug={agent.identity.slug}
          fileType={editingFile}
          onClose={() => setEditingFile(null)}
        />
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function AgentCanvas({ agent }: { agent: Agent }) {
  return (
    <ReactFlowProvider>
      <AgentCanvasInner agent={agent} />
    </ReactFlowProvider>
  )
}
