// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { routingProfiles, models, type RoutingProfile, type RoutingChainStep } from '@/lib/api'

export function RoutingProfileEditor() {
  const [profileList, setProfileList] = useState<RoutingProfile[]>([])
  const [modelList, setModelList] = useState<Array<{ name: string; provider: string }>>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  function load() {
    routingProfiles.list().then(r => setProfileList(r.profiles)).catch(() => {})
    models.list().then(r => setModelList(r.models)).catch(() => {})
  }

  async function deleteProfile(id: string) {
    try { await routingProfiles.delete(id); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete') }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {profileList.map(p => (
        editingId === p.id
          ? <ProfileForm key={p.id} initial={p} modelList={modelList} onSave={async data => {
              await routingProfiles.update(p.id, data); setEditingId(null); load()
            }} onCancel={() => setEditingId(null)} />
          : (
            <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(p.id)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                  <button onClick={() => void deleteProfile(p.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
              <div className="space-y-1.5 mt-1">
                {p.chain.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`w-16 shrink-0 font-medium ${i === 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                      {i === 0 ? 'Primary' : `Fallback ${i}`}
                    </span>
                    <span className="text-gray-500">{step.provider}</span>
                    <span className="font-mono text-gray-300">{step.model}</span>
                    {step.label && <span className="text-gray-600 italic">— {step.label}</span>}
                  </div>
                ))}
              </div>
            </div>
          )
      ))}

      {creating
        ? <ProfileForm modelList={modelList} onSave={async data => {
            await routingProfiles.create(data as { name: string; description?: string; chain: RoutingChainStep[] })
            setCreating(false); load()
          }} onCancel={() => setCreating(false)} />
        : (
          <button
            onClick={() => setCreating(true)}
            style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
            className="text-sm px-4 py-2 rounded hover:opacity-90 transition-opacity"
          >
            + New routing profile
          </button>
        )
      }
    </div>
  )
}

function ProfileForm({
  initial,
  modelList,
  onSave,
  onCancel,
}: {
  initial?: RoutingProfile
  modelList: Array<{ name: string; provider: string }>
  onSave: (data: { name: string; description: string; chain: RoutingChainStep[] }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [chain, setChain] = useState<RoutingChainStep[]>(
    initial?.chain ?? [{ model: '', provider: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const PROVIDER_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    ollama: 'Ollama (local)',
  }

  const providers = [...new Set(modelList.map(m => m.provider))]

  // For providers with many models (OpenRouter, large Ollama installs),
  // use a text input + datalist rather than a select dropdown
  function isLargeProvider(provider: string) {
    return modelList.filter(m => m.provider === provider).length > 20
  }

  function updateStep(i: number, field: keyof RoutingChainStep, value: string) {
    setChain(c => c.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  function addStep() { setChain(c => [...c, { model: '', provider: '' }]) }
  function removeStep(i: number) { setChain(c => c.filter((_, idx) => idx !== i)) }
  function moveUp(i: number) {
    if (i === 0) return
    setChain(c => { const n = [...c]; [n[i-1]!, n[i]!] = [n[i]!, n[i-1]!]; return n })
  }
  function moveDown(i: number) {
    if (i === chain.length - 1) return
    setChain(c => { const n = [...c]; [n[i]!, n[i+1]!] = [n[i+1]!, n[i]!]; return n })
  }

  async function submit() {
    if (!name.trim()) { setErr('Name is required'); return }
    if (chain.some(s => !s.model || !s.provider)) { setErr('All steps need a model and provider'); return }
    setSaving(true); setErr('')
    try { await onSave({ name: name.trim(), description: description.trim(), chain }) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setSaving(false) }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-4">
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">The first model is the primary. Models below it are fallbacks tried in order if the primary is unavailable or errors.</p>
        <div className="space-y-2">
          {chain.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`text-xs w-16 shrink-0 font-medium ${i === 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                {i === 0 ? 'Primary' : `Fallback ${i}`}
              </span>
              <select value={step.provider} onChange={e => {
                updateStep(i, 'provider', e.target.value)
                updateStep(i, 'model', '') // reset model when provider changes
              }}
                className="bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded px-1.5 py-1 focus:outline-none">
                <option value="">Provider…</option>
                {providers.map(p => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>
                ))}
              </select>
              {step.provider && isLargeProvider(step.provider) ? (
                <>
                  <input
                    list={`models-${i}`}
                    value={step.model}
                    onChange={e => updateStep(i, 'model', e.target.value)}
                    placeholder="Type model name…"
                    className="flex-1 bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded px-1.5 py-1 focus:outline-none"
                  />
                  <datalist id={`models-${i}`}>
                    {modelList.filter(m => m.provider === step.provider).map(m => (
                      <option key={m.name} value={m.name} />
                    ))}
                  </datalist>
                </>
              ) : (
                <select value={step.model} onChange={e => updateStep(i, 'model', e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded px-1.5 py-1 focus:outline-none">
                  <option value="">Model…</option>
                  {modelList.filter(m => !step.provider || m.provider === step.provider).map(m =>
                    <option key={m.name} value={m.name}>{m.name}</option>
                  )}
                </select>
              )}
              <input value={step.label ?? ''} onChange={e => updateStep(i, 'label', e.target.value)}
                placeholder="label (opt)"
                className="w-24 bg-gray-800 border border-gray-700 text-xs text-gray-400 rounded px-1.5 py-1 focus:outline-none" />
              <button onClick={() => moveUp(i)} className="text-gray-600 hover:text-gray-400 text-xs" title="Move up">↑</button>
              <button onClick={() => moveDown(i)} className="text-gray-600 hover:text-gray-400 text-xs" title="Move down">↓</button>
              {chain.length > 1 && (
                <button onClick={() => removeStep(i)} className="text-red-600 hover:text-red-400 text-xs" title="Remove">✕</button>
              )}
            </div>
          ))}
          <button onClick={addStep} className="text-xs text-blue-400 hover:text-blue-300 mt-1">+ Add step</button>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={() => void submit()} disabled={saving}
          style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
          className="text-sm px-3 py-1.5 rounded disabled:opacity-50 hover:opacity-90 transition-opacity">
          {saving ? 'Saving…' : (initial ? 'Update' : 'Create')}
        </button>
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-300 px-3 py-1.5 transition-colors">Cancel</button>
      </div>
    </div>
  )
}
