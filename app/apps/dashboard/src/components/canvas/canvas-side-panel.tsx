// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'
import { useState, useEffect } from 'react'
import {
  agents, groups, agentSkills, workspace,
  type Agent, type WorkspaceGroup, type GroupMember, type WorkspaceFile,
} from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SidePanelContent =
  | { type: 'group'; groupId: string }
  | { type: 'agent'; slug: string }
  | { type: 'skill'; skillId: string; agentSlug: string }
  | { type: 'tool'; toolName: string; agentSlug: string }
  | { type: 'workspace'; path: string; agentSlug?: string }

interface CanvasSidePanelProps {
  content: SidePanelContent | null
  onClose: () => void
  onGroupUpdated?: (group: WorkspaceGroup) => void
  onGroupDeleted?: (groupId: string) => void
  onMemberAdded?: (groupId: string, agentId: string) => void
  onMemberRemoved?: (groupId: string, agentId: string) => void
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CanvasSidePanel({
  content,
  onClose,
  onGroupUpdated,
  onGroupDeleted,
  onMemberAdded,
  onMemberRemoved,
}: CanvasSidePanelProps) {
  const isOpen = content !== null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transition-transform duration-200 overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <span className="text-white font-semibold text-sm">
            {content?.type === 'group' ? 'Group' :
             content?.type === 'agent' ? 'Agent' :
             content?.type === 'skill' ? 'Skill' :
             content?.type === 'tool' ? 'Tool' :
             content?.type === 'workspace' ? 'Workspace' : ''}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          {content?.type === 'group' && (
            <GroupPanel
              groupId={content.groupId}
              onUpdated={onGroupUpdated}
              onDeleted={onGroupDeleted}
              onMemberAdded={onMemberAdded}
              onMemberRemoved={onMemberRemoved}
            />
          )}
          {content?.type === 'agent' && (
            <AgentPanel slug={content.slug} />
          )}
          {content?.type === 'skill' && (
            <SkillPanel skillId={content.skillId} agentSlug={content.agentSlug} />
          )}
          {content?.type === 'tool' && (
            <ToolPanel toolName={content.toolName} agentSlug={content.agentSlug} />
          )}
          {content?.type === 'workspace' && (
            <WorkspacePanel path={content.path} agentSlug={content.agentSlug} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Group panel ───────────────────────────────────────────────────────────────

function GroupPanel({
  groupId,
  onUpdated,
  onDeleted,
  onMemberAdded,
  onMemberRemoved,
}: {
  groupId: string
  onUpdated?: (group: WorkspaceGroup) => void
  onDeleted?: (groupId: string) => void
  onMemberAdded?: (groupId: string, agentId: string) => void
  onMemberRemoved?: (groupId: string, agentId: string) => void
}) {
  const [group, setGroup] = useState<WorkspaceGroup | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    Promise.all([groups.get(groupId), agents.list()]).then(([gData, aData]) => {
      setGroup(gData.group)
      setMembers(gData.members)
      setAllAgents(aData.agents)
      setName(gData.group.name)
      setDescription(gData.group.description ?? '')
      setGoals(gData.group.goals.length > 0 ? gData.group.goals : [''])
    }).catch(console.error)
  }, [groupId])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const updated = await groups.update(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
        goals: goals.filter(Boolean),
      })
      setGroup(updated.group)
      onUpdated?.(updated.group)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(agentId: string) {
    await groups.addMember(groupId, { agentId })
    const updated = await groups.get(groupId)
    setMembers(updated.members)
    onMemberAdded?.(groupId, agentId)
  }

  async function handleRemoveMember(agentId: string) {
    await groups.removeMember(groupId, agentId)
    setMembers(prev => prev.filter(m => m.agentId !== agentId))
    onMemberRemoved?.(groupId, agentId)
  }

  async function handleDelete() {
    await groups.delete(groupId)
    onDeleted?.(groupId)
  }

  if (!group) return <p className="text-gray-500 text-sm">Loading...</p>

  const memberIds = new Set(members.map(m => m.agentId))
  const availableAgents = allAgents.filter(a => !memberIds.has(a.identity.id))

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Goals</label>
        {goals.map((g, i) => (
          <div key={i} className="flex gap-2 mb-1">
            <input
              value={g}
              onChange={e => setGoals(prev => prev.map((x, j) => j === i ? e.target.value : x))}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setGoals(prev => prev.filter((_, j) => j !== i))}
              className="text-gray-500 hover:text-red-400 text-sm"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setGoals(prev => [...prev, ''])}
          className="text-xs text-blue-400 hover:text-blue-300 mt-1"
        >
          + Add goal
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>

      <div className="border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-medium">Members ({members.length})</span>
          {availableAgents.length > 0 && (
            <select
              className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300"
              defaultValue=""
              onChange={e => { if (e.target.value) { handleAddMember(e.target.value); e.target.value = '' } }}
            >
              <option value="">+ Add member</option>
              {availableAgents.map(a => (
                <option key={a.identity.id} value={a.identity.id}>{a.identity.name}</option>
              ))}
            </select>
          )}
        </div>
        {members.length === 0 && <p className="text-gray-600 text-xs">No members yet.</p>}
        {members.map(member => {
          const agent = allAgents.find(a => a.identity.id === member.agentId)
          return (
            <div key={member.agentId} className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-white text-sm">{agent?.identity.name ?? member.agentId}</span>
                <span className="ml-2 text-xs text-gray-500">{member.role}</span>
              </div>
              <button
                onClick={() => handleRemoveMember(member.agentId)}
                className="text-xs text-gray-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-gray-700 pt-4">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete Group
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-red-300">Delete this group? Agents will lose workspace access. Directory is preserved on disk.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded">Confirm Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agent panel ───────────────────────────────────────────────────────────────

function AgentPanel({ slug }: { slug: string }) {
  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    agents.get(slug).then(d => setAgent(d.agent)).catch(console.error)
  }, [slug])

  if (!agent) return <p className="text-gray-500 text-sm">Loading...</p>

  const id = agent.identity
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-white ${id.slug === 'orchestrator' ? 'bg-purple-700' : 'bg-gray-700'}`}>
          {id.name[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-white font-semibold">{id.name}</p>
          <p className="text-gray-500 text-xs font-mono">{id.slug}</p>
        </div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${id.status === 'active' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>
          {id.status}
        </span>
      </div>

      <Row label="Profile" value={agent.profile.name} />
      <Row label="Model tier" value={agent.profile.modelTier ?? '—'} />
      <Row label="Lifecycle" value={id.lifecycleType} />
      <Row label="Wake mode" value={id.wakeMode} />
      <Row label="Shell access" value={id.shellPermissionLevel} />
      {id.autonomousMode !== undefined && (
        <Row label="Autonomous mode" value={id.autonomousMode ? 'On' : 'Off'} />
      )}

      <div className="pt-2 border-t border-gray-700">
        <p className="text-xs text-gray-400 mb-1">Workspace</p>
        <p className="text-xs font-mono text-gray-500 break-all">{id.workspacePath}</p>
        {(id.additionalWorkspacePaths ?? []).map((p, i) => (
          <p key={i} className="text-xs font-mono text-gray-600 break-all mt-0.5">{p}</p>
        ))}
      </div>

      <a
        href={`/dashboard/agents/${slug}?tab=overview`}
        className="block text-center py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg mt-2"
      >
        Open Full Settings
      </a>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-300">{value}</span>
    </div>
  )
}

// ─── Skill panel ───────────────────────────────────────────────────────────────

function SkillPanel({ skillId, agentSlug }: { skillId: string; agentSlug: string }) {
  const [skillData, setSkillData] = useState<Awaited<ReturnType<typeof agentSkills.list>>['skills'][0] | null>(null)

  useEffect(() => {
    agentSkills.list(agentSlug).then(d => {
      const found = d.skills.find(s => s.id === skillId)
      if (found) setSkillData(found)
    }).catch(console.error)
  }, [skillId, agentSlug])

  if (!skillData) return <p className="text-gray-500 text-sm">Loading...</p>

  return (
    <div className="space-y-3">
      <p className="text-white font-semibold">{skillData.name}</p>
      <Row label="Version" value={skillData.version} />
      <Row label="Type" value={skillData.type} />
      {(skillData.manifest.tools ?? []).length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Tools used</p>
          {skillData.manifest.tools!.map(t => (
            <span key={t} className="inline-block text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded mr-1 mb-1">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tool panel ────────────────────────────────────────────────────────────────

function ToolPanel({ toolName, agentSlug }: { toolName: string; agentSlug: string }) {
  return (
    <div className="space-y-3">
      <p className="text-white font-semibold font-mono">{toolName}</p>
      <p className="text-xs text-gray-400">
        Tool permissions and call history are managed in the agent settings.
      </p>
      <a
        href={`/dashboard/agents/${agentSlug}?tab=tools`}
        className="block text-center py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
      >
        Open Tool Settings
      </a>
    </div>
  )
}

// ─── Workspace panel ───────────────────────────────────────────────────────────

function WorkspacePanel({ path, agentSlug }: { path: string; agentSlug?: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')

  useEffect(() => {
    if (!agentSlug) { setLoading(false); return }
    workspace.list(agentSlug, '').then(d => {
      setFiles(d.files)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [agentSlug, path])

  async function openDir(dir: string) {
    if (!agentSlug) return
    const data = await workspace.list(agentSlug, dir)
    setFiles(data.files)
    setCurrentPath(dir)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Path</p>
        <p className="text-xs font-mono text-gray-400 break-all">{path}</p>
      </div>
      {currentPath && (
        <button
          onClick={() => openDir(currentPath.split('/').slice(0, -1).join('/'))}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          ← Back
        </button>
      )}
      {loading && <p className="text-xs text-gray-500">Loading files…</p>}
      <div className="space-y-0.5">
        {files.map(f => (
          <button
            key={f.name}
            onClick={() => f.type === 'dir' ? openDir(currentPath ? `${currentPath}/${f.name}` : f.name) : undefined}
            className="w-full text-left px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 rounded flex items-center gap-2"
          >
            <span className="text-gray-500 w-3 text-center">{f.type === 'dir' ? '▶' : '·'}</span>
            {f.name}
          </button>
        ))}
      </div>
    </div>
  )
}
