// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { grid, type GridNode } from '@/lib/api'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

interface NodeEditorPanelProps {
  nodeId: string | null
  onClose: () => void
  onSaved?: (updated: GridNode) => void
}

export function NodeEditorPanel({ nodeId, onClose, onSaved }: NodeEditorPanelProps) {
  const [node, setNode] = useState<GridNode | null>(null)
  const [content, setContent] = useState('')
  const [label, setLabel] = useState('')
  const [confidence, setConfidence] = useState(1.0)
  const [original, setOriginal] = useState({ content: '', label: '', confidence: 1.0 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (!nodeId) { setNode(null); return }
    setLoading(true)
    setError('')
    grid.getNode(nodeId)
      .then(n => {
        setNode(n)
        setContent(n.content ?? '')
        setLabel(n.label)
        setConfidence(n.confidence)
        setOriginal({ content: n.content ?? '', label: n.label, confidence: n.confidence })
      })
      .catch(() => setError('Failed to load node'))
      .finally(() => setLoading(false))
  }, [nodeId])

  const isDirty = content !== original.content
    || label !== original.label
    || confidence !== original.confidence

  const handleSave = useCallback(async () => {
    if (!nodeId || !node) return
    setSaving(true)
    setError('')
    try {
      const updated = await grid.updateNode(nodeId, { label, content, confidence, source: 'user' })
      setNode(updated)
      setOriginal({ content: updated.content ?? '', label: updated.label, confidence: updated.confidence })
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2000)
      onSaved?.(updated)
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }, [nodeId, node, label, content, confidence, onSaved])

  if (!nodeId) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => { if (!isDirty) onClose() }}
      />
      <div className="fixed right-0 top-0 h-full w-[55%] min-w-[520px] max-w-4xl z-50 flex flex-col bg-gray-950 border-l border-gray-800 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 flex-shrink-0">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="text-sm font-semibold text-white bg-transparent border-none outline-none flex-1 mr-4 truncate"
            placeholder="Node label…"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
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
              className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
            >
              {isDirty ? <span className="text-xs text-yellow-400">✕ unsaved</span> : '✕'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-hidden" data-color-mode="dark">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading…</div>
            ) : (
              <MDEditor
                value={content}
                onChange={v => setContent(v ?? '')}
                height="100%"
                visibleDragbar={false}
                preview="edit"
                style={{ backgroundColor: '#030712', borderRadius: 0, border: 'none', height: '100%' }}
              />
            )}
          </div>

          {/* Metadata sidebar */}
          {node && (
            <div className="w-48 flex-shrink-0 border-l border-gray-800 p-4 overflow-y-auto">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Details</p>
              <div className="space-y-3">
                <Meta label="Type" value={<span className="capitalize text-indigo-300">{node.type}</span>} />
                <Meta label="Source" value={<span className="text-gray-400 text-xs break-all">{node.source}</span>} />
                <Meta label="Version" value={<span className="text-gray-300">v{node.version}</span>} />
                <div>
                  <p className="text-xs text-gray-600 mb-1">Confidence</p>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={confidence}
                    onChange={e => setConfidence(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">{(confidence * 100).toFixed(0)}%</p>
                </div>
                <Meta label="Updated" value={
                  <span className="text-gray-500 text-xs">
                    {new Date(node.updated_at).toLocaleDateString()}
                  </span>
                } />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-600 mb-0.5">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}
