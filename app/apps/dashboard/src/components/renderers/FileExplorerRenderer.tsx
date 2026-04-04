// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/renderers/FileExplorerRenderer.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { workspace, agents } from '@/lib/api'
import { CodeRenderer } from './CodeRenderer'

interface TreeNode {
  name: string
  type: 'file' | 'dir'
  path: string
  root?: string  // undefined = primary workspace; set = additional workspace root
  children?: TreeNode[]
  expanded?: boolean
}

interface Props {
  agentSlug: string
}

function fileIcon(name: string, type: 'file' | 'dir'): string {
  if (type === 'dir') return '📁'
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = { md: '📝', ts: '🔷', tsx: '🔷', js: '🟨', jsx: '🟨', json: '📋', html: '🌐', css: '🎨', py: '🐍', sh: '⚙️' }
  return map[ext ?? ''] ?? '📄'
}

export function FileExplorerRenderer({ agentSlug }: Props) {
  const [sections, setSections] = useState<Array<{ label: string; root?: string; nodes: TreeNode[] }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<{ path: string; root?: string; content: string } | null>(null)
  const [fileLoading, setFileLoading] = useState(false)

  async function loadDir(path?: string, parentPath = '', root?: string): Promise<TreeNode[]> {
    const result = await workspace.list(agentSlug, path, root)
    return result.files.map(f => ({
      name: f.name,
      type: f.type,
      path: parentPath ? `${parentPath}/${f.name}` : f.name,
      root,
      expanded: false,
    }))
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      try {
        // Load primary workspace
        const primaryNodes = await loadDir()
        const newSections: Array<{ label: string; root?: string; nodes: TreeNode[] }> = [
          { label: 'Workspace', root: undefined, nodes: primaryNodes },
        ]

        // Load additional workspaces if any
        const agentInfo = await agents.get(agentSlug).catch(() => null)
        const extraPaths = agentInfo?.agent?.identity?.additionalWorkspacePaths ?? []
        for (const rootPath of extraPaths) {
          const label = rootPath.split('/').pop() ?? rootPath
          const nodes = await loadDir(undefined, '', rootPath).catch(() => [])
          newSections.push({ label, root: rootPath, nodes })
        }

        setSections(newSections)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspace')
      } finally {
        setLoading(false)
      }
    }
    void init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSlug])

  function updateNodeInSections(
    sectionRoot: string | undefined,
    nodePath: string,
    fn: (n: TreeNode) => TreeNode
  ) {
    setSections(prev => prev.map(section => {
      if (section.root !== sectionRoot) return section
      return { ...section, nodes: updateNode(section.nodes, nodePath, fn) }
    }))
  }

  async function toggleDir(node: TreeNode) {
    if (node.type !== 'dir') return
    if (node.expanded && node.children) {
      updateNodeInSections(node.root, node.path, n => ({ ...n, expanded: false }))
      return
    }
    try {
      const children = await loadDir(node.path, node.path, node.root)
      updateNodeInSections(node.root, node.path, n => ({ ...n, expanded: true, children }))
    } catch {
      setError(`Failed to open ${node.path}`)
    }
  }

  async function openFile(node: TreeNode) {
    if (node.type !== 'file') return
    setFileLoading(true)
    try {
      const result = await workspace.readFile(agentSlug, node.path, node.root)
      setSelectedFile({ path: node.path, root: node.root, content: result.content })
    } catch {
      setError(`Failed to read ${node.path}`)
    } finally {
      setFileLoading(false)
    }
  }

  function updateNode(nodes: TreeNode[], path: string, fn: (n: TreeNode) => TreeNode): TreeNode[] {
    return nodes.map(n => {
      if (n.path === path) return fn(n)
      if (n.children) return { ...n, children: updateNode(n.children, path, fn) }
      return n
    })
  }

  function renderNode(node: TreeNode, depth = 0): ReactNode {
    return (
      <div key={`${node.root ?? ''}::${node.path}`}>
        <button
          onClick={() => node.type === 'dir' ? void toggleDir(node) : void openFile(node)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            padding: `4px 12px 4px ${12 + depth * 16}px`,
            background: selectedFile?.path === node.path && selectedFile?.root === node.root ? 'var(--bg-elevated)' : 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '13px' }}>{fileIcon(node.name, node.type)}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          {node.type === 'dir' && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{node.expanded ? '▾' : '▸'}</span>}
        </button>
        {node.expanded && node.children && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  if (selectedFile) {
    const ext = selectedFile.path.split('.').pop()?.toLowerCase()
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <button onClick={() => setSelectedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px' }}>← Files</button>
          <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFile.path}</span>
        </div>
        <CodeRenderer content={selectedFile.content} language={ext} />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {loading && <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>}
      {fileLoading && <div style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>Opening file...</div>}
      {error && <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
      {sections.map((section, i) => (
        <div key={section.root ?? '__primary__'}>
          {sections.length > 1 && (
            <div style={{
              padding: '6px 12px 4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
              marginTop: i > 0 ? '4px' : undefined,
            }}>
              {section.label}
            </div>
          )}
          {section.nodes.length === 0
            ? <div style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>empty</div>
            : section.nodes.map(n => renderNode(n))}
        </div>
      ))}
    </div>
  )
}
