// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/WorkspacePanel.tsx
'use client'

import type { PanelState, Artifact, PlanStep } from '@/components/workspace/types'
import { ArtifactRenderer } from '@/components/renderers/ArtifactRenderer'
import { FileExplorerRenderer } from '@/components/renderers/FileExplorerRenderer'
import { DiffRenderer } from '@/components/renderers/DiffRenderer'
import { DataTableRenderer } from '@/components/renderers/DataTableRenderer'
import { TerminalRenderer } from '@/components/renderers/TerminalRenderer'
import { WebPreviewRenderer } from '@/components/renderers/WebPreviewRenderer'
import { PlanRenderer } from '@/components/renderers/PlanRenderer'

const MODE_LABELS: Record<string, string> = {
  canvas: 'Canvas',
  'file-explorer': 'Files',
  diff: 'Diff',
  'data-table': 'Table',
  image: 'Image',
  terminal: 'Terminal',
  'web-preview': 'Web Preview',
  plan: 'Plan',
}

const MODE_ICONS: Record<string, string> = {
  canvas: '🖼',
  'file-explorer': '📁',
  diff: '±',
  'data-table': '📊',
  image: '🖼',
  terminal: '⌨',
  'web-preview': '🌐',
  plan: '📋',
}

interface Props {
  panel: PanelState
  artifacts: Map<string, Artifact>
  shellLines: string[]
  planSteps: PlanStep[]
  onClose: () => void
  onSwitchTab: (artifactId: string) => void
  onCloseTab: (artifactId: string) => void
  onSwitchVersion: (artifactId: string, version: number) => void
}

export function WorkspacePanel({
  panel,
  artifacts,
  shellLines,
  planSteps,
  onClose,
  onSwitchTab,
  onCloseTab,
  onSwitchVersion,
}: Props) {
  if (!panel.mode) return null

  const activeArtifact = panel.artifactId ? artifacts.get(panel.artifactId) : null
  const title = activeArtifact?.title ?? MODE_LABELS[panel.mode] ?? panel.mode
  const icon = MODE_ICONS[panel.mode] ?? '◻'

  function renderContent() {
    switch (panel.mode) {
      case 'canvas':
      case 'data-table':
      case 'image':
        if (!activeArtifact) return <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>No artifact</div>
        if (panel.mode === 'data-table') {
          const content = activeArtifact.versions[activeArtifact.activeVersion]?.content ?? ''
          return <DataTableRenderer content={content} mimeType={activeArtifact.mimeType} />
        }
        if (panel.mode === 'image') {
          const content = activeArtifact.versions[activeArtifact.activeVersion]?.content ?? ''
          return (
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '16px' }}>
              {activeArtifact.mimeType === 'image/svg+xml'
                ? <div dangerouslySetInnerHTML={{ __html: content }} />
                : <img src={content} alt={activeArtifact.title} style={{ maxWidth: '100%' }} />
              }
            </div>
          )
        }
        return <ArtifactRenderer artifact={activeArtifact} />
      case 'file-explorer':
        return <FileExplorerRenderer agentSlug={panel.agentSlug ?? 'main'} />
      case 'diff':
        return <DiffRenderer path={panel.diffPath ?? ''} before={panel.diffBefore ?? ''} after={panel.diffAfter ?? ''} />
      case 'terminal':
        return <TerminalRenderer lines={shellLines} command={undefined} />
      case 'web-preview':
        return <WebPreviewRenderer url={panel.webUrl ?? ''} title={panel.webTitle ?? ''} content={panel.webContent ?? ''} contentType={panel.webContentType ?? 'html'} />
      case 'plan':
        return <PlanRenderer steps={planSteps} />
      default:
        return null
    }
  }

  return (
    <div style={{
      width: '420px',
      minWidth: '320px',
      maxWidth: '640px',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      height: '100%',
      overflow: 'hidden',
      animation: 'slideInRight 0.2s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {/* Version chips for canvas mode */}
        {activeArtifact && activeArtifact.versions.length > 1 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {activeArtifact.versions.map((_, i) => (
              <button
                key={i}
                onClick={() => onSwitchVersion(activeArtifact.id, i)}
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: i === activeArtifact.activeVersion ? 'var(--accent)' : 'var(--bg-base)',
                  color: i === activeArtifact.activeVersion ? 'var(--bg-base)' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                v{i + 1}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1, padding: '2px' }}
          title="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Tab bar — only when multiple artifact tabs are open */}
      {panel.openTabs.length > 1 && (
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', overflow: 'auto', flexShrink: 0 }}>
          {panel.openTabs.map(tab => (
            <div
              key={tab.artifactId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                background: tab.artifactId === panel.activeTabId ? 'var(--bg-surface)' : 'transparent',
                borderBottom: tab.artifactId === panel.activeTabId ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab.artifactId === panel.activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
              onClick={() => onSwitchTab(tab.artifactId)}
            >
              <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.title}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.artifactId) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: '0 2px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {renderContent()}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
