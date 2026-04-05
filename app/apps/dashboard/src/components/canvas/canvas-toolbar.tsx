// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

interface CanvasToolbarProps {
  editMode: boolean
  onToggleEdit: () => void
  onFitView?: () => void
}

export function CanvasToolbar({ editMode, onToggleEdit, onFitView }: CanvasToolbarProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <button
        onClick={onToggleEdit}
        className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
          editMode
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
      >
        {editMode ? 'Edit Mode ON' : 'Edit Mode'}
      </button>
      {onFitView && (
        <button
          onClick={onFitView}
          className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
        >
          Fit View
        </button>
      )}
    </div>
  )
}
