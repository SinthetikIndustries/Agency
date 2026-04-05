// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { groups, type WorkspaceGroup } from '@/lib/api'

const HIERARCHY_LABELS: Record<string, string> = {
  flat:         'Flat',
  hierarchical: 'Hierarchical',
  council:      'Council',
}

const HIERARCHY_COLORS: Record<string, string> = {
  flat:         'bg-blue-900/40 text-blue-300 border border-blue-800/50',
  hierarchical: 'bg-purple-900/40 text-purple-300 border border-purple-800/50',
  council:      'bg-amber-900/40 text-amber-300 border border-amber-800/50',
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (g: WorkspaceGroup) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hierarchyType, setHierarchyType] = useState('flat')
  const [goals, setGoals] = useState<string[]>([''])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function addGoal() { setGoals(prev => [...prev, '']) }
  function removeGoal(i: number) { setGoals(prev => prev.filter((_, idx) => idx !== i)) }
  function updateGoal(i: number, v: string) { setGoals(prev => prev.map((g, idx) => idx === i ? v : g)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    setSubmitting(true)
    try {
      const cleanGoals = goals.map(g => g.trim()).filter(Boolean)
      const result = await groups.create({
        name: name.trim(),
        description: description.trim() || undefined,
        hierarchyType,
        goals: cleanGoals.length > 0 ? cleanGoals : undefined,
      })
      onCreated(result.group)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">New Group</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Research Team"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this group do?"
              rows={2}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600 resize-none"
            />
          </div>

          {/* Hierarchy Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Hierarchy Type</label>
            <select
              value={hierarchyType}
              onChange={e => setHierarchyType(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
            >
              <option value="flat">Flat — peers with equal authority</option>
              <option value="hierarchical">Hierarchical — lead agent coordinates members</option>
              <option value="council">Council — consensus-based decision making</option>
            </select>
          </div>

          {/* Goals */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Goals</label>
            <div className="space-y-2">
              {goals.map((goal, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={goal}
                    onChange={e => updateGoal(i, e.target.value)}
                    placeholder={`Goal ${i + 1}`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
                  />
                  {goals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGoal(i)}
                      className="text-red-500 hover:text-red-400 transition-colors px-2 text-sm"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addGoal}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add goal
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ background: '#2563eb', color: '#fff' }}
            >
              {submitting ? 'Creating…' : 'Create group'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const [groupList, setGroupList] = useState<WorkspaceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  function load() {
    setLoading(true)
    groups.list()
      .then(r => setGroupList(r.groups))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleCreated(g: WorkspaceGroup) {
    setGroupList(prev => [...prev, g])
    setShowCreate(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Workspace groups for multi-agent coordination</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm rounded-lg transition-colors"
          style={{ background: '#2563eb', color: '#fff' }}
        >
          + New Group
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : groupList.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">No groups yet.</p>
          <p className="text-xs text-gray-600 mt-1">Create a group to coordinate multiple agents around shared goals.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groupList.map(group => (
            <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-white">{group.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${HIERARCHY_COLORS[group.hierarchyType] ?? 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                      {HIERARCHY_LABELS[group.hierarchyType] ?? group.hierarchyType}
                    </span>
                    {group.memberCount !== undefined && (
                      <span className="text-xs text-gray-500">{group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-sm text-gray-400 mt-1">{group.description}</p>
                  )}
                  {group.goals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {group.goals.slice(0, 3).map((goal, i) => (
                        <span key={i} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded px-2 py-0.5">
                          {goal}
                        </span>
                      ))}
                      {group.goals.length > 3 && (
                        <span className="text-xs text-gray-600">+{group.goals.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
                <Link
                  href={`/dashboard/groups/${group.id}`}
                  className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
