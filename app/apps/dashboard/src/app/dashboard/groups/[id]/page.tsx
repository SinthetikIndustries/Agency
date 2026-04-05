// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { groups, agents, type WorkspaceGroup, type GroupMember, type Agent } from '@/lib/api'

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

const ROLE_COLORS: Record<string, string> = {
  lead:     'bg-blue-900/50 text-blue-300',
  member:   'bg-gray-800 text-gray-300',
  observer: 'bg-gray-800/50 text-gray-500',
}

// ─── Section wrapper (matches agent detail page style) ────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-800/40">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-gray-800">{children}</div>
    </div>
  )
}

// ─── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteDialog({ groupName, onCancel, onConfirm, deleting }: {
  groupName: string
  onCancel: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl p-6">
        <h2 className="text-base font-semibold text-white mb-2">Delete group?</h2>
        <p className="text-sm text-gray-400 mb-1">
          This will remove <span className="text-white font-medium">{groupName}</span> from the database, along with all membership records.
        </p>
        <p className="text-xs text-gray-500 mb-5">
          The workspace directory on disk will be preserved and not deleted.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 bg-red-700 hover:bg-red-600 text-white"
          >
            {deleting ? 'Deleting…' : 'Delete group'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [group, setGroup] = useState<WorkspaceGroup | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editGoals, setEditGoals] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Add member
  const [addingMember, setAddingMember] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedRole, setSelectedRole] = useState('member')
  const [addingMemberLoading, setAddingMemberLoading] = useState(false)

  // Delete
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function flash(message: string) {
    setMsg(message)
    setTimeout(() => setMsg(''), 2500)
  }

  function load() {
    Promise.all([
      groups.get(id),
      agents.list(),
    ])
      .then(([groupRes, agentsRes]) => {
        setGroup(groupRes.group)
        setMembers(groupRes.members)
        setAgentList(agentsRes.agents)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  function startEdit() {
    if (!group) return
    setEditName(group.name)
    setEditDescription(group.description ?? '')
    setEditGoals(group.goals.length > 0 ? [...group.goals] : [''])
    setEditing(true)
  }

  async function saveEdit() {
    if (!group) return
    setSaving(true)
    try {
      const cleanGoals = editGoals.map(g => g.trim()).filter(Boolean)
      const result = await groups.update(id, {
        name: editName.trim() || group.name,
        description: editDescription.trim() || undefined,
        goals: cleanGoals,
      })
      setGroup(result.group)
      setEditing(false)
      flash('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember(agentId: string) {
    try {
      await groups.removeMember(id, agentId)
      setMembers(prev => prev.filter(m => m.agentId !== agentId))
      flash('Member removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  async function handleAddMember() {
    if (!selectedAgentId) return
    setAddingMemberLoading(true)
    try {
      await groups.addMember(id, { agentId: selectedAgentId, role: selectedRole })
      const agent = agentList.find(a => a.identity.id === selectedAgentId)
      setMembers(prev => [...prev, {
        agentId: selectedAgentId,
        role: selectedRole,
        joinedAt: new Date().toISOString(),
        agentName: agent?.identity.name,
        agentSlug: agent?.identity.slug,
      }])
      setSelectedAgentId('')
      setSelectedRole('member')
      setAddingMember(false)
      flash('Member added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setAddingMemberLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await groups.delete(id)
      router.push('/dashboard/groups')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group')
      setDeleting(false)
      setShowDelete(false)
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      flash('Copied!')
    } catch { /* ignore */ }
  }

  const memberAgentIds = new Set(members.map(m => m.agentId))
  const availableAgents = agentList.filter(a => !memberAgentIds.has(a.identity.id))

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-400">{error || 'Group not found'}</p>
        <Link href="/dashboard/groups" className="text-xs text-blue-400 hover:underline mt-2 inline-block">← Back to groups</Link>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/dashboard/groups" className="text-gray-500 hover:text-gray-300 transition-colors">Groups</Link>
        <span className="text-gray-700">/</span>
        <span className="text-white font-medium">{group.name}</span>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      {msg && <p className="text-sm text-green-400 mb-4">{msg}</p>}

      <div className="max-w-2xl space-y-5">

        {/* Header */}
        <Section title="Group">
          {editing ? (
            <div className="p-4 space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Description</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={2}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                  className="text-sm px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-sm text-gray-400 hover:text-white transition-colors px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between px-4 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-white">{group.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${HIERARCHY_COLORS[group.hierarchyType] ?? 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                      {HIERARCHY_LABELS[group.hierarchyType] ?? group.hierarchyType}
                    </span>
                  </div>
                  {group.description && (
                    <p className="text-sm text-gray-400 mt-1">{group.description}</p>
                  )}
                </div>
                <button
                  onClick={startEdit}
                  className="shrink-0 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Edit
                </button>
              </div>
            </>
          )}
        </Section>

        {/* Goals */}
        <Section title="Goals">
          {editing ? (
            <div className="p-4 space-y-2">
              {editGoals.map((goal, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={goal}
                    onChange={e => setEditGoals(prev => prev.map((g, idx) => idx === i ? e.target.value : g))}
                    placeholder={`Goal ${i + 1}`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
                  />
                  {editGoals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setEditGoals(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-red-500 hover:text-red-400 transition-colors px-2 text-sm"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEditGoals(prev => [...prev, ''])}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add goal
              </button>
            </div>
          ) : group.goals.length === 0 ? (
            <div className="px-4 py-3">
              <span className="text-sm text-gray-600">No goals set.</span>
            </div>
          ) : (
            <div className="px-4 py-3 flex flex-col gap-2">
              {group.goals.map((goal, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-gray-600 mt-0.5 shrink-0">{i + 1}.</span>
                  <span className="text-sm text-gray-300">{goal}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Members */}
        <Section title="Members">
          {members.length === 0 ? (
            <div className="px-4 py-3">
              <span className="text-sm text-gray-600">No members yet.</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider">Agent</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.agentId} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-white font-medium">{member.agentName ?? member.agentId}</div>
                      {member.agentSlug && (
                        <div className="font-mono text-xs text-gray-600">{member.agentSlug}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLORS[member.role] ?? 'bg-gray-800 text-gray-400'}`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => void handleRemoveMember(member.agentId)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add Agent */}
          <div className="px-4 py-3 border-t border-gray-800">
            {addingMember ? (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedAgentId}
                  onChange={e => setSelectedAgentId(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
                >
                  <option value="">Select agent…</option>
                  {availableAgents.map(a => (
                    <option key={a.identity.id} value={a.identity.id}>{a.identity.name}</option>
                  ))}
                </select>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
                >
                  <option value="member">Member</option>
                  <option value="lead">Lead</option>
                  <option value="observer">Observer</option>
                </select>
                <button
                  onClick={() => void handleAddMember()}
                  disabled={!selectedAgentId || addingMemberLoading}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                  className="text-xs px-3 py-1.5 rounded disabled:opacity-40 transition-opacity hover:opacity-90"
                >
                  {addingMemberLoading ? '…' : 'Add'}
                </button>
                <button
                  onClick={() => { setAddingMember(false); setSelectedAgentId('') }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingMember(true)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add Agent
              </button>
            )}
          </div>
        </Section>

        {/* Workspace Path */}
        <Section title="Paths">
          <div className="flex items-center justify-between px-4 py-3 gap-4">
            <span className="text-sm text-gray-400 shrink-0 w-32">Workspace</span>
            <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
              <span className="font-mono text-xs text-gray-400 truncate">{group.workspacePath}</span>
              <button
                onClick={() => void copyToClipboard(group.workspacePath)}
                className="shrink-0 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                title="Copy path"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-4">
            <span className="text-sm text-gray-400 shrink-0 w-32">Memory</span>
            <span className="font-mono text-xs text-gray-400 truncate flex-1 text-right">{group.memoryPath}</span>
          </div>
        </Section>

        {/* Danger zone */}
        <div className="bg-gray-900 border border-red-900/40 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Danger Zone</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">Delete this group</p>
              <p className="text-xs text-gray-500 mt-0.5">Removes the group from the database. Workspace directory is preserved.</p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="text-sm px-3 py-1.5 rounded-lg border border-red-700 text-red-400 hover:bg-red-900/30 transition-colors shrink-0"
            >
              Delete
            </button>
          </div>
        </div>

      </div>

      {showDelete && (
        <DeleteDialog
          groupName={group.name}
          onCancel={() => setShowDelete(false)}
          onConfirm={() => void handleDelete()}
          deleting={deleting}
        />
      )}
    </div>
  )
}
