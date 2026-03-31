// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

'use client'

import { useEffect, useState } from 'react'
import { skills, type Skill, type LibrarySkill } from '@/lib/api'

export default function SkillsPage() {
  const [installed, setInstalled] = useState<Skill[]>([])
  const [library, setLibrary] = useState<LibrarySkill[]>([])
  const [tab, setTab] = useState<'installed' | 'library'>('installed')
  const [loading, setLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const [installedError, setInstalledError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    loadInstalled()
  }, [])

  function loadInstalled() {
    setLoading(true)
    skills.list()
      .then(r => setInstalled(r.skills))
      .catch(err => setInstalledError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  function loadLibrary() {
    setLoading(true)
    setLibraryError('')
    skills.library()
      .then(r => setLibrary(r.skills))
      .catch(err => setLibraryError(err instanceof Error ? err.message : 'Failed to load library'))
      .finally(() => setLoading(false))
  }

  function switchTab(t: 'installed' | 'library') {
    setTab(t)
    setActionMsg('')
    if (t === 'library') loadLibrary()
    else loadInstalled()
  }

  async function install(name: string) {
    try {
      await skills.install(name)
      setActionMsg(`${name} installed`)
      loadLibrary()
      loadInstalled()
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Install failed')
    }
  }

  async function uninstall(name: string) {
    try {
      await skills.remove(name)
      setActionMsg(`${name} removed (restart required)`)
      loadLibrary()
      loadInstalled()
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  async function remove(name: string) {
    try {
      await skills.remove(name)
      setActionMsg(`${name} removed (restart required)`)
      loadInstalled()
    } catch (err) {
      setInstalledError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  async function toggle(skill: Skill) {
    setToggling(skill.id)
    try {
      if (skill.status === 'active') {
        await skills.disable(skill.name)
      } else {
        await skills.enable(skill.name)
      }
      loadInstalled()
    } catch (err) {
      setInstalledError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Skills</h1>
        <p className="text-sm text-gray-500 mt-1">Manage installed skills and browse the library</p>
      </div>

      {actionMsg && <p className="text-sm text-green-400 mb-4">{actionMsg}</p>}

      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {(['installed', 'library'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              tab === t
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : tab === 'installed' ? (
        <>
          {installedError && <p className="text-sm text-red-400 mb-4">{installedError}</p>}
          {installed.length === 0 ? (
            <p className="text-sm text-gray-600">No skills installed. Browse the library to install one.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Version</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {installed.map(skill => (
                    <tr key={skill.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-mono text-white">{skill.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{skill.version}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{skill.manifest.description ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          skill.status === 'active'
                            ? 'bg-green-900/50 text-green-400'
                            : skill.status === 'pending_restart'
                            ? 'bg-yellow-900/50 text-yellow-400'
                            : 'bg-gray-800 text-gray-500'
                        }`}>
                          {skill.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => void toggle(skill)}
                            disabled={toggling === skill.id}
                            className={`text-xs transition-colors disabled:opacity-50 ${
                              skill.status === 'active'
                                ? 'text-yellow-400 hover:text-yellow-300'
                                : 'text-green-400 hover:text-green-300'
                            }`}
                          >
                            {toggling === skill.id ? '…' : skill.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => void remove(skill.name)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {libraryError && <p className="text-sm text-red-400 mb-4">{libraryError}</p>}
          {library.length === 0 && !libraryError ? (
            <p className="text-sm text-gray-600">No skills found in library.</p>
          ) : library.length > 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Version</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {library.map(skill => (
                    <tr key={skill.name} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-mono text-white">{skill.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{skill.version}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{skill.description}</td>
                      <td className="px-4 py-3 text-right">
                        {skill.installed ? (
                          <button
                            onClick={() => void uninstall(skill.name)}
                            className="text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5 transition-colors"
                          >
                            Uninstall
                          </button>
                        ) : (
                          <button
                            onClick={() => void install(skill.name)}
                            className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 border border-blue-800 rounded px-2 py-0.5 transition-colors"
                          >
                            Install
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
