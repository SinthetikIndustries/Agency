// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

// apps/dashboard/src/components/workspace/types.ts

export type PanelMode =
  | 'canvas'
  | 'file-explorer'
  | 'diff'
  | 'data-table'
  | 'image'
  | 'terminal'
  | 'web-preview'
  | 'plan'
  | null

export interface ArtifactVersion {
  content: string
  timestamp: number
}

export interface Artifact {
  id: string
  mimeType: string
  title: string
  versions: ArtifactVersion[]
  activeVersion: number
}

export interface PlanStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  children?: PlanStep[]
  startedAt?: number
  completedAt?: number
}

export interface OpenTab {
  artifactId: string
  title: string
  mimeType: string
}

export interface PanelState {
  mode: PanelMode
  // canvas / data-table / image
  artifactId?: string
  // file-explorer
  agentSlug?: string
  // diff
  diffPath?: string
  diffBefore?: string
  diffAfter?: string
  // web-preview
  webUrl?: string
  webTitle?: string
  webContent?: string
  webContentType?: 'html' | 'screenshot'
  // multi-artifact tabs
  openTabs: OpenTab[]
  activeTabId?: string
}
