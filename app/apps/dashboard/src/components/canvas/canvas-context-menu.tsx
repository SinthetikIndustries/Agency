// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { SidePanelContent } from './canvas-side-panel'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ContextMenuState =
  | { kind: 'node'; nodeId: string; nodeType: string; x: number; y: number; parentId?: string }
  | { kind: 'pane'; x: number; y: number; flowX: number; flowY: number }
  | null

interface CanvasContextMenuProps {
  menu: ContextMenuState
  editMode: boolean
  groups: { id: string; name: string }[]
  onClose: () => void
  onOpenPanel: (content: SidePanelContent) => void
  onAddMemberToGroup?: (agentId: string, groupId: string) => Promise<void>
  onRemoveFromGroup?: (agentId: string, groupId: string) => Promise<void>
  onDeleteGroup?: (groupId: string) => Promise<void>
  onNewGroup?: (flowX: number, flowY: number) => void
  onNewAgent?: () => void
  onNavigateToAgent?: (slug: string) => void
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export function CanvasContextMenu({
  menu,
  editMode,
  groups,
  onClose,
  onOpenPanel,
  onAddMemberToGroup,
  onRemoveFromGroup,
  onDeleteGroup,
  onNewGroup,
  onNewAgent,
  onNavigateToAgent,
}: CanvasContextMenuProps) {
  const { getNode } = useReactFlow()

  useEffect(() => {
    window.addEventListener('keydown', onClose)
    return () => window.removeEventListener('keydown', onClose)
  }, [onClose])

  if (!menu) return null

  const node = menu.kind === 'node' ? getNode(menu.nodeId) : null
  const agentSlug = node?.data?.slug as string | undefined
  const groupIdFromNode = menu.kind === 'node' && menu.nodeType === 'groupNode'
    ? menu.nodeId.replace('group-', '')
    : undefined

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1 min-w-[180px]"
        style={{ top: menu.y, left: menu.x }}
        onClick={e => e.stopPropagation()}
      >
        {menu.kind === 'node' && menu.nodeType === 'groupNode' && groupIdFromNode && (
          <>
            <MenuItem onClick={() => { onOpenPanel({ type: 'group', groupId: groupIdFromNode }); onClose() }}>
              Edit Group
            </MenuItem>
            {editMode && (
              <MenuItem
                variant="danger"
                onClick={() => { void onDeleteGroup?.(groupIdFromNode).then(onClose) }}
              >
                Delete Group
              </MenuItem>
            )}
          </>
        )}

        {menu.kind === 'node' && (menu.nodeType === 'agentNode' || menu.nodeType === 'orchestratorNode') && agentSlug && (
          <>
            <MenuItem onClick={() => { onOpenPanel({ type: 'agent', slug: agentSlug }); onClose() }}>
              View / Edit Agent
            </MenuItem>
            <MenuItem onClick={() => { onNavigateToAgent?.(agentSlug); onClose() }}>
              Open Agent Canvas
            </MenuItem>
            {editMode && groups.length > 0 && (
              <SubMenu label="Add to Group">
                {groups.map(g => (
                  <MenuItem
                    key={g.id}
                    onClick={() => {
                      const agentId = menu.nodeId.replace('agent-', '')
                      void onAddMemberToGroup?.(agentId, g.id).then(onClose)
                    }}
                  >
                    {g.name}
                  </MenuItem>
                ))}
              </SubMenu>
            )}
            {editMode && menu.parentId && (
              <MenuItem
                variant="danger"
                onClick={() => {
                  const agentId = menu.nodeId.replace('agent-', '')
                  const groupId = menu.parentId!.replace('group-', '')
                  void onRemoveFromGroup?.(agentId, groupId).then(onClose)
                }}
              >
                Remove from Group
              </MenuItem>
            )}
          </>
        )}

        {menu.kind === 'node' && menu.nodeType === 'skillNode' && (
          <MenuItem onClick={() => { onOpenPanel({ type: 'skill', skillId: menu.nodeId.replace('skill-', ''), agentSlug: '' }); onClose() }}>
            View Skill
          </MenuItem>
        )}

        {menu.kind === 'node' && menu.nodeType === 'toolNode' && (
          <MenuItem onClick={() => { onOpenPanel({ type: 'tool', toolName: menu.nodeId.replace('tool-', ''), agentSlug: '' }); onClose() }}>
            View Tool
          </MenuItem>
        )}

        {menu.kind === 'node' && menu.nodeType === 'workspaceNode' && (
          <MenuItem onClick={() => {
            const path = node?.data?.path as string ?? ''
            onOpenPanel({ type: 'workspace', path })
            onClose()
          }}>
            Browse Files
          </MenuItem>
        )}

        {menu.kind === 'pane' && (
          <>
            <MenuItem onClick={() => { onNewGroup?.(menu.flowX, menu.flowY); onClose() }}>
              New Group
            </MenuItem>
            {onNewAgent && (
              <MenuItem onClick={() => { onNewAgent(); onClose() }}>
                New Agent
              </MenuItem>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  children,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-900/20'
          : 'text-gray-200 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ─── SubMenu ──────────────────────────────────────────────────────────────────

function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/sub">
      <button className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center justify-between">
        {label}
        <span className="text-gray-500">›</span>
      </button>
      <div className="absolute left-full top-0 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1 min-w-[160px] hidden group-hover/sub:block">
        {children}
      </div>
    </div>
  )
}
