// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

interface CanvasToolbarProps {
  editMode: boolean
  onToggleEdit: () => void
  onFitView?: () => void
  onResetLayout?: () => void
  liveMode?: boolean
  onToggleLive?: () => void
  onAddGroup?: () => void
  onAddAgent?: () => void
}

export function CanvasToolbar({
  editMode,
  onToggleEdit,
  onFitView,
  onResetLayout,
  liveMode,
  onToggleLive,
  onAddGroup,
  onAddAgent,
}: CanvasToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onToggleEdit}
        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
          editMode
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
      >
        {editMode ? 'Editing' : 'Edit'}
      </button>

      {onFitView && (
        <button
          onClick={onFitView}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Fit
        </button>
      )}

      {onResetLayout && (
        <button
          onClick={onResetLayout}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          Reset Layout
        </button>
      )}

      {onToggleLive && (
        <button
          onClick={onToggleLive}
          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            liveMode
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${liveMode ? 'bg-emerald-300' : 'bg-gray-500'}`} />
          Live
        </button>
      )}

      <div className="flex-1" />

      {onAddGroup && (
        <button
          onClick={onAddGroup}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-800 hover:bg-blue-700 text-blue-200 transition-colors"
        >
          + Group
        </button>
      )}

      {onAddAgent && (
        <button
          onClick={onAddAgent}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          + Agent
        </button>
      )}
    </div>
  )
}
